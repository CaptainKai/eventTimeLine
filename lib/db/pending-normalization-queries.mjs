import { query, queryOne } from './connection.mjs';

export async function upsertPendingNormalization({
  itemKind,
  role = null,
  rawValue,
  provisionalName = null,
  provisionalType = null,
  parentEntityName = null,
  parentEntityId = null,
  entitySubtype = null,
  hierarchyConfidence = null,
  context = {},
  evidence = null,
  sourceRef = null,
  status = 'pending'
}) {
  const kind = normalizeKind(itemKind);
  const raw = normalizeValue(rawValue || provisionalName);
  if (!kind || !raw) return null;

  const name = normalizeValue(provisionalName) || raw;
  const type = normalizeValue(provisionalType) || (kind === 'action' ? 'action' : 'organization');
  const normalizedType = kind === 'action'
    ? 'unknown_action'
    : role === 'location' ? 'unknown_location'
      : role === 'object' ? 'unknown_object'
        : 'unknown_actor';
  const provisionalKey = buildProvisionalKey(kind, role, raw, type);
  const evidencePatch = evidence ? [evidence] : [];
  const sourcePatch = sourceRef ? [sourceRef] : [];
  const normalizedParentEntityId = normalizeForeignKeyId(parentEntityId);

  const existingResolved = await findResolvedPendingNormalization({
    normalizedType,
    rawValue: raw.toLowerCase(),
    provisionalKey
  });
  if (existingResolved) {
    const updated = await appendPendingNormalizationEvidence(existingResolved.id, {
      context,
      evidencePatch,
      sourcePatch,
      rejectedSeenAgain: existingResolved.status === 'rejected'
    });
    return updated || existingResolved;
  }

  const result = await query(`
    INSERT INTO pending_normalizations (
      normalized_type, raw_value, context, status,
      item_kind, role, provisional_key, provisional_name, provisional_type,
      parent_entity_name, parent_entity_id, entity_subtype, hierarchy_confidence,
      evidence, source_refs, occurrence_count, last_seen_at
    ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (normalized_type, raw_value) DO UPDATE SET
      occurrence_count = pending_normalizations.occurrence_count + 1,
      last_seen_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP,
      status = CASE
        WHEN pending_normalizations.status IN ('promoted', 'merged', 'rejected') THEN pending_normalizations.status
        ELSE EXCLUDED.status
      END,
      parent_entity_name = COALESCE(pending_normalizations.parent_entity_name, EXCLUDED.parent_entity_name),
      parent_entity_id = COALESCE(pending_normalizations.parent_entity_id, EXCLUDED.parent_entity_id),
      entity_subtype = COALESCE(pending_normalizations.entity_subtype, EXCLUDED.entity_subtype),
      hierarchy_confidence = COALESCE(pending_normalizations.hierarchy_confidence, EXCLUDED.hierarchy_confidence),
      context = COALESCE(pending_normalizations.context, '{}'::jsonb) || EXCLUDED.context,
      evidence = (
        SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
        FROM (
          SELECT item
          FROM jsonb_array_elements(COALESCE(pending_normalizations.evidence, '[]'::jsonb) || COALESCE(EXCLUDED.evidence, '[]'::jsonb)) AS merged(item)
          LIMIT 20
        ) merged_evidence
      ),
      source_refs = (
        SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
        FROM (
          SELECT item
          FROM jsonb_array_elements(COALESCE(pending_normalizations.source_refs, '[]'::jsonb) || COALESCE(EXCLUDED.source_refs, '[]'::jsonb)) AS merged(item)
          LIMIT 50
        ) merged_source_refs
      )
    RETURNING *
  `, [
    normalizedType,
    raw.toLowerCase(),
    JSON.stringify(context || {}),
    status,
    kind,
    role,
    provisionalKey,
    name,
    type,
    normalizeValue(parentEntityName) || null,
    normalizedParentEntityId,
    normalizeValue(entitySubtype) || null,
    Number.isFinite(Number(hierarchyConfidence)) ? Number(hierarchyConfidence) : null,
    JSON.stringify(evidencePatch),
    JSON.stringify(sourcePatch)
  ]);

  return result.rows[0];
}

export async function getPendingNormalizationById(id) {
  return queryOne('SELECT * FROM pending_normalizations WHERE id = $1', [id]);
}

