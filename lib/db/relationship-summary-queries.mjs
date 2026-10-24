import { query, queryOne, withTransaction } from './connection.mjs';

export async function upsertRelationshipSummary(summary) {
  const sql = `
    INSERT INTO relationship_summaries (
      summary_key, title, description, relationship_type,
      key_entities, action_signature, location_key,
      time_start, time_end, summary_kind, time_bucket,
      detail_status, detail_requested_at, generated_by, metadata, updated_at
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, $13, $14::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (summary_key)
    DO UPDATE SET
      title = COALESCE(EXCLUDED.title, relationship_summaries.title),
      description = COALESCE(EXCLUDED.description, relationship_summaries.description),
      relationship_type = EXCLUDED.relationship_type,
      key_entities = (
        SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(relationship_summaries.key_entities, '[]'::jsonb)) AS value
          UNION
          SELECT jsonb_array_elements_text(COALESCE(EXCLUDED.key_entities, '[]'::jsonb)) AS value
        ) merged
      ),
      action_signature = COALESCE(relationship_summaries.action_signature, EXCLUDED.action_signature),
      location_key = COALESCE(relationship_summaries.location_key, EXCLUDED.location_key),
      summary_kind = EXCLUDED.summary_kind,
      time_bucket = EXCLUDED.time_bucket,
      time_start = CASE
        WHEN relationship_summaries.time_start IS NULL THEN EXCLUDED.time_start
        WHEN EXCLUDED.time_start IS NULL THEN relationship_summaries.time_start
        ELSE LEAST(relationship_summaries.time_start, EXCLUDED.time_start)
      END,
      time_end = CASE
        WHEN relationship_summaries.time_end IS NULL THEN EXCLUDED.time_end
        WHEN EXCLUDED.time_end IS NULL THEN relationship_summaries.time_end
        ELSE GREATEST(relationship_summaries.time_end, EXCLUDED.time_end)
      END,
      detail_status = CASE
        WHEN relationship_summaries.detail_status = 'running' THEN relationship_summaries.detail_status
        ELSE COALESCE(EXCLUDED.detail_status, relationship_summaries.detail_status, 'pending')
      END,
      detail_requested_at = COALESCE(EXCLUDED.detail_requested_at, relationship_summaries.detail_requested_at),
      generated_by = EXCLUDED.generated_by,
      metadata = COALESCE(relationship_summaries.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const result = await query(sql, [
    summary.summary_key,
    summary.title,
    summary.description || null,
    summary.relationship_type,
    JSON.stringify(summary.key_entities || []),
    summary.action_signature || null,
    summary.location_key || null,
    summary.time_start || null,
    summary.time_end || null,
    summary.summary_kind || (summary.relationship_type === 'isolated' ? 'isolated' : 'relationship'),
    summary.time_bucket || null,
    summary.detail_status || 'pending',
    summary.generated_by || 'rule',
    JSON.stringify(summary.metadata || {})
  ]);

  return result.rows[0];
}

export async function findMatchingRelationshipSummaries(proto, options = {}) {
  const timeWindowDays = Number(options.timeWindowDays || 30);
  const effectiveTime = proto?.event_time || proto?.news_published_at || proto?.effective_time || proto?.created_at || new Date().toISOString();
  const timeBucket = options.timeBucket || buildTimeBucket(effectiveTime);
  const params = [effectiveTime, timeWindowDays, timeBucket];
  const conditions = [
    `rs.time_bucket = $3`,
    `COALESCE(rs.summary_status, 'active') = 'active'`,
    `rs.summary_key LIKE 'kind:%'`,
    `(
      rs.time_start IS NULL
      OR rs.time_end IS NULL
      OR tstzrange(rs.time_start - ($2::int * INTERVAL '1 day'), rs.time_end + ($2::int * INTERVAL '1 day'), '[]') @> $1::timestamptz
    )`
  ];

  if (options.includeIsolated !== true) {
    conditions.push(`COALESCE(rs.summary_kind, 'relationship') <> 'isolated'`);
  }

  const overlapConditions = [];
  const addParam = value => {
    params.push(value);
    return `$${params.length}`;
  };

  const entityKeys = collectProtoEntityKeys(proto);
  if (entityKeys.length > 0) {
    overlapConditions.push(`rs.key_entities ?| ${addParam(entityKeys)}::text[]`);
  }

  const actionSignature = buildActionSignatureFromProto(proto);
  if (actionSignature) {
    overlapConditions.push(`rs.action_signature = ${addParam(actionSignature)}`);
  }

  const locationKey = buildLocationKeyFromProto(proto);
  if (locationKey) {
    overlapConditions.push(`rs.location_key = ${addParam(locationKey)}`);
  }

  if (overlapConditions.length === 0) return [];
  conditions.push(`(${overlapConditions.join(' OR ')})`);

  const sql = `
    SELECT rs.*
    FROM relationship_summaries rs
    WHERE ${conditions.join(' AND ')}
    ORDER BY rs.member_count DESC, rs.edge_count DESC, rs.created_at ASC, rs.id ASC;
  `;

  const result = await query(sql, params);
  return result.rows;
}

export async function findSummaryByKey(summaryKey) {
  return queryOne('SELECT * FROM relationship_summaries WHERE summary_key = $1::text', [summaryKey]);
}

export async function getSummaryMemberProtoEvents(summaryIds = [], options = {}) {
  const ids = [...new Set((summaryIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0) return [];

  const params = [ids];
  const conditions = ['rsm.summary_id = ANY($1::int[])'];

  if (options.excludeProtoEventId) {
    params.push(Number(options.excludeProtoEventId));
    conditions.push(`pe.id <> $${params.length}`);
  }

  const sql = `
    SELECT DISTINCT ON (pe.id)
      pe.*,
      COALESCE(pe.event_time, n.published_at, pe.created_at) AS effective_time,
      n.title AS news_title,
      n.source AS news_source,
      n.published_at AS news_published_at,
      actor.canonical_name AS actor_name,
      object_entity.canonical_name AS object_name,
      location.canonical_name AS location_name,
      sa.display_name AS action_name,
      sa.action_key AS action_key
    FROM relationship_summary_members rsm
    JOIN proto_events pe ON pe.id = rsm.proto_event_id
    LEFT JOIN news n ON n.id = pe.news_id
    LEFT JOIN entity_mapping actor ON actor.id = pe.actor_entity_id
    LEFT JOIN entity_mapping object_entity ON object_entity.id = pe.object_entity_id
    LEFT JOIN entity_mapping location ON location.id = pe.location_id
    LEFT JOIN standard_actions sa ON sa.id = pe.action_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY pe.id, COALESCE(pe.event_time, n.published_at, pe.created_at), pe.id;
  `;

  const result = await query(sql, params);
  return result.rows;
}

export async function linkProtoEventToSummary(summaryId, protoEventId, role = 'member') {
  const sql = `
    INSERT INTO relationship_summary_members (summary_id, proto_event_id, role, first_seen_at, last_seen_at)
    VALUES ($1::int, $2::int, $3::text, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (summary_id, proto_event_id)
    DO UPDATE SET
      role = COALESCE(EXCLUDED.role, relationship_summary_members.role),
      last_seen_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;
  const result = await query(sql, [summaryId, protoEventId, role]);
  return result.rows[0];
}

export async function enqueueRelationshipSummaryJob(summaryId, options = {}) {
  const payload = options.payload || {};
  const jobType = options.jobType || 'detail_rebuild';
  const priority = Number(options.priority || 0);
  const maxAttempts = Number(options.maxAttempts || 3);
  const t0 = Date.now();
  const sql = `
    INSERT INTO relationship_summary_jobs (
      summary_id, job_type, status, priority, payload, max_attempts, run_after, created_at, updated_at
    )
    VALUES ($1::int, $2::text, 'pending', $3::int, $4::jsonb, $5::int, COALESCE($6::timestamptz, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (summary_id, job_type) WHERE status IN ('pending', 'running')
    DO UPDATE SET
      priority = GREATEST(relationship_summary_jobs.priority, EXCLUDED.priority),
      payload = CASE
        WHEN EXCLUDED.job_type = 'summary_merge' THEN jsonb_set(
          COALESCE(relationship_summary_jobs.payload, '{}'::jsonb) || COALESCE(EXCLUDED.payload, '{}'::jsonb),
          '{summary_ids}',
          (
            SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
            FROM (
              SELECT jsonb_array_elements(COALESCE(relationship_summary_jobs.payload->'summary_ids', '[]'::jsonb)) AS value
              UNION
              SELECT jsonb_array_elements(COALESCE(EXCLUDED.payload->'summary_ids', '[]'::jsonb)) AS value
            ) merged_summary_ids
          ),
          true
        )
        ELSE COALESCE(relationship_summary_jobs.payload, '{}'::jsonb) || COALESCE(EXCLUDED.payload, '{}'::jsonb)
      END,
      run_after = LEAST(relationship_summary_jobs.run_after, EXCLUDED.run_after),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;
  const result = await query(sql, [
    summaryId,
    jobType,
    priority,
    JSON.stringify(payload),
    maxAttempts,
    options.runAfter || null
  ]);
  const elapsed1 = Date.now() - t0;

  const t1 = Date.now();
  await query(`
    UPDATE relationship_summaries
    SET detail_status = CASE WHEN $2::text = 'summary_merge' THEN detail_status WHEN detail_status = 'running' THEN detail_status ELSE 'pending' END,
        detail_requested_at = CURRENT_TIMESTAMP,
        detail_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1::int
  `, [summaryId, jobType]);
  const elapsed2 = Date.now() - t1;
  if (elapsed1 + elapsed2 > 200) {
    console.log(`[DB] enqueueRelationshipSummaryJob slow summary=${summaryId} type=${jobType} insert=${elapsed1}ms update=${elapsed2}ms`);
  }
  return result.rows[0];
}

export async function claimRelationshipSummaryJobs(options = {}) {
  const limit = Math.max(parseInt(options.limit || '10', 10), 1);
  const workerId = options.workerId || `atomic-summary-worker:${process.pid}`;
  const staleAfterMs = Number(options.staleAfterMs || 15 * 60 * 1000);
  const jobTypes = Array.isArray(options.jobTypes)
    ? options.jobTypes.filter(Boolean)
    : (options.jobType ? [options.jobType] : null);
  const sql = `
    WITH stale AS (
      UPDATE relationship_summary_jobs
      SET status = 'pending', locked_by = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE status = 'running'
        AND locked_at < (CURRENT_TIMESTAMP - ($3::int * INTERVAL '1 millisecond'))
        AND ($4::text[] IS NULL OR job_type = ANY($4::text[]))
      RETURNING id
    ),
    picked AS (
      SELECT id
      FROM relationship_summary_jobs
      WHERE status = 'pending'
        AND run_after <= CURRENT_TIMESTAMP
        AND attempts < max_attempts
        AND ($4::text[] IS NULL OR job_type = ANY($4::text[]))
      ORDER BY priority DESC, run_after ASC, id ASC
      LIMIT $1::int
      FOR UPDATE SKIP LOCKED
    )
    UPDATE relationship_summary_jobs jobs
    SET status = 'running',
        locked_by = $2::text,
        locked_at = CURRENT_TIMESTAMP,
        attempts = attempts + 1,
        updated_at = CURRENT_TIMESTAMP
    FROM picked
    WHERE jobs.id = picked.id
    RETURNING jobs.*;
  `;
  const result = await query(sql, [limit, workerId, staleAfterMs, jobTypes && jobTypes.length > 0 ? jobTypes : null]);
  return result.rows;
}

export async function resetFailedRelationshipSummaryJobs(options = {}) {
  const jobTypes = Array.isArray(options.jobTypes)
    ? options.jobTypes.filter(Boolean)
    : (options.jobType ? [options.jobType] : null);
  const result = await query(`
    UPDATE relationship_summary_jobs
    SET status = 'pending',
        attempts = 0,
        locked_by = NULL,
        locked_at = NULL,
        run_after = CURRENT_TIMESTAMP,
        error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'failed'
      AND ($1::text[] IS NULL OR job_type = ANY($1::text[]))
    RETURNING *;
  `, [jobTypes && jobTypes.length > 0 ? jobTypes : null]);
  return result.rows;
}

export async function completeRelationshipSummaryJob(jobId, resultPayload = {}) {
  const sql = `
    UPDATE relationship_summary_jobs
    SET status = 'completed',
        payload = COALESCE(payload, '{}'::jsonb) || $2::jsonb,
        locked_by = NULL,
        locked_at = NULL,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1::int
    RETURNING *;
  `;
  const result = await query(sql, [jobId, JSON.stringify({ result: resultPayload })]);
  return result.rows[0] || null;
}

export async function failRelationshipSummaryJob(job, error, options = {}) {
  const retryDelayMs = Number(options.retryDelayMs || 60 * 1000);
  const message = String(error?.message || error || 'Unknown error').slice(0, 2000);
  const shouldRetry = Number(job.attempts || 0) < Number(job.max_attempts || 3);
  const sql = `
    UPDATE relationship_summary_jobs
    SET status = $2::text,
        error = $3::text,
        locked_by = NULL,
        locked_at = NULL,
        run_after = CASE WHEN $2::text = 'pending' THEN CURRENT_TIMESTAMP + ($4::int * INTERVAL '1 millisecond') ELSE run_after END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1::int
    RETURNING *;
  `;
  const result = await query(sql, [job.id, shouldRetry ? 'pending' : 'failed', message, retryDelayMs]);

  if (shouldRetry) {
    await query(`
      UPDATE relationship_summaries
      SET detail_status = 'pending', detail_error = $2::text, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::int
    `, [job.summary_id, message]);
  } else {
    await query(`
      UPDATE relationship_summaries
      SET detail_status = 'failed', detail_error = $2::text, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::int
    `, [job.summary_id, message]);
  }

  return result.rows[0] || null;
}

export async function markRelationshipSummaryDetailRunning(summaryId) {
  await query(`
    UPDATE relationship_summaries
    SET detail_status = 'running', detail_started_at = CURRENT_TIMESTAMP, detail_error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1::int
  `, [summaryId]);
}

export async function markRelationshipSummaryDetailCompleted(summaryId) {
  await query(`
    UPDATE relationship_summaries
    SET detail_status = 'completed', detail_completed_at = CURRENT_TIMESTAMP, detail_error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1::int
  `, [summaryId]);
}

export async function listRelationshipSummaryIds(options = {}) {
  const params = [];
  const conditions = [];
  if (options.detailStatus) {
    params.push(options.detailStatus);
    conditions.push(`detail_status = $${params.length}`);
  }
  if (options.summaryKind) {
    params.push(options.summaryKind);
    conditions.push(`summary_kind = $${params.length}`);
  }
  if (options.summaryStatus) {
    params.push(options.summaryStatus);
    conditions.push(`COALESCE(summary_status, 'active') = $${params.length}`);
  }
  if (options.v2Only !== false) {
    conditions.push(`summary_key LIKE 'kind:%'`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT id FROM relationship_summaries ${whereClause} ORDER BY id`;
  const result = await query(sql, params);
  return result.rows.map(row => row.id);
}

export async function getUnassignedProtoEventsPage(options = {}) {
  const limit = Math.max(parseInt(options.limit || '200', 10), 1);
  const params = [];
  const conditions = [`NOT EXISTS (
    SELECT 1 FROM relationship_summary_members rsm WHERE rsm.proto_event_id = pe.id
  )`];
  if (options.since) {
    params.push(options.since);
    conditions.push(`COALESCE(pe.event_time, n.published_at, pe.created_at) >= $${params.length}::timestamptz`);
  }
  if (options.afterTime) {
    params.push(options.afterTime);
    const afterTimeParam = `$${params.length}`;
    params.push(Number(options.afterId || 0));
    const afterIdParam = `$${params.length}`;
    conditions.push(`(COALESCE(pe.event_time, n.published_at, pe.created_at), pe.id) > (${afterTimeParam}::timestamptz, ${afterIdParam}::int)`);
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  const sql = `
    SELECT
      pe.*,
      COALESCE(pe.event_time, n.published_at, pe.created_at) AS effective_time,
      n.title AS news_title,
      n.source AS news_source,
      n.published_at AS news_published_at,
      actor.canonical_name AS actor_name,
      object_entity.canonical_name AS object_name,
      location.canonical_name AS location_name,
      sa.display_name AS action_name,
      sa.action_key AS action_key
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    LEFT JOIN entity_mapping actor ON actor.id = pe.actor_entity_id
    LEFT JOIN entity_mapping object_entity ON object_entity.id = pe.object_entity_id
    LEFT JOIN entity_mapping location ON location.id = pe.location_id
    LEFT JOIN standard_actions sa ON sa.id = pe.action_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY COALESCE(pe.event_time, n.published_at, pe.created_at), pe.id
    LIMIT ${limitParam};
  `;
  const result = await query(sql, params);
  return result.rows;
}

export async function countUnassignedProtoEvents(options = {}) {
  const params = [];
  const conditions = [`NOT EXISTS (
    SELECT 1 FROM relationship_summary_members rsm WHERE rsm.proto_event_id = pe.id
  )`];
  if (options.since) {
    params.push(options.since);
    conditions.push(`COALESCE(pe.event_time, n.published_at, pe.created_at) >= $${params.length}::timestamptz`);
  }
  const sql = `
    SELECT COUNT(*)::int AS total
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    WHERE ${conditions.join(' AND ')}
  `;
  const result = await query(sql, params);
  return Number(result.rows[0]?.total || 0);
}

export async function linkAtomicRelationshipToSummary(summaryId, atomicRelationshipId) {
  const sql = `
    INSERT INTO relationship_summary_edges (summary_id, atomic_relationship_id)
    VALUES ($1::int, $2::int)
    ON CONFLICT (summary_id, atomic_relationship_id) DO NOTHING
    RETURNING *;
  `;
  const result = await query(sql, [summaryId, atomicRelationshipId]);
  return result.rows[0] || null;
}

export async function bulkLinkAtomicRelationshipsToSummary(summaryId, atomicRelationshipIds) {
  if (!atomicRelationshipIds || atomicRelationshipIds.length === 0) return;
  const sql = `
    INSERT INTO relationship_summary_edges (summary_id, atomic_relationship_id)
    SELECT $1::int, unnest($2::int[])
    ON CONFLICT (summary_id, atomic_relationship_id) DO NOTHING
  `;
  await query(sql, [summaryId, atomicRelationshipIds]);
}

export async function completeSummaryJobAndRefreshStats(jobId, summaryId, resultPayload = {}) {
  const sql = `
    WITH job_update AS (
      UPDATE relationship_summary_jobs
      SET status = 'completed',
          payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb,
          locked_by = NULL,
          locked_at = NULL,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::int
      RETURNING summary_id
    ),
    summary_update AS (
      UPDATE relationship_summaries
      SET detail_status = 'completed',
          detail_completed_at = CURRENT_TIMESTAMP,
          detail_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2::int
    ),
    member_stats AS (
      SELECT
        COUNT(DISTINCT rsm.proto_event_id)::int AS member_count,
        MIN(COALESCE(pe.event_time, n.published_at, pe.created_at)) AS time_start,
        MAX(COALESCE(pe.event_time, n.published_at, pe.created_at)) AS time_end
      FROM relationship_summary_members rsm
      JOIN proto_events pe ON pe.id = rsm.proto_event_id
      LEFT JOIN news n ON n.id = pe.news_id
      WHERE rsm.summary_id = $2::int
    ),
    edge_stats AS (
      SELECT
        COUNT(DISTINCT rse.atomic_relationship_id)::int AS edge_count,
        COALESCE(AVG(ar.confidence), 0)::float AS avg_confidence
      FROM relationship_summary_edges rse
      JOIN atomic_event_relationships ar ON ar.id = rse.atomic_relationship_id
      WHERE rse.summary_id = $2::int
    ),
    final_update AS (
      UPDATE relationship_summaries rs
      SET member_count = COALESCE(ms.member_count, 0),
          edge_count = COALESCE(es.edge_count, 0),
          avg_confidence = COALESCE(es.avg_confidence, 0),
          time_start = COALESCE(ms.time_start, rs.time_start),
          time_end = COALESCE(ms.time_end, rs.time_end),
          updated_at = CURRENT_TIMESTAMP
      FROM member_stats ms, edge_stats es
      WHERE rs.id = $2::int
      RETURNING rs.edge_count, rs.avg_confidence, rs.member_count
    )
    SELECT edge_count, avg_confidence, member_count FROM final_update;
  `;
  const result = await query(sql, [jobId, summaryId, JSON.stringify({ result: resultPayload })]);
  return result.rows[0] || null;
}

export async function refreshRelationshipSummaryStats(summaryId) {
  const sql = `
    WITH member_stats AS (
      SELECT
        COUNT(DISTINCT rsm.proto_event_id)::int AS member_count,
        MIN(COALESCE(pe.event_time, n.published_at, pe.created_at)) AS time_start,
        MAX(COALESCE(pe.event_time, n.published_at, pe.created_at)) AS time_end
      FROM relationship_summary_members rsm
      JOIN proto_events pe ON pe.id = rsm.proto_event_id
      LEFT JOIN news n ON n.id = pe.news_id
      WHERE rsm.summary_id = $1::int
    ),
    edge_stats AS (
      SELECT
        COUNT(DISTINCT rse.atomic_relationship_id)::int AS edge_count,
        COALESCE(AVG(ar.confidence), 0)::float AS avg_confidence
      FROM relationship_summary_edges rse
      JOIN atomic_event_relationships ar ON ar.id = rse.atomic_relationship_id
      WHERE rse.summary_id = $1::int
    )
    UPDATE relationship_summaries rs
    SET
      member_count = COALESCE(ms.member_count, 0),
      edge_count = COALESCE(es.edge_count, 0),
      avg_confidence = COALESCE(es.avg_confidence, 0),
      time_start = COALESCE(ms.time_start, rs.time_start),
      time_end = COALESCE(ms.time_end, rs.time_end),
      updated_at = CURRENT_TIMESTAMP
    FROM member_stats ms, edge_stats es
    WHERE rs.id = $1::int
    RETURNING rs.*;
  `;
  const result = await query(sql, [summaryId]);
  return result.rows[0] || null;
}

export async function getRelationshipSummariesPage(options = {}) {
  const page = Math.max(parseInt(options.page || '1', 10), 1);
  const limit = Math.max(parseInt(options.limit || '50', 10), 1);
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  const addParam = value => {
    params.push(value);
    return `$${params.length}`;
  };

  if (options.relationshipType) {
    conditions.push(`relationship_type = ${addParam(options.relationshipType)}`);
  }

  if (options.q) {
    const param = addParam(`%${options.q}%`);
    conditions.push(`(title ILIKE ${param} OR description ILIKE ${param} OR summary_key ILIKE ${param})`);
  }

  if (options.summaryStatus !== false) {
    conditions.push(`COALESCE(summary_status, 'active') = ${addParam(options.summaryStatus || 'active')}`);
  }

  if (options.v2Only !== false) {
    conditions.push(`summary_key LIKE 'kind:%'`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const dataSql = `
    SELECT *
    FROM relationship_summaries
    ${whereClause}
    ORDER BY updated_at DESC, id DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;
  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM relationship_summaries
    ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    query(dataSql, params),
    query(countSql, params.slice(0, params.length - 2))
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.total || 0)
  };
}

export async function getRelationshipSummaryById(summaryId) {
  return queryOne('SELECT * FROM relationship_summaries WHERE id = $1::int', [summaryId]);
}

/**
 * 获取特定 Summary 内部的原子节点与原子边 (用于下钻展示)
 */
export async function getRelationshipSummaryGraph(summaryId, options = {}) {
  const summary = await getRelationshipSummaryById(summaryId);
  if (!summary) return null;

  const limitEdges = options.limitEdges || 80;
  const limitNodes = options.limitNodes || 60;

  // 1. 获取核心边 (Top weighted/confident)
  const edgesSql = `
    SELECT ar.*
    FROM relationship_summary_edges rse
    JOIN atomic_event_relationships ar ON ar.id = rse.atomic_relationship_id
    WHERE rse.summary_id = $1::int
    ORDER BY ar.weight DESC, ar.confidence DESC, ar.id
    LIMIT $2::int
  `;
  const edgesResult = await query(edgesSql, [summaryId, limitEdges]);
  const edgesData = edgesResult.rows;

  // 2. 收集这些边涉及的节点 ID
  const coreNodeIds = new Set();
  edgesData.forEach(e => {
    coreNodeIds.add(e.source_proto_event_id);
    coreNodeIds.add(e.target_proto_event_id);
  });

  // 3. 如果节点数不足，补充一些最近的节点
  if (coreNodeIds.size < limitNodes) {
    const supplementSql = `
      SELECT proto_event_id 
      FROM relationship_summary_members 
      WHERE summary_id = $1::int 
      LIMIT $2::int
    `;
    const supplementResult = await query(supplementSql, [summaryId, limitNodes]);
    supplementResult.rows.forEach(r => {
      if (coreNodeIds.size < limitNodes) {
        coreNodeIds.add(r.proto_event_id);
      }
    });
  }

  const finalNodeIds = Array.from(coreNodeIds);
  if (finalNodeIds.length === 0) {
    return { summary, nodes: [], edges: [] };
  }

  // 4. 获取节点详情
  const nodesSql = `
    SELECT 
      pe.id, 
      pe.actor_raw,
      pe.action_raw,
      pe.object_raw,
      pe.location_raw,
      pe.event_time,
      pe.extraction_confidence,
      n.title AS news_title,
      actor.canonical_name AS actor_name,
      object_entity.canonical_name AS object_name,
      location.canonical_name AS location_name
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    LEFT JOIN entity_mapping actor ON actor.id = pe.actor_entity_id
    LEFT JOIN entity_mapping object_entity ON object_entity.id = pe.object_entity_id
    LEFT JOIN entity_mapping location ON location.id = pe.location_id
    WHERE pe.id = ANY($1::int[])
    ORDER BY COALESCE(pe.event_time, n.published_at, pe.created_at), pe.id;
  `;
  const nodesResult = await query(nodesSql, [finalNodeIds]);

  const nodes = nodesResult.rows.map(row => {
    const actor = row.actor_name || row.actor_raw || '未知主体';
    const action = row.action_raw || '行动';
    const obj = row.object_name || row.object_raw || '';
    const loc = row.location_name || row.location_raw ? `(于 ${row.location_name || row.location_raw})` : '';
    
    return {
      id: row.id,
      title: `${actor} ${action} ${obj}`.trim(),
      description: `来源新闻: ${row.news_title || '无标题'}\n${loc}`,
      event_type: '原子事件',
      event_time: row.event_time,
      confidence: Number(row.extraction_confidence || 0),
    };
  });

  // 5. [Core Optimization] 动态在内存中根据 event_time 时序推导 temporal 边
  const temporalEdges = [];
  const nodesWithTime = nodes
    .filter(n => n.event_time)
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

  for (let i = 0; i < nodesWithTime.length - 1; i++) {
    const sourceNode = nodesWithTime[i];
    const targetNode = nodesWithTime[i + 1];
    temporalEdges.push({
      id: `temp-${sourceNode.id}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      type: 'temporal',
      confidence: 1.0,
      weight: 0.5,
      description: '动态时序推导关联',
      evidence: {}
    });
  }

  // 合并物理边与动态推导出的时序边
  const edges = [
    ...edgesData.map(row => ({
      id: row.id,
      source: row.source_proto_event_id,
      target: row.target_proto_event_id,
      type: row.relationship_type,
      confidence: Number(row.confidence || 0),
      weight: Number(row.weight || 0),
      description: row.description,
      evidence: row.evidence || {}
    })),
    ...temporalEdges
  ];

  return {
    summary,
    nodes,
    edges
  };
}

/**
 * 获取全局 Relationship Summary 之间的关联图 (用于宏观展示)
 * 支持共享物理边及共享原子节点（桥接事件 Bridge Event）双重关联计算
 */
export async function getGlobalRelationshipSummaryGraph(options = {}) {
  const limit = Math.max(parseInt(options.limit || '100', 10), 1);
  const source = String(options.source || '').trim().toLowerCase();
  const conditions = [];
  const params = [];
  const addParam = value => {
    params.push(value);
    return `$${params.length}`;
  };

  if (options.minMemberCount) {
    conditions.push(`rs.member_count >= ${addParam(options.minMemberCount)}`);
  }

  if (source) {
    conditions.push(`EXISTS (
      SELECT 1
      FROM relationship_summary_members source_rsm
      JOIN proto_events source_pe ON source_pe.id = source_rsm.proto_event_id
      LEFT JOIN news source_news ON source_news.id = source_pe.news_id
      WHERE source_rsm.summary_id = rs.id
        AND LOWER(COALESCE(NULLIF(BTRIM(source_news.source), ''), 'unknown')) = ${addParam(source)}::text
    )`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const nodesSql = `
    WITH selected_summaries AS (
      SELECT 
        rs.id, rs.title, rs.description, rs.member_count, rs.edge_count, 
        rs.time_start, rs.time_end, rs.relationship_type, rs.summary_kind, rs.updated_at
      FROM relationship_summaries rs
      ${whereClause}
      ORDER BY rs.member_count DESC, rs.updated_at DESC
      LIMIT ${limit}
    ),
    source_rows AS (
      SELECT
        ss.id AS summary_id,
        LOWER(COALESCE(NULLIF(BTRIM(n.source), ''), 'unknown')) AS source,
        COUNT(rsm.proto_event_id)::int AS source_count
      FROM selected_summaries ss
      JOIN relationship_summary_members rsm ON rsm.summary_id = ss.id
      JOIN proto_events pe ON pe.id = rsm.proto_event_id
      LEFT JOIN news n ON n.id = pe.news_id
      GROUP BY ss.id, LOWER(COALESCE(NULLIF(BTRIM(n.source), ''), 'unknown'))
    ),
    source_stats AS (
      SELECT
        summary_id,
        ARRAY_AGG(source ORDER BY source_count DESC, source ASC) AS sources,
        JSONB_OBJECT_AGG(source, source_count ORDER BY source) AS source_counts,
        (ARRAY_AGG(source ORDER BY source_count DESC, source ASC))[1] AS primary_source
      FROM source_rows
      GROUP BY summary_id
    )
    SELECT
      ss.id, ss.title, ss.description, ss.member_count, ss.edge_count,
      ss.time_start, ss.time_end, ss.relationship_type, ss.summary_kind,
      COALESCE(sst.sources, ARRAY[]::text[]) AS sources,
      COALESCE(sst.source_counts, '{}'::jsonb) AS source_counts,
      sst.primary_source
    FROM selected_summaries ss
    LEFT JOIN source_stats sst ON sst.summary_id = ss.id
    ORDER BY ss.member_count DESC, ss.updated_at DESC
  `;

  const nodesResult = await query(nodesSql, params);
  const nodes = nodesResult.rows;
  const nodeIds = nodes.map(n => n.id);

  if (nodeIds.length === 0) return { nodes: [], links: [] };

  // 使用更强大的 COALESCE & FULL OUTER JOIN 同时统计物理边关联和原子节点桥接（Bridge）关联
  // 核心优化：由于(summary_id, atomic_relationship_id)和(summary_id, proto_event_id)具有唯一索引约束，
  // COUNT(DISTINCT)完全等价于COUNT(*)，但COUNT(*)能免除巨量去重和排序操作，将外部磁盘排序降低为内存快排。
  const linksSql = `
    WITH edge_links AS (
      SELECT 
        rse1.summary_id AS source,
        rse2.summary_id AS target,
        COUNT(*)::int AS edge_weight
      FROM relationship_summary_edges rse1
      JOIN relationship_summary_edges rse2 ON rse1.atomic_relationship_id = rse2.atomic_relationship_id
      WHERE rse1.summary_id = ANY($1::int[])
        AND rse2.summary_id = ANY($1::int[])
        AND rse1.summary_id < rse2.summary_id
      GROUP BY rse1.summary_id, rse2.summary_id
    ),
    node_links AS (
      SELECT 
        rsm1.summary_id AS source,
        rsm2.summary_id AS target,
        COUNT(*)::int AS node_weight
      FROM relationship_summary_members rsm1
      JOIN relationship_summary_members rsm2 ON rsm1.proto_event_id = rsm2.proto_event_id
      WHERE rsm1.summary_id = ANY($1::int[])
        AND rsm2.summary_id = ANY($1::int[])
        AND rsm1.summary_id < rsm2.summary_id
      GROUP BY rsm1.summary_id, rsm2.summary_id
    )
    SELECT 
      COALESCE(el.source, nl.source) AS source,
      COALESCE(el.target, nl.target) AS target,
      (COALESCE(el.edge_weight, 0) + COALESCE(nl.node_weight, 0))::int AS weight,
      COALESCE(el.edge_weight, 0)::int AS edge_weight,
      COALESCE(nl.node_weight, 0)::int AS bridge_weight
    FROM edge_links el
    FULL OUTER JOIN node_links nl ON el.source = nl.source AND el.target = nl.target
    WHERE (COALESCE(el.edge_weight, 0) + COALESCE(nl.node_weight, 0)) > 0
  `;

  const tStart = Date.now();
  const linksResult = await query(linksSql, [nodeIds]);
  const elapsed = Date.now() - tStart;
  console.info(`[DB][getGlobalRelationshipSummaryGraph] links SQL query completed. duration=${elapsed}ms links_count=${linksResult.rows.length} node_count=${nodes.length}`);
  
  return {
    nodes,
    links: linksResult.rows
  };
}

const ATOMIC_GRAPH_TABLE_NAMES = [
  'atomic_batch_assignment_queue',
  'relationship_summary_jobs',
  'relationship_summary_edges',
  'relationship_summary_members',
  'relationship_summaries',
  'atomic_event_relationships'
];

async function listExistingAtomicGraphTables(executor = query) {
  const result = await executor(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ANY($1::text[])
  `, [ATOMIC_GRAPH_TABLE_NAMES]);
  return result.rows.map(row => row.table_name);
}

async function getAtomicRelationshipGraphTableCountsWithExecutor(executor = query) {
  const existingTables = await listExistingAtomicGraphTables(executor);
  const counts = Object.fromEntries(ATOMIC_GRAPH_TABLE_NAMES.map(table => [table, 0]));
  for (const table of existingTables) {
    const result = await executor(`SELECT COUNT(*)::int AS total FROM ${table}`);
    counts[table] = Number(result.rows[0]?.total || 0);
  }
  return counts;
}

export async function clearAtomicRelationshipGraph() {
  return withTransaction(async tx => {
    const existingTables = await listExistingAtomicGraphTables(tx);
    if (existingTables.length > 0) {
      await tx(`TRUNCATE TABLE ${existingTables.join(', ')} RESTART IDENTITY CASCADE`);
    }
    return getAtomicRelationshipGraphTableCountsWithExecutor(tx);
  });
}

export async function getAtomicRelationshipGraphTableCounts() {
  return getAtomicRelationshipGraphTableCountsWithExecutor(query);
}

export async function countLegacyRelationshipSummaries() {
  const result = await query(`
    SELECT COUNT(*)::int AS total
    FROM relationship_summaries
    WHERE summary_key LIKE 'type:%'
  `);
  return Number(result.rows[0]?.total || 0);
}

export async function getRelationshipSummariesByIds(summaryIds = []) {
  const ids = [...new Set((summaryIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0) return [];
  const result = await query(`
    SELECT *
    FROM relationship_summaries
    WHERE id = ANY($1::int[])
    ORDER BY member_count DESC, edge_count DESC, created_at ASC, id ASC
  `, [ids]);
  return result.rows;
}

export function chooseCanonicalSummary(summaries = []) {
  const active = (summaries || []).filter(summary => summary && (summary.summary_status || 'active') === 'active');
  const candidates = active.length > 0 ? active : (summaries || []).filter(Boolean);
  return [...candidates].sort(compareSummaryForCanonical)[0] || null;
}

export async function mergeRelationshipSummaries(summaryIds = [], options = {}) {
  const ids = [...new Set((summaryIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length < 2) {
    return { merged: false, canonical_summary_id: ids[0] || null, merged_summary_ids: [] };
  }

  return withTransaction(async tx => {
    const resolvedRows = await tx(`
      WITH RECURSIVE requested AS (
        SELECT id, summary_status, merged_into_summary_id
        FROM relationship_summaries
        WHERE id = ANY($1::int[])
        UNION
        SELECT rs.id, rs.summary_status, rs.merged_into_summary_id
        FROM relationship_summaries rs
        JOIN requested req ON req.merged_into_summary_id = rs.id
        WHERE COALESCE(req.summary_status, 'active') = 'merged'
          AND req.merged_into_summary_id IS NOT NULL
      )
      SELECT DISTINCT id
      FROM requested
      WHERE COALESCE(summary_status, 'active') = 'active'
      ORDER BY id
    `, [ids]);

    const activeResolvedIds = resolvedRows.rows.map(row => Number(row.id)).filter(Number.isInteger);
    const lockIds = [...new Set([...ids, ...activeResolvedIds])];
    const locked = await tx(`
      SELECT *
      FROM relationship_summaries
      WHERE id = ANY($1::int[])
      ORDER BY member_count DESC, edge_count DESC, created_at ASC, id ASC
      FOR UPDATE
    `, [lockIds]);
    const summaries = locked.rows;
    if (summaries.length === 0) {
      return { merged: false, canonical_summary_id: null, merged_summary_ids: [] };
    }

    const activeSummaries = summaries.filter(summary => (summary.summary_status || 'active') === 'active');
    const canonical = chooseCanonicalSummary(activeSummaries);
    if (!canonical) {
      return { merged: false, canonical_summary_id: null, merged_summary_ids: [] };
    }

    const canonicalId = Number(canonical.id);
    const mergeIds = activeSummaries
      .map(summary => Number(summary.id))
      .filter(id => id !== canonicalId);
    if (mergeIds.length === 0) {
      return { merged: false, canonical_summary_id: canonicalId, merged_summary_ids: [] };
    }

    await tx(`
      INSERT INTO relationship_summary_members (summary_id, proto_event_id, role, first_seen_at, last_seen_at)
      SELECT
        $1::int,
        proto_event_id,
        COALESCE((ARRAY_AGG(role ORDER BY first_seen_at ASC NULLS LAST))[1], 'member') AS role,
        MIN(first_seen_at),
        MAX(last_seen_at)
      FROM relationship_summary_members
      WHERE summary_id = ANY($2::int[])
      GROUP BY proto_event_id
      ON CONFLICT (summary_id, proto_event_id)
      DO UPDATE SET
        role = COALESCE(relationship_summary_members.role, EXCLUDED.role),
        first_seen_at = LEAST(relationship_summary_members.first_seen_at, EXCLUDED.first_seen_at),
        last_seen_at = GREATEST(relationship_summary_members.last_seen_at, EXCLUDED.last_seen_at)
    `, [canonicalId, mergeIds]);

    await tx(`
      INSERT INTO relationship_summary_edges (summary_id, atomic_relationship_id, created_at)
      SELECT $1::int, atomic_relationship_id, MIN(created_at)
      FROM relationship_summary_edges
      WHERE summary_id = ANY($2::int[])
      GROUP BY atomic_relationship_id
      ON CONFLICT (summary_id, atomic_relationship_id) DO NOTHING
    `, [canonicalId, mergeIds]);

    await tx(`
      UPDATE relationship_summaries
      SET summary_status = 'merged',
          merged_into_summary_id = $1::int,
          merged_at = CURRENT_TIMESTAMP,
          merge_reason = $3::text,
          detail_status = 'completed',
          updated_at = CURRENT_TIMESTAMP,
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'merged_into_summary_id', $1::int,
            'merge_rule_version', $4::text
          )
      WHERE id = ANY($2::int[])
        AND COALESCE(summary_status, 'active') = 'active'
    `, [canonicalId, mergeIds, options.reason || 'bridge_proto_summary_merge', options.ruleVersion || 'atomic-summary-merge-v1']);

    await tx(`
      UPDATE relationship_summaries
      SET summary_kind = 'relationship',
          relationship_type = CASE WHEN relationship_type = 'isolated' THEN 'related' ELSE relationship_type END,
          summary_status = 'active',
          merged_into_summary_id = NULL,
          merged_at = NULL,
          merge_reason = NULL,
          detail_status = 'pending',
          detail_requested_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP,
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'last_merge_summary_ids', to_jsonb($2::int[]),
            'merge_rule_version', $3::text
          )
      WHERE id = $1::int
    `, [canonicalId, mergeIds, options.ruleVersion || 'atomic-summary-merge-v1']);

    await tx(`
      WITH member_stats AS (
        SELECT
          COUNT(DISTINCT rsm.proto_event_id)::int AS member_count,
          MIN(COALESCE(pe.event_time, n.published_at, pe.created_at)) AS time_start,
          MAX(COALESCE(pe.event_time, n.published_at, pe.created_at)) AS time_end
        FROM relationship_summary_members rsm
        JOIN proto_events pe ON pe.id = rsm.proto_event_id
        LEFT JOIN news n ON n.id = pe.news_id
        WHERE rsm.summary_id = $1::int
      ),
      edge_stats AS (
        SELECT
          COUNT(DISTINCT rse.atomic_relationship_id)::int AS edge_count,
          COALESCE(AVG(ar.confidence), 0)::float AS avg_confidence
        FROM relationship_summary_edges rse
        JOIN atomic_event_relationships ar ON ar.id = rse.atomic_relationship_id
        WHERE rse.summary_id = $1::int
      )
      UPDATE relationship_summaries rs
      SET
        member_count = COALESCE(ms.member_count, 0),
        edge_count = COALESCE(es.edge_count, 0),
        avg_confidence = COALESCE(es.avg_confidence, 0),
        time_start = COALESCE(ms.time_start, rs.time_start),
        time_end = COALESCE(ms.time_end, rs.time_end),
        updated_at = CURRENT_TIMESTAMP
      FROM member_stats ms, edge_stats es
      WHERE rs.id = $1::int
    `, [canonicalId]);

    return {
      merged: true,
      canonical_summary_id: canonicalId,
      merged_summary_ids: mergeIds,
      input_summary_ids: ids
    };
  });
}

function compareSummaryForCanonical(left, right) {
  const leftActive = (left.summary_status || 'active') === 'active' ? 1 : 0;
  const rightActive = (right.summary_status || 'active') === 'active' ? 1 : 0;
  if (leftActive !== rightActive) return rightActive - leftActive;
  const leftMembers = Number(left.member_count || 0);
  const rightMembers = Number(right.member_count || 0);
  if (leftMembers !== rightMembers) return rightMembers - leftMembers;
  const leftEdges = Number(left.edge_count || 0);
  const rightEdges = Number(right.edge_count || 0);
  if (leftEdges !== rightEdges) return rightEdges - leftEdges;
  const leftCreated = new Date(left.created_at || 0).getTime();
  const rightCreated = new Date(right.created_at || 0).getTime();
  if (leftCreated !== rightCreated) return leftCreated - rightCreated;
  return Number(left.id || 0) - Number(right.id || 0);
}

export function buildTimeBucket(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return getYearWeek(new Date());
  return getYearWeek(date);
}

function getYearWeek(date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(firstThursday).getFullYear();
  return `${year}-w${String(weekNum).padStart(2, '0')}`;
}

export function collectProtoEntityKeys(proto) {
  const keys = [];
  const add = value => {
    const cleaned = String(value || '').trim().toLowerCase();
    if (cleaned) keys.push(cleaned);
  };

  for (const key of proto?.key_entities || proto?.cluster_key_entities || []) add(key);
  if (proto?.actor_entity_id) add(`entity:${proto.actor_entity_id}`);
  if (proto?.object_entity_id) add(`entity:${proto.object_entity_id}`);
  if (proto?.location_id) add(`entity:${proto.location_id}`);
  if (proto?.actor_pending_id) add(`pending_entity:${proto.actor_pending_id}`);
  if (proto?.object_pending_id) add(`pending_entity:${proto.object_pending_id}`);
  if (proto?.location_pending_id) add(`pending_entity:${proto.location_pending_id}`);
  if (proto?.actor_raw) add(`raw_actor:${proto.actor_raw}`);
  if (proto?.object_raw) add(`raw_object:${proto.object_raw}`);
  if (proto?.location_raw) add(`raw_location:${proto.location_raw}`);

  return [...new Set(keys)];
}

export function buildActionSignatureFromProto(proto) {
  if (proto?.action_signature) return proto.action_signature;
  if (proto?.action_id) return `action:${proto.action_id}`;
  if (proto?.action_pending_id) return `pending_action:${proto.action_pending_id}`;
  const raw = String(proto?.action_raw || proto?.action_name || proto?.action_key || '').trim().toLowerCase();
  return raw ? `raw_action:${raw}` : null;
}

export function buildLocationKeyFromProto(proto) {
  if (proto?.location_key) return proto.location_key;
  if (proto?.location_id) return `entity:${proto.location_id}`;
  if (proto?.location_pending_id) return `pending_entity:${proto.location_pending_id}`;
  const raw = String(proto?.location_raw || '').trim().toLowerCase();
  return raw ? `raw_location:${raw}` : null;
}

function buildProtoDisplayName(row) {
  return [
    row.actor_name || row.actor_raw,
    row.action_raw,
    row.object_name || row.object_raw
  ].filter(Boolean).join(' ') || row.news_title || `Proto #${row.id}`;
}