export async function findResolvedPendingNormalization({ normalizedType, rawValue, provisionalKey }) {
  const result = await query(`
    SELECT *
    FROM pending_normalizations
    WHERE status IN ('promoted', 'merged', 'rejected')
      AND (
        ($1::text IS NOT NULL AND provisional_key = $1)
        OR (normalized_type = $2 AND raw_value = $3)
      )
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `, [provisionalKey || null, normalizedType, rawValue]);

  return result.rows[0] || null;
}

async function appendPendingNormalizationEvidence(id, { context = {}, evidencePatch = [], sourcePatch = [], rejectedSeenAgain = false } = {}) {
  const contextPatch = {
    ...(context || {}),
    ...(rejectedSeenAgain ? { rejected_seen_again_at: new Date().toISOString() } : {})
  };

  const result = await query(`
    UPDATE pending_normalizations SET
      occurrence_count = pending_normalizations.occurrence_count + 1,
      last_seen_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP,
      context = COALESCE(pending_normalizations.context, '{}'::jsonb) || $2::jsonb,
      evidence = (
        SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
        FROM (
          SELECT item
          FROM jsonb_array_elements(COALESCE(pending_normalizations.evidence, '[]'::jsonb) || $3::jsonb) AS merged(item)
          LIMIT 20
        ) merged_evidence
      ),
      source_refs = (
        SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
        FROM (
          SELECT item
          FROM jsonb_array_elements(COALESCE(pending_normalizations.source_refs, '[]'::jsonb) || $4::jsonb) AS merged(item)
          LIMIT 50
        ) merged_source_refs
      )
    WHERE id = $1
    RETURNING *
  `, [
    id,
    JSON.stringify(contextPatch),
    JSON.stringify(evidencePatch || []),
    JSON.stringify(sourcePatch || [])
  ]);

  return result.rows[0] || null;
}

export async function listPendingNormalizations(options = {}) {
  const {
    itemKind = null,
    status = 'pending',
    limit = 50,
    offset = 0,
    includeReferenceCounts = true
  } = options;

  const where = [];
  const params = [];
  let idx = 1;

  if (itemKind) {
    where.push(`item_kind = $${idx++}`);
    params.push(itemKind);
  }
  if (status) {
    where.push(`status = $${idx++}`);
    params.push(status);
  }

  params.push(limit);
  const limitIndex = idx++;
  params.push(offset);
  const offsetIndex = idx++;

  const baseWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  if (!includeReferenceCounts) {
    const result = await query(`
      SELECT pn.*,
      COUNT(*) OVER() AS total_count,
      0::int AS proto_reference_count,
      0::int AS event_reference_count,
      0::int AS news_reference_count
      FROM pending_normalizations pn
      ${baseWhere}
      ORDER BY pn.occurrence_count DESC, pn.last_seen_at DESC, pn.id DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `, params);
    return result.rows;
  }

  const sql = `
    WITH page AS (
      SELECT pn.*, COUNT(*) OVER() AS total_count
      FROM pending_normalizations pn
      ${baseWhere}
      ORDER BY pn.occurrence_count DESC, pn.last_seen_at DESC, pn.id DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    ),
    proto_matches AS (
      SELECT actor_pending_id AS pending_id, id AS proto_id, news_id, canonical_event_id
      FROM proto_events
      WHERE actor_pending_id IN (SELECT id FROM page)
      UNION ALL
      SELECT object_pending_id AS pending_id, id AS proto_id, news_id, canonical_event_id
      FROM proto_events
      WHERE object_pending_id IN (SELECT id FROM page)
      UNION ALL
      SELECT location_pending_id AS pending_id, id AS proto_id, news_id, canonical_event_id
      FROM proto_events
      WHERE location_pending_id IN (SELECT id FROM page)
      UNION ALL
      SELECT action_pending_id AS pending_id, id AS proto_id, news_id, canonical_event_id
      FROM proto_events
      WHERE action_pending_id IN (SELECT id FROM page)
    ),
    event_matches AS (
      SELECT actor1_pending_id AS pending_id, id AS event_id
      FROM events
      WHERE actor1_pending_id IN (SELECT id FROM page)
      UNION ALL
      SELECT actor2_pending_id AS pending_id, id AS event_id
      FROM events
      WHERE actor2_pending_id IN (SELECT id FROM page)
      UNION ALL
      SELECT location_pending_id AS pending_id, id AS event_id
      FROM events
      WHERE location_pending_id IN (SELECT id FROM page)
      UNION ALL
      SELECT action_pending_id AS pending_id, id AS event_id
      FROM events
      WHERE action_pending_id IN (SELECT id FROM page)
      UNION ALL
      SELECT pending_id, canonical_event_id AS event_id
      FROM proto_matches
      WHERE canonical_event_id IS NOT NULL
    ),
    proto_counts AS (
      SELECT
        pending_id,
        COUNT(DISTINCT proto_id)::int AS proto_reference_count,
        COUNT(DISTINCT news_id)::int AS news_reference_count
      FROM proto_matches
      WHERE pending_id IS NOT NULL
      GROUP BY pending_id
    ),
    event_counts AS (
      SELECT
        pending_id,
        COUNT(DISTINCT event_id)::int AS event_reference_count
      FROM event_matches
      WHERE pending_id IS NOT NULL
      GROUP BY pending_id
    )
    SELECT page.*,
      COALESCE(proto_counts.proto_reference_count, 0)::int AS proto_reference_count,
      COALESCE(event_counts.event_reference_count, 0)::int AS event_reference_count,
      COALESCE(proto_counts.news_reference_count, 0)::int AS news_reference_count
    FROM page
    LEFT JOIN proto_counts ON proto_counts.pending_id = page.id
    LEFT JOIN event_counts ON event_counts.pending_id = page.id
    ORDER BY page.occurrence_count DESC, page.last_seen_at DESC, page.id DESC
  `;

  const result = await query(sql, params);
  return result.rows;
}

export async function getPendingNormalizationSummary(options = {}) {
  const { status = 'pending' } = options;
  const where = [];
  const params = [];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  const result = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE item_kind = 'entity')::int AS entity_count,
      COUNT(*) FILTER (WHERE item_kind = 'action')::int AS action_count
    FROM pending_normalizations
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
  `, params);

  return result.rows[0] || { total: 0, entity_count: 0, action_count: 0 };
}

export async function fetchPendingNormalizationContexts(pendingId, limit = 5) {
  const result = await query(`
    SELECT
      pe.id AS proto_event_id,
      pe.canonical_event_id,
      pe.news_id,
      pe.actor_raw,
      pe.action_raw,
      pe.object_raw,
      pe.location_raw,
      pe.event_time,
      n.title AS news_title,
      n.content AS news_content
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    WHERE pe.actor_pending_id = $1
       OR pe.object_pending_id = $1
       OR pe.location_pending_id = $1
       OR pe.action_pending_id = $1
    ORDER BY pe.created_at DESC
    LIMIT $2
  `, [pendingId, limit]);

  return result.rows;
}

export async function getPendingNormalizationImpact(pendingId) {
  const protoRows = await query(`
    SELECT DISTINCT id, news_id, canonical_event_id
    FROM proto_events
    WHERE actor_pending_id = $1
       OR object_pending_id = $1
       OR location_pending_id = $1
       OR action_pending_id = $1
  `, [pendingId]);

  const eventRows = await query(`
    SELECT DISTINCT id, story_id
    FROM events
    WHERE actor1_pending_id = $1
       OR actor2_pending_id = $1
       OR location_pending_id = $1
       OR action_pending_id = $1
       OR id = ANY($2::int[])
  `, [
    pendingId,
    protoRows.rows.map((row) => row.canonical_event_id).filter(Number.isInteger)
  ]);

  const newsIds = [...new Set(protoRows.rows.map((row) => row.news_id).filter(Number.isInteger))];
  const eventIds = [...new Set(eventRows.rows.map((row) => row.id).filter(Number.isInteger))];
  const storyIds = [...new Set(eventRows.rows.map((row) => row.story_id).filter(Number.isInteger))];

  return {
    pending_id: Number(pendingId),
    proto_ids: protoRows.rows.map((row) => row.id),
    news_ids: newsIds,
    event_ids: eventIds,
    story_ids: storyIds,
    proto_count: protoRows.rows.length,
    news_count: newsIds.length,
    event_count: eventIds.length,
    story_count: storyIds.length
  };
}

export async function updatePendingNormalizationAudit({
  pendingId,
  status = null,
  auditDecision = null,
  auditReason = null,
  targetEntityId = null,
  targetActionId = null,
  suggestedNormalization = null,
  parentEntityName = null,
  parentEntityId = null,
  entitySubtype = null,
  hierarchyConfidence = null,
  reviewedBy = 'normalization-audit'
}) {
  const normalizedTargetEntityId = normalizeForeignKeyId(targetEntityId);
  const normalizedTargetActionId = normalizeForeignKeyId(targetActionId);
  const normalizedParentEntityId = normalizeForeignKeyId(parentEntityId);

  const result = await query(`
    UPDATE pending_normalizations SET
      status = COALESCE($2, status),
      audit_decision = COALESCE($3, audit_decision),
      audit_reason = COALESCE($4, audit_reason),
      target_entity_id = COALESCE($5, target_entity_id),
      target_action_id = COALESCE($6, target_action_id),
      suggested_normalization = COALESCE($7, suggested_normalization),
      parent_entity_name = COALESCE($8, parent_entity_name),
      parent_entity_id = COALESCE($9, parent_entity_id),
      entity_subtype = COALESCE($10, entity_subtype),
      hierarchy_confidence = COALESCE($11, hierarchy_confidence),
      reviewed_by = $12,
      reviewed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [
    pendingId,
    status,
    auditDecision,
    auditReason,
    normalizedTargetEntityId,
    normalizedTargetActionId,
    suggestedNormalization,
    parentEntityName,
    normalizedParentEntityId,
    entitySubtype,
    hierarchyConfidence,
    reviewedBy
  ]);

  return result.rows[0] || null;
}

export async function recordNormalizationAuditLog({
  pendingId = null,
  itemKind,
  decision,
  reason = null,
  targetEntityId = null,
  targetActionId = null,
  affectedProtoCount = 0,
  affectedEventCount = 0,
  affectedStoryCount = 0,
  affectedNewsCount = 0,
  rebuildStatus = null,
  rebuildJobId = null,
  metadata = {}
}) {
  const normalizedPendingId = normalizeForeignKeyId(pendingId);
  const normalizedTargetEntityId = normalizeForeignKeyId(targetEntityId);
  const normalizedTargetActionId = normalizeForeignKeyId(targetActionId);
  const normalizedRebuildJobId = normalizeForeignKeyId(rebuildJobId);

  const result = await query(`
    INSERT INTO normalization_audit_logs (
      pending_id, item_kind, decision, reason,
      target_entity_id, target_action_id,
      affected_proto_count, affected_event_count, affected_story_count, affected_news_count,
      rebuild_status, rebuild_job_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
    RETURNING *
  `, [
    normalizedPendingId,
    itemKind,
    decision,
    reason,
    normalizedTargetEntityId,
    normalizedTargetActionId,
    affectedProtoCount,
    affectedEventCount,
    affectedStoryCount,
    affectedNewsCount,
    rebuildStatus,
    normalizedRebuildJobId,
    JSON.stringify(metadata || {})
  ]);

  return result.rows[0];
}

export async function listNormalizationAuditLogs(options = {}) {
  const {
    itemKind = null,
    decision = null,
    limit = 50,
    offset = 0
  } = options;

  const where = [];
  const params = [];
  let idx = 1;

  if (itemKind) {
    where.push(`nal.item_kind = $${idx++}`);
    params.push(itemKind);
  }

  if (decision) {
    where.push(`nal.decision = $${idx++}`);
    params.push(decision);
  }

  params.push(limit);
  const limitIndex = idx++;
  params.push(offset);
  const offsetIndex = idx++;
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const result = await query(`
    WITH page AS (
      SELECT
        nal.*,
        COUNT(*) OVER() AS total_count
      FROM normalization_audit_logs nal
      ${whereClause}
      ORDER BY nal.executed_at DESC, nal.id DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    )
    SELECT
      page.*,
      pn.raw_value AS pending_raw_value,
      pn.provisional_name AS pending_provisional_name,
      pn.provisional_type AS pending_provisional_type,
      pn.role AS pending_role,
      pn.status AS pending_status,
      em.canonical_name AS target_entity_name,
      sa.action_key AS target_action_key,
      sa.display_name AS target_action_name
    FROM page
    LEFT JOIN pending_normalizations pn ON pn.id = page.pending_id
    LEFT JOIN entity_mapping em ON em.id = page.target_entity_id
    LEFT JOIN standard_actions sa ON sa.id = page.target_action_id
    ORDER BY page.executed_at DESC, page.id DESC
  `, params);

  return result.rows;
}

export function buildProvisionalKey(itemKind, role, rawValue, provisionalType = null) {
  const kind = normalizeKind(itemKind) || 'entity';
  const rolePart = normalizeValue(role) || (kind === 'action' ? 'action' : 'entity');
  const typePart = normalizeValue(provisionalType) || rolePart;
  const rawPart = normalizeValue(rawValue).toLowerCase();
  return `${kind}:${rolePart}:${typePart}:${rawPart}`;
}

function normalizeKind(value) {
  const cleaned = normalizeValue(value);
  if (cleaned === 'entity' || cleaned === 'action') return cleaned;
  return null;
}

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeForeignKeyId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}
