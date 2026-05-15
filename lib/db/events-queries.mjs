import { query, queryOne } from './connection.mjs';

async function runDashboardQuery(label, sql, params = []) {
  const startedAt = Date.now();
  const result = await query(sql, params);
  const durationMs = Date.now() - startedAt;
  console.info('[DB][Dashboard]', {
    query: label,
    duration_ms: durationMs,
    row_count: result.rows.length,
  });
  return result;
}

/**
 * 按过滤条件获取 proto_events（带新闻元数据）
 * 用于模拟聚合：不写入 DB，仅返回筛选后的 L2-L6 完整链路
 */
export async function getFilteredProtoEvents(options = {}) {
  const conditions = [];
  const params = [];
  let pi = 1;

  if (options.lang) {
    conditions.push(`n.lang = $${pi}`);
    params.push(options.lang === 'zh' ? 'zh' : 'en');
    pi++;
  }
  if (options.source) {
    conditions.push(`n.source = $${pi}`);
    params.push(options.source);
    pi++;
  }
  if (options.startDate) {
    conditions.push(`n.published_at >= $${pi}`);
    params.push(options.startDate);
    pi++;
  }
  if (options.endDate) {
    conditions.push(`n.published_at <= $${pi}`);
    params.push(options.endDate);
    pi++;
  }
  if (options.parserMethod === 'llm') {
    conditions.push(`lr.id IS NOT NULL`);
  } else if (options.parserMethod === 'traditional') {
    conditions.push(`lr.id IS NULL`);
  }
  if (options.eventType) {
    conditions.push(`(pe.raw_extraction->'metadata'->>'event_type') = $${pi}`);
    params.push(options.eventType);
    pi++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      pe.id,
      pe.news_id,
      pe.canonical_event_id,
      pe.actor_raw, pe.action_raw, pe.object_raw,
      pe.event_time,
      pe.actor_entity_id, pe.object_entity_id, pe.location_id,
      pe.raw_extraction,
      a1.canonical_name as actor_name,
      a2.canonical_name as object_name,
      loc.canonical_name as location_name,
      n.id as news_id,
      n.title as news_title,
      n.source as news_source,
      n.lang as news_lang,
      n.published_at as news_published_at,
      n.importance as news_importance,
      lr.id as llm_parse_id
    FROM proto_events pe
    LEFT JOIN news n ON pe.news_id = n.id
    LEFT JOIN entity_mapping a1 ON pe.actor_entity_id = a1.id
    LEFT JOIN entity_mapping a2 ON pe.object_entity_id = a2.id
    LEFT JOIN entity_mapping loc ON pe.location_id = loc.id
    LEFT JOIN llm_parse_results lr ON lr.news_id = n.id
    ${whereClause}
    ORDER BY n.published_at DESC, pe.created_at ASC;
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * 按 canonical_event_id 分组，附带完整 L3-L6 数据
 */
export async function getCanonicalEventsGroupedByIds(canonicalIds) {
  if (!canonicalIds || canonicalIds.length === 0) return [];

  const sql = `
    SELECT
      e.id,
      e.event_type,
      e.start_time,
      e.current_importance,
      e.total_news_count,
      (e.normalized_data->>'title') as title,
      (e.normalized_data->>'description') as description,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name,
      e.story_id,
      s.title as story_name,
      s.summary as story_summary,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'type', er.relationship_type,
            'target_id', er.target_event_id,
            'target_title', COALESCE(t.normalized_data->>'title', t.event_type),
            'target_actor', ta.canonical_name,
            'description', er.description,
            'confidence', er.confidence,
            'weight', er.weight
          )
        )
        FROM event_relationships er
        JOIN events t ON er.target_event_id = t.id
        LEFT JOIN entity_mapping ta ON t.actor1_id = ta.id
        WHERE er.source_event_id = e.id
        ), '[]'::json
      ) as relationships_out,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', h.id,
            'prediction', h.predicted_event,
            'confidence', h.probability,
            'status', h.status,
            'created_at', h.created_at
          )
        )
        FROM hypotheses h
        WHERE h.story_id = e.story_id
        ), '[]'::json
      ) as hypotheses
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    LEFT JOIN stories s ON e.story_id = s.id
    WHERE e.id = ANY($1::int[])
    ORDER BY e.start_time DESC;
  `;

  const result = await query(sql, [canonicalIds]);
  return result.rows;
}

function buildDashboardProtoFilter(options = {}) {
  const conditions = [];
  const params = [];
  const addParam = value => {
    params.push(value);
    return `$${params.length}`;
  };

  if (options.lang) {
    conditions.push(`n.lang = ${addParam(options.lang === 'zh' ? 'zh' : 'en')}`);
  }
  if (options.source) {
    conditions.push(`n.source = ${addParam(options.source)}`);
  }
  if (options.startDate) {
    conditions.push(`n.published_at >= ${addParam(options.startDate)}`);
  }
  if (options.endDate) {
    conditions.push(`n.published_at <= ${addParam(options.endDate)}`);
  }
  if (options.parserMethod === 'llm') {
    conditions.push(`EXISTS (SELECT 1 FROM llm_parse_results lr_filter WHERE lr_filter.news_id = n.id)`);
  } else if (options.parserMethod === 'traditional') {
    conditions.push(`NOT EXISTS (SELECT 1 FROM llm_parse_results lr_filter WHERE lr_filter.news_id = n.id)`);
  }
  if (options.eventType) {
    conditions.push(`(pe.raw_extraction->'metadata'->>'event_type') = ${addParam(options.eventType)}`);
  }

  return {
    params,
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
  };
}

function buildDashboardFilteredProtoCte(options = {}) {
  const { params, whereClause } = buildDashboardProtoFilter(options);
  return {
    params,
    sql: `
      filtered_proto AS (
        SELECT
          pe.id,
          n.id as news_id,
          pe.canonical_event_id,
          n.title as news_title,
          n.source as news_source,
          n.lang as news_lang,
          n.published_at as news_published_at,
          n.importance as news_importance,
          EXISTS (SELECT 1 FROM llm_parse_results lr_status WHERE lr_status.news_id = n.id) as is_llm_parsed
        FROM proto_events pe
        LEFT JOIN news n ON pe.news_id = n.id
        ${whereClause}
      )`,
  };
}

function buildDashboardNewsGroupsCte(options = {}) {
  const filteredProto = buildDashboardFilteredProtoCte(options);
  return {
    params: filteredProto.params,
    sql: `
      WITH ${filteredProto.sql},
      grouped_news AS (
        SELECT
          news_id,
          news_title as title,
          news_source as source,
          news_lang as lang,
          news_published_at as published_at,
          news_importance as importance,
          is_llm_parsed,
          COUNT(*)::int as proto_event_count,
          CASE WHEN is_llm_parsed THEN COUNT(*)::int ELSE 0 END as llm_proto_count,
          COALESCE(array_remove(array_agg(DISTINCT canonical_event_id), NULL::int), ARRAY[]::int[]) as canonical_ids
        FROM filtered_proto
        WHERE news_id IS NOT NULL
        GROUP BY news_id, news_title, news_source, news_lang, news_published_at, news_importance, is_llm_parsed
      ),
      final_news AS (
        SELECT
          *,
          cardinality(canonical_ids)::int as canonical_count,
          CASE WHEN is_llm_parsed THEN 'llm' ELSE 'traditional' END as parser_method,
          (proto_event_count > 1) as has_multi_proto,
          (cardinality(canonical_ids) = 0) as is_unmapped
        FROM grouped_news
      )`,
  };
}

function buildDashboardNewsFinalWhere(options = {}) {
  const conditions = [];
  if (options.multiProtoOnly) conditions.push(`has_multi_proto = true`);
  if (options.unmappedOnly) conditions.push(`is_unmapped = true`);
  if (options.llmOnly) conditions.push(`is_llm_parsed = true`);
  if (options.watchlistOnly) conditions.push(`(has_multi_proto = true OR is_unmapped = true)`);
  return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
}

function normalizeDashboardNewsGroup(row = {}) {
  return {
    ...row,
    news_id: Number(row.news_id),
    importance: row.importance == null ? 0 : Number(row.importance),
    proto_event_count: Number(row.proto_event_count || 0),
    llm_proto_count: Number(row.llm_proto_count || 0),
    canonical_ids: Array.isArray(row.canonical_ids) ? row.canonical_ids.map(Number).filter(Boolean) : [],
    canonical_count: Number(row.canonical_count || 0),
    is_llm_parsed: Boolean(row.is_llm_parsed),
    has_multi_proto: Boolean(row.has_multi_proto),
    is_unmapped: Boolean(row.is_unmapped),
  };
}

export async function getDashboardSummary(options = {}) {
  const filteredProto = buildDashboardFilteredProtoCte(options);
  const sql = `
    WITH ${filteredProto.sql},
    filtered_canonical AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    ),
    filtered_stories AS (
      SELECT DISTINCT e.story_id
      FROM filtered_canonical fc
      JOIN events e ON e.id = fc.canonical_event_id
      WHERE e.story_id IS NOT NULL
    )
    SELECT
      (SELECT COUNT(DISTINCT news_id)::int FROM filtered_proto WHERE news_id IS NOT NULL) as total_news,
      (SELECT COUNT(DISTINCT news_id)::int FROM filtered_proto WHERE news_id IS NOT NULL) as parsed_news,
      (SELECT COUNT(DISTINCT id)::int FROM filtered_proto) as total_proto_events,
      (SELECT COUNT(*)::int FROM filtered_canonical) as total_canonical_events,
      (SELECT COUNT(DISTINCT er.id)::int FROM event_relationships er JOIN filtered_canonical fc ON er.source_event_id = fc.canonical_event_id) as total_relationships,
      (SELECT COUNT(*)::int FROM filtered_stories) as active_stories,
      (SELECT COUNT(DISTINCT h.id)::int FROM hypotheses h JOIN filtered_stories fs ON h.story_id = fs.story_id WHERE h.status = 'pending') as pending_hypotheses;
  `;
  const result = await query(sql, filteredProto.params);
  return result.rows[0] || {};
}

export async function getDashboardParserBreakdown(options = {}) {
  const newsGroups = buildDashboardNewsGroupsCte(options);
  const sql = `
    ${newsGroups.sql}
    SELECT parser_method as key, COUNT(*)::int as count
    FROM final_news
    GROUP BY parser_method;
  `;
  const result = await query(sql, newsGroups.params);
  const counts = new Map(result.rows.map(row => [row.key, Number(row.count || 0)]));
  return [
    { key: 'llm', label: 'LLM 解析', count: counts.get('llm') || 0 },
    { key: 'traditional', label: '传统解析', count: counts.get('traditional') || 0 },
  ];
}

export async function getDashboardRelationshipBreakdown(options = {}) {
  const filteredProto = buildDashboardFilteredProtoCte(options);
  const sql = `
    WITH ${filteredProto.sql},
    filtered_canonical AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    )
    SELECT er.relationship_type as key, COUNT(DISTINCT er.id)::int as count
    FROM event_relationships er
    JOIN filtered_canonical fc ON er.source_event_id = fc.canonical_event_id
    GROUP BY er.relationship_type
    ORDER BY count DESC;
  `;
  const result = await query(sql, filteredProto.params);
  return result.rows.map(row => ({ key: row.key, count: Number(row.count || 0) }));
}

export async function getDashboardHotEvents(options = {}, limit = 8) {
  const filteredProto = buildDashboardFilteredProtoCte(options);
  const params = [...filteredProto.params, limit];
  const limitParam = `$${params.length}`;
  const sql = `
    WITH ${filteredProto.sql},
    canonical_groups AS (
      SELECT
        canonical_event_id,
        COUNT(DISTINCT id)::int as proto_event_count,
        COUNT(DISTINCT news_id)::int as source_news_count,
        MAX(news_published_at) as latest_news_at,
        (array_agg(news_title ORDER BY news_published_at DESC NULLS LAST, id ASC))[1] as latest_news_title
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
      GROUP BY canonical_event_id
    )
    SELECT
      e.id,
      e.event_type,
      e.start_time,
      e.current_importance,
      e.total_news_count,
      (e.normalized_data->>'title') as title,
      (e.normalized_data->>'description') as description,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name,
      e.story_id,
      s.title as story_name,
      s.summary as story_summary,
      cg.proto_event_count,
      cg.source_news_count,
      cg.latest_news_at,
      cg.latest_news_title,
      COALESCE(rel.relationship_count, 0)::int as relationship_count,
      COALESCE(hyp.hypothesis_count, 0)::int as hypothesis_count
    FROM canonical_groups cg
    JOIN events e ON e.id = cg.canonical_event_id
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    LEFT JOIN stories s ON e.story_id = s.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int as relationship_count
      FROM event_relationships er
      WHERE er.source_event_id = e.id
    ) rel ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT h.id)::int as hypothesis_count
      FROM hypotheses h
      WHERE h.story_id = e.story_id
    ) hyp ON true
    ORDER BY ((cg.source_news_count * 3) + (COALESCE(rel.relationship_count, 0) * 2) + COALESCE(hyp.hypothesis_count, 0)) DESC,
      cg.latest_news_at DESC NULLS LAST,
      e.id DESC
    LIMIT ${limitParam};
  `;
  const result = await query(sql, params);
  return result.rows;
}

export async function getDashboardActiveStories(options = {}, limit = 8) {
  const filteredProto = buildDashboardFilteredProtoCte(options);
  const params = [...filteredProto.params, limit];
  const limitParam = `$${params.length}`;
  const sql = `
    WITH ${filteredProto.sql},
    filtered_events AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    )
    SELECT
      s.id,
      s.id as story_id,
      s.title,
      s.summary,
      s.theme,
      s.status,
      COUNT(DISTINCT e.id)::int as event_count,
      COALESCE(array_remove(array_agg(DISTINCT a1.canonical_name), NULL::text), ARRAY[]::text[])
        || COALESCE(array_remove(array_agg(DISTINCT a2.canonical_name), NULL::text), ARRAY[]::text[]) as lead_actors,
      COALESCE(array_remove(array_agg(DISTINCT e.event_type), NULL::text), ARRAY[]::text[]) as event_types,
      COUNT(DISTINCT h.id)::int as hypothesis_count,
      (COUNT(DISTINCT h.id) FILTER (WHERE h.status = 'pending'))::int as pending_hypothesis_count
    FROM filtered_events fe
    JOIN events e ON e.id = fe.canonical_event_id
    JOIN stories s ON s.id = e.story_id
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN hypotheses h ON h.story_id = s.id
    GROUP BY s.id, s.title, s.summary, s.theme, s.status
    ORDER BY event_count DESC, pending_hypothesis_count DESC, s.id DESC
    LIMIT ${limitParam};
  `;
  const result = await query(sql, params);
  return result.rows;
}

export async function getDashboardPendingHypotheses(options = {}, limit = 10) {
  const filteredProto = buildDashboardFilteredProtoCte(options);
  const params = [...filteredProto.params, limit];
  const limitParam = `$${params.length}`;
  const sql = `
    WITH ${filteredProto.sql},
    filtered_stories AS (
      SELECT DISTINCT e.story_id
      FROM filtered_proto fp
      JOIN events e ON e.id = fp.canonical_event_id
      WHERE e.story_id IS NOT NULL
    )
    SELECT
      h.id,
      h.predicted_event,
      h.probability,
      h.status,
      h.created_at,
      s.title as story_title
    FROM hypotheses h
    JOIN filtered_stories fs ON fs.story_id = h.story_id
    JOIN stories s ON s.id = h.story_id
    WHERE h.status = 'pending'
    ORDER BY h.probability DESC NULLS LAST, h.created_at DESC
    LIMIT ${limitParam};
  `;
  const result = await query(sql, params);
  return result.rows;
}

export async function getDashboardNewsParsePage(options = {}) {
  const page = Math.max(parseInt(options.page || '1', 10), 1);
  const limit = Math.max(parseInt(options.limit || '40', 10), 1);
  const offset = (page - 1) * limit;
  const newsGroups = buildDashboardNewsGroupsCte(options.filters || {});
  const finalWhere = buildDashboardNewsFinalWhere(options);
  const dataParams = [...newsGroups.params, limit, offset];
  const limitParam = `$${dataParams.length - 1}`;
  const offsetParam = `$${dataParams.length}`;

  const dataSql = `
    ${newsGroups.sql}
    SELECT *
    FROM final_news
    ${finalWhere}
    ORDER BY published_at DESC NULLS LAST, news_id DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;
  const countSql = `
    ${newsGroups.sql}
    SELECT COUNT(*)::int as total
    FROM final_news
    ${finalWhere};
  `;

  const [dataResult, countResult] = await Promise.all([
    query(dataSql, dataParams),
    query(countSql, newsGroups.params),
  ]);

  return {
    items: dataResult.rows.map(normalizeDashboardNewsGroup),
    total: Number(countResult.rows[0]?.total || 0),
  };
}

/**
 * 获取所有事件（分页）
 */
export async function getEvents(page = 1, limit = 50, options = {}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (options.event_type) {
    conditions.push(`event_type = $${paramIndex}`);
    params.push(options.event_type);
    paramIndex++;
  }

  if (options.actor_id) {
    conditions.push(`(actor1_id = $${paramIndex} OR actor2_id = $${paramIndex})`);
    params.push(options.actor_id);
    paramIndex++;
  }

  if (options.location_id) {
    conditions.push(`location_id = $${paramIndex}`);
    params.push(options.location_id);
    paramIndex++;
  }

  if (options.status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(options.status);
    paramIndex++;
  }

  if (options.is_ongoing !== undefined) {
    conditions.push(`is_ongoing = $${paramIndex}`);
    params.push(options.is_ongoing);
    paramIndex++;
  }

  if (options.is_future !== undefined) {
    conditions.push(`is_future = $${paramIndex}`);
    params.push(options.is_future);
    paramIndex++;
  }

  if (options.start_date) {
    conditions.push(`start_time >= $${paramIndex}`);
    params.push(options.start_date);
    paramIndex++;
  }

  if (options.end_date) {
    conditions.push(`start_time <= $${paramIndex}`);
    params.push(options.end_date);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      e.*,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name,
      (e.normalized_data->>'title') as title,
      (e.normalized_data->>'description') as description,
      e.start_time as event_time,
      e.current_importance as importance,
      e.current_tone as tone,
      e.current_sentiment as sentiment,
      e.total_mentions as mentions
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    ${whereClause}
    ORDER BY e.start_time DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
  `;

  params.push(limit, offset);
  const result = await query(sql, params);
  return result.rows;
}

/**
 * 获取单个事件详情
 */
export async function getEventById(id) {
  const sql = `
    SELECT
      e.*,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name,
      (e.normalized_data->>'title') as title,
      (e.normalized_data->>'description') as description,
      e.start_time as event_time,
      e.current_importance as importance,
      e.current_tone as tone,
      e.current_sentiment as sentiment,
      e.total_mentions as mentions
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    WHERE e.id = $1;
  `;

  return await queryOne(sql, [id]);
}

/**
 * 根据事件哈希查找事件
 */
export async function getEventByHash(eventHash) {
  const sql = `
    SELECT
      e.*,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    WHERE e.event_hash = $1;
  `;

  return await queryOne(sql, [eventHash]);
}

/**
 * 查找潜在的匹配事件（用于模糊去重）
 * 查找同一天、相同 Actor1 和相同事件类型的活跃事件
 */
export async function findPotentialMatch(actor1Id, eventType, startTime) {
  if (!actor1Id) return null;
  
  const dateStr = new Date(startTime).toISOString().slice(0, 10);
  
  const sql = `
    SELECT e.*
    FROM events e
    WHERE e.actor1_id = $1 
      AND e.event_type = $2
      AND DATE(e.start_time) = $3
    ORDER BY e.created_at ASC
    LIMIT 1;
  `;

  return await queryOne(sql, [actor1Id, eventType, dateStr]);
}

/**
 * 创建事件
 */
export async function createEvent(eventData) {
  const sql = `
    INSERT INTO events (
      event_hash, event_type, start_time, end_time,
      is_ongoing, is_future, actor1_id, actor2_id, location_id,
      current_sentiment, current_importance, current_tone, total_mentions,
      total_news_count, event_code, status, normalized_data
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id;
  `;

  const result = await query(sql, [
    eventData.event_hash,
    eventData.event_type,
    eventData.start_time,
    eventData.end_time || null,
    eventData.is_ongoing ?? true,
    eventData.is_future ?? false,
    eventData.actor1_id || null,
    eventData.actor2_id || null,
    eventData.location_id || null,
    eventData.current_sentiment || null,
    eventData.current_importance || null,
    eventData.current_tone || null,
    eventData.total_mentions || 0,
    eventData.total_news_count || 0,
    eventData.event_code || null,
    eventData.status || 'active',
    eventData.normalized_data || {}
  ]);

  return result.rows[0].id;
}

/**
 * 更新事件信息
 */
export async function updateEvent(id, updates) {
  const fields = [];
  const params = [];
  let paramIndex = 1;

  Object.keys(updates).forEach(key => {
    fields.push(`${key} = $${paramIndex}`);
    params.push(updates[key]);
    paramIndex++;
  });

  fields.push(`updated_at = $${paramIndex}`);
  params.push(new Date().toISOString());

  const sql = `
    UPDATE events
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex + 1}
    RETURNING *;
  `;

  params.push(id);

  const result = await query(sql, params);
  return result.rows[0];
}

/**
 * 更新事件的属性快照
 */
export async function updateEventSnapshot(id, attributes) {
  const sql = `
    UPDATE events
    SET
      current_sentiment = $1,
      current_importance = $2,
      current_tone = $3,
      total_mentions = $4,
      total_news_count = $5,
      updated_at = $6
    WHERE id = $7
    RETURNING *;
  `;

  const result = await query(sql, [
    attributes.sentiment,
    attributes.importance,
    attributes.tone,
    attributes.mentions,
    attributes.news_count,
    new Date().toISOString(),
    id
  ]);

  return result.rows[0];
}

/**
 * 获取事件统计信息
 */
export async function getEventsCount(options = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (options.event_type) {
    conditions.push(`event_type = $${paramIndex}`);
    params.push(options.event_type);
    paramIndex++;
  }

  if (options.actor_id) {
    conditions.push(`(actor1_id = $${paramIndex} OR actor2_id = $${paramIndex})`);
    params.push(options.actor_id);
    paramIndex++;
  }

  if (options.location_id) {
    conditions.push(`location_id = $${paramIndex}`);
    params.push(options.location_id);
    paramIndex++;
  }

  if (options.status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(options.status);
    paramIndex++;
  }

  if (options.is_ongoing !== undefined) {
    conditions.push(`is_ongoing = $${paramIndex}`);
    params.push(options.is_ongoing);
    paramIndex++;
  }

  if (options.is_future !== undefined) {
    conditions.push(`is_future = $${paramIndex}`);
    params.push(options.is_future);
    paramIndex++;
  }

  if (options.start_date) {
    conditions.push(`start_time >= $${paramIndex}`);
    params.push(options.start_date);
    paramIndex++;
  }

  if (options.end_date) {
    conditions.push(`start_time <= $${paramIndex}`);
    params.push(options.end_date);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT COUNT(*) FROM events
    ${whereClause}
  `;

  const result = await query(sql, params);
  return parseInt(result.rows[0].count);
}

/**
 * 搜索事件（支持关键词搜索）
 */
export async function searchEvents({ q, page = 1, limit = 50 }) {
  if (!q) {
    return getEvents(page, limit);
  }

  const offset = (page - 1) * limit;
  const sql = `
    SELECT
      e.*,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name,
      (e.normalized_data->>'title') as title,
      (e.normalized_data->>'description') as description,
      e.start_time as event_time,
      e.current_importance as importance,
      e.current_tone as tone,
      e.current_sentiment as sentiment,
      e.total_mentions as mentions
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    WHERE
      (
        e.event_type ILIKE $1 OR
        a1.canonical_name ILIKE $1 OR
        a2.canonical_name ILIKE $1 OR
        loc.canonical_name ILIKE $1 OR
        (e.normalized_data->>'description')::TEXT ILIKE $1 OR
        (e.normalized_data->>'title')::TEXT ILIKE $1
      )
    ORDER BY e.total_news_count DESC, e.start_time DESC
    LIMIT $2 OFFSET $3;
  `;

  const result = await query(sql, [`%${q}%`, limit, offset]);
  return result.rows;
}

/**
 * 获取活跃事件（通过查询 active_events 物化视图）
 */
export async function getActiveEvents() {
  const sql = `
    SELECT * FROM active_events
    ORDER BY total_news_count DESC, current_importance DESC;
  `;

  const result = await query(sql);
  return result.rows;
}

/**
 * 根据日期范围获取事件（用于时间线）
 */
export async function getEventsByDateRange(startDate, endDate, granularity = 'day', options = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  conditions.push(`e.start_time >= $${paramIndex}`);
  params.push(startDate);
  paramIndex++;

  conditions.push(`e.start_time <= $${paramIndex}`);
  params.push(endDate);
  paramIndex++;

  if (options.event_type) {
    conditions.push(`e.event_type = $${paramIndex}`);
    params.push(options.event_type);
    paramIndex++;
  }

  if (options.actor_id) {
    conditions.push(`(e.actor1_id = $${paramIndex} OR e.actor2_id = $${paramIndex})`);
    params.push(options.actor_id);
    paramIndex++;
  }

  if (options.location_id) {
    conditions.push(`e.location_id = $${paramIndex}`);
    params.push(options.location_id);
    paramIndex++;
  }

  const groupBy = granularity === 'day' ? 'DATE(e.start_time)' :
                  granularity === 'week' ? 'DATE_TRUNC(\'week\', e.start_time)' :
                  'DATE_TRUNC(\'month\', e.start_time)';

  const sql = `
    SELECT
      ${groupBy} as date,
      COUNT(DISTINCT e.id) as event_count,
      AVG(e.current_sentiment) as avg_sentiment,
      SUM(e.total_mentions) as total_mentions
    FROM events e
    LEFT JOIN event_news en ON e.id = en.event_id
    LEFT JOIN news n ON en.news_id = n.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY ${groupBy}
    ORDER BY date;
  `;

  const result = await query(sql, params);
  return result.rows.map(row => ({
    date: row.date.toISOString().split('T')[0],
    event_count: Number(row.event_count),
    avg_sentiment: row.avg_sentiment,
    total_mentions: Number(row.total_mentions || 0)
  }));
}

/**
 * 获取标准事件下的所有原子事件（已去重）
 */
export async function getProtoEventsForCanonicalEvent(eventId) {
  const sql = `
    SELECT DISTINCT ON (actor_raw, action_raw, object_raw, event_time::date)
      pe.*,
      a1.canonical_name as actor_name,
      a2.canonical_name as object_name,
      loc.canonical_name as location_name,
      n.title as news_title,
      n.id as news_id
    FROM proto_events pe
    LEFT JOIN entity_mapping a1 ON pe.actor_entity_id = a1.id
    LEFT JOIN entity_mapping a2 ON pe.object_entity_id = a2.id
    LEFT JOIN entity_mapping loc ON pe.location_id = loc.id
    LEFT JOIN news n ON pe.news_id = n.id
    WHERE pe.canonical_event_id = $1
    ORDER BY actor_raw, action_raw, object_raw, event_time::date, pe.created_at DESC;
  `;
  const result = await query(sql, [eventId]);
  return result.rows;
}

/**
 * 获取时间线视图所需的真实事件项
 */
export async function getTimelineItems(startDate, endDate, options = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (startDate) {
    conditions.push(`e.start_time >= $${paramIndex}`);
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    conditions.push(`e.start_time <= $${paramIndex}`);
    params.push(endDate);
    paramIndex++;
  }

  if (options.event_type) {
    conditions.push(`e.event_type = $${paramIndex}`);
    params.push(options.event_type);
    paramIndex++;
  }

  if (options.actor_id) {
    conditions.push(`(e.actor1_id = $${paramIndex} OR e.actor2_id = $${paramIndex})`);
    params.push(options.actor_id);
    paramIndex++;
  }

  if (options.location_id) {
    conditions.push(`e.location_id = $${paramIndex}`);
    params.push(options.location_id);
    paramIndex++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      e.id,
      e.event_type,
      e.start_time,
      e.end_time,
      e.is_ongoing,
      e.is_future,
      e.current_importance,
      e.current_tone,
      e.current_sentiment,
      e.total_mentions,
      e.total_news_count,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name,
      (e.normalized_data->>'title') as title,
      (e.normalized_data->>'description') as description,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', em.id,
            'milestone_time', em.milestone_time,
            'milestone_type', em.milestone_type,
            'title', em.title,
            'description', em.description,
            'confidence', em.confidence
          )
          ORDER BY em.milestone_time
        )
        FROM event_milestones em
        WHERE em.event_id = e.id
      ), '[]'::json) as milestones
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    ${whereClause}
    ORDER BY e.start_time DESC, e.current_importance DESC
    LIMIT 200;
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * 获取标准事件的聚合信息（proto_event 数量、来源新闻数量）
 */
export async function getEventsWithAggregation(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const sql = `
    SELECT
      e.id,
      e.event_type,
      e.start_time,
      e.current_importance,
      e.total_news_count,
      (e.normalized_data->>'title') as title,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name,
      COUNT(DISTINCT pe.id) as proto_event_count,
      COUNT(DISTINCT pe.news_id) as source_news_count
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    LEFT JOIN proto_events pe ON pe.canonical_event_id = e.id
    GROUP BY e.id, a1.canonical_name, a2.canonical_name, loc.canonical_name
    ORDER BY source_news_count DESC, proto_event_count DESC
    LIMIT $1 OFFSET $2;
  `;
  const result = await query(sql, [limit, offset]);
  return result.rows;
}

export async function getDashboardCanonicalEventsPage(options = {}) {
  const page = Math.max(parseInt(options.page || '1', 10), 1);
  const limit = Math.max(parseInt(options.limit || '50', 10), 1);
  const offset = (page - 1) * limit;
  const focusEventId = toPositiveInt(options.eventId || options.focusEventId, 0);
  const filteredProto = buildDashboardFilteredProtoCte(options.filters || {});
  const params = [...filteredProto.params, limit, offset];
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const dataSql = `
    WITH ${filteredProto.sql},
    canonical_groups AS (
      SELECT
        canonical_event_id,
        COUNT(DISTINCT id)::int AS proto_event_count,
        COUNT(DISTINCT news_id)::int AS source_news_count,
        MAX(news_published_at) AS latest_news_at,
        (array_agg(news_title ORDER BY news_published_at DESC NULLS LAST, id ASC))[1] AS latest_news_title
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
      GROUP BY canonical_event_id
    ),
    ranked_groups AS (
      SELECT *
      FROM canonical_groups
      ORDER BY source_news_count DESC, proto_event_count DESC, latest_news_at DESC NULLS LAST, canonical_event_id DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    ),
    rel_counts AS (
      SELECT source_event_id AS event_id, COUNT(*)::int AS relationship_count
      FROM event_relationships
      WHERE source_event_id IN (SELECT canonical_event_id FROM ranked_groups)
      GROUP BY source_event_id
    ),
    hyp_counts AS (
      SELECT e.id AS event_id, COUNT(DISTINCT h.id)::int AS hypothesis_count
      FROM events e
      LEFT JOIN hypotheses h ON h.story_id = e.story_id
      WHERE e.id IN (SELECT canonical_event_id FROM ranked_groups)
      GROUP BY e.id
    )
    SELECT
      e.id,
      e.event_type,
      e.start_time,
      e.current_importance,
      e.total_news_count,
      (e.normalized_data->>'title') AS title,
      (e.normalized_data->>'description') AS description,
      a1.canonical_name AS actor1_name,
      a2.canonical_name AS actor2_name,
      loc.canonical_name AS location_name,
      e.story_id,
      s.title AS story_name,
      s.summary AS story_summary,
      cg.proto_event_count,
      cg.source_news_count,
      cg.latest_news_at,
      cg.latest_news_title,
      COALESCE(rc.relationship_count, 0)::int AS relationship_count,
      COALESCE(hc.hypothesis_count, 0)::int AS hypothesis_count,
      false AS is_focus
    FROM ranked_groups cg
    JOIN events e ON e.id = cg.canonical_event_id
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    LEFT JOIN stories s ON e.story_id = s.id
    LEFT JOIN rel_counts rc ON rc.event_id = e.id
    LEFT JOIN hyp_counts hc ON hc.event_id = e.id
    ORDER BY cg.source_news_count DESC, cg.proto_event_count DESC, cg.latest_news_at DESC NULLS LAST, e.id DESC;
  `;

  const countSql = `
    WITH ${filteredProto.sql}
    SELECT COUNT(DISTINCT canonical_event_id)::int AS total
    FROM filtered_proto
    WHERE canonical_event_id IS NOT NULL;
  `;

  const [dataResult, countResult] = await Promise.all([
    runDashboardQuery('canonical_events_page.data', dataSql, params),
    runDashboardQuery('canonical_events_page.count', countSql, filteredProto.params),
  ]);

  let items = dataResult.rows;
  let focusInFilter = false;
  let focusIncluded = false;

  if (focusEventId) {
    const existingIndex = items.findIndex(row => Number(row.id) === focusEventId);
    if (existingIndex >= 0) {
      focusInFilter = true;
      focusIncluded = true;
      const focusRow = { ...items[existingIndex], is_focus: true };
      items = [focusRow, ...items.filter((_, index) => index !== existingIndex)];
    } else {
      const focusParams = [...filteredProto.params, focusEventId];
      const focusParam = `$${focusParams.length}`;
      const focusSql = `
        WITH ${filteredProto.sql},
        canonical_groups AS (
          SELECT
            canonical_event_id,
            COUNT(DISTINCT id)::int AS proto_event_count,
            COUNT(DISTINCT news_id)::int AS source_news_count,
            MAX(news_published_at) AS latest_news_at,
            (array_agg(news_title ORDER BY news_published_at DESC NULLS LAST, id ASC))[1] AS latest_news_title
          FROM filtered_proto
          WHERE canonical_event_id = ${focusParam}
          GROUP BY canonical_event_id
        ),
        rel_counts AS (
          SELECT source_event_id AS event_id, COUNT(*)::int AS relationship_count
          FROM event_relationships
          WHERE source_event_id = ${focusParam}
          GROUP BY source_event_id
        ),
        hyp_counts AS (
          SELECT e.id AS event_id, COUNT(DISTINCT h.id)::int AS hypothesis_count
          FROM events e
          LEFT JOIN hypotheses h ON h.story_id = e.story_id
          WHERE e.id = ${focusParam}
          GROUP BY e.id
        )
        SELECT
          e.id,
          e.event_type,
          e.start_time,
          e.current_importance,
          e.total_news_count,
          (e.normalized_data->>'title') AS title,
          (e.normalized_data->>'description') AS description,
          a1.canonical_name AS actor1_name,
          a2.canonical_name AS actor2_name,
          loc.canonical_name AS location_name,
          e.story_id,
          s.title AS story_name,
          s.summary AS story_summary,
          cg.proto_event_count,
          cg.source_news_count,
          cg.latest_news_at,
          cg.latest_news_title,
          COALESCE(rc.relationship_count, 0)::int AS relationship_count,
          COALESCE(hc.hypothesis_count, 0)::int AS hypothesis_count,
          true AS is_focus
        FROM canonical_groups cg
        JOIN events e ON e.id = cg.canonical_event_id
        LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
        LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
        LEFT JOIN entity_mapping loc ON e.location_id = loc.id
        LEFT JOIN stories s ON e.story_id = s.id
        LEFT JOIN rel_counts rc ON rc.event_id = e.id
        LEFT JOIN hyp_counts hc ON hc.event_id = e.id;
      `;
      const focusResult = await runDashboardQuery('canonical_events_page.focus', focusSql, focusParams);
      if (focusResult.rows[0]) {
        focusInFilter = true;
        focusIncluded = true;
        items = [focusResult.rows[0], ...items];
      }
    }
  }

  return {
    items,
    total: Number(countResult.rows[0]?.total || 0),
    focusEventId: focusEventId || null,
    focusInFilter,
    focusIncluded,
  };
}

export async function getDashboardCanonicalCardsByIds(canonicalIds = []) {
  const uniqueIds = [...new Set((canonicalIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) return [];

  const sql = `
    SELECT
      e.id,
      e.event_type,
      e.start_time,
      e.current_importance,
      e.total_news_count,
      (e.normalized_data->>'title') AS title,
      (e.normalized_data->>'description') AS description,
      a1.canonical_name AS actor1_name,
      a2.canonical_name AS actor2_name,
      loc.canonical_name AS location_name,
      e.story_id,
      s.title AS story_name,
      s.summary AS story_summary,
      COALESCE(agg.latest_news_at, e.start_time) AS latest_news_at,
      agg.latest_news_title,
      COALESCE(agg.source_news_count, 0)::int AS source_news_count,
      COALESCE(agg.proto_event_count, 0)::int AS proto_event_count,
      COALESCE(rel.relationship_count, 0)::int AS relationship_count,
      COALESCE(hyp.hypothesis_count, 0)::int AS hypothesis_count
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    LEFT JOIN stories s ON s.id = e.story_id
    LEFT JOIN LATERAL (
      SELECT
        MAX(n.published_at) AS latest_news_at,
        (array_agg(n.title ORDER BY n.published_at DESC NULLS LAST, n.id DESC))[1] AS latest_news_title,
        COUNT(DISTINCT n.id)::int AS source_news_count,
        COUNT(DISTINCT pe.id)::int AS proto_event_count
      FROM proto_events pe
      LEFT JOIN news n ON n.id = pe.news_id
      WHERE pe.canonical_event_id = e.id
    ) agg ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS relationship_count
      FROM event_relationships er
      WHERE er.source_event_id = e.id
    ) rel ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT h.id)::int AS hypothesis_count
      FROM hypotheses h
      WHERE h.story_id = e.story_id
    ) hyp ON true
    WHERE e.id = ANY($1::int[])
    ORDER BY e.start_time DESC NULLS LAST, e.id DESC;
  `;

  const result = await runDashboardQuery('canonical_cards_by_ids', sql, [uniqueIds]);
  return result.rows;
}

export async function getDashboardStoriesPage(options = {}) {
  const page = Math.max(parseInt(options.page || '1', 10), 1);
  const limit = Math.max(parseInt(options.limit || '50', 10), 1);
  const offset = (page - 1) * limit;
  const filteredProto = buildDashboardFilteredProtoCte(options.filters || {});
  const params = [...filteredProto.params];
  const withHypothesisOnly = options.withHypothesisOnly === true;
  const withHypothesisWhere = withHypothesisOnly
    ? 'WHERE COALESCE(hc.hypothesis_count, 0) > 0'
    : '';

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const dataSql = `
    WITH ${filteredProto.sql},
    filtered_events AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    ),
    filtered_stories AS (
      SELECT DISTINCT e.story_id
      FROM filtered_events fe
      JOIN events e ON e.id = fe.canonical_event_id
      WHERE e.story_id IS NOT NULL
    ),
    event_metrics AS (
      SELECT
        e.story_id,
        COUNT(DISTINCT e.id)::int AS event_count,
        MAX(e.start_time) AS latest_event_time,
        COALESCE(array_remove(array_agg(DISTINCT a1.canonical_name), NULL::text), ARRAY[]::text[])
          || COALESCE(array_remove(array_agg(DISTINCT a2.canonical_name), NULL::text), ARRAY[]::text[]) AS lead_actors,
        COALESCE(array_remove(array_agg(DISTINCT e.event_type), NULL::text), ARRAY[]::text[]) AS event_types
      FROM filtered_events fe
      JOIN events e ON e.id = fe.canonical_event_id
      LEFT JOIN entity_mapping a1 ON a1.id = e.actor1_id
      LEFT JOIN entity_mapping a2 ON a2.id = e.actor2_id
      GROUP BY e.story_id
    ),
    hyp_counts AS (
      SELECT
        h.story_id,
        COUNT(DISTINCT h.id)::int AS hypothesis_count,
        (COUNT(DISTINCT h.id) FILTER (WHERE h.status = 'pending'))::int AS pending_hypothesis_count
      FROM hypotheses h
      WHERE h.story_id IN (SELECT story_id FROM filtered_stories)
      GROUP BY h.story_id
    )
    SELECT
      s.id,
      s.id AS story_id,
      s.title,
      s.summary,
      s.theme,
      s.status,
      COALESCE(em.event_count, 0)::int AS event_count,
      COALESCE(em.lead_actors, ARRAY[]::text[]) AS lead_actors,
      COALESCE(em.event_types, ARRAY[]::text[]) AS event_types,
      COALESCE(hc.hypothesis_count, 0)::int AS hypothesis_count,
      COALESCE(hc.pending_hypothesis_count, 0)::int AS pending_hypothesis_count,
      em.latest_event_time
    FROM filtered_stories fs
    JOIN stories s ON s.id = fs.story_id
    LEFT JOIN event_metrics em ON em.story_id = s.id
    LEFT JOIN hyp_counts hc ON hc.story_id = s.id
    ${withHypothesisWhere}
    ORDER BY COALESCE(em.event_count, 0) DESC,
      COALESCE(hc.pending_hypothesis_count, 0) DESC,
      em.latest_event_time DESC NULLS LAST,
      s.id DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  const countSql = `
    WITH ${filteredProto.sql},
    filtered_events AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    ),
    filtered_stories AS (
      SELECT DISTINCT e.story_id
      FROM filtered_events fe
      JOIN events e ON e.id = fe.canonical_event_id
      WHERE e.story_id IS NOT NULL
    ),
    hyp_counts AS (
      SELECT
        h.story_id,
        COUNT(DISTINCT h.id)::int AS hypothesis_count
      FROM hypotheses h
      WHERE h.story_id IN (SELECT story_id FROM filtered_stories)
      GROUP BY h.story_id
    )
    SELECT COUNT(*)::int AS total
    FROM filtered_stories fs
    LEFT JOIN hyp_counts hc ON hc.story_id = fs.story_id
    ${withHypothesisOnly ? 'WHERE COALESCE(hc.hypothesis_count, 0) > 0' : ''};
  `;

  const [dataResult, countResult] = await Promise.all([
    runDashboardQuery('stories_page.data', dataSql, params),
    runDashboardQuery('stories_page.count', countSql, filteredProto.params),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.total || 0),
  };
}

export async function getDashboardPendingHypothesesPage(options = {}) {
  const page = Math.max(parseInt(options.page || '1', 10), 1);
  const limit = Math.max(parseInt(options.limit || '50', 10), 1);
  const offset = (page - 1) * limit;
  const filteredProto = buildDashboardFilteredProtoCte(options.filters || {});
  const dataParams = [...filteredProto.params];
  let statusWhere = '';

  if (options.status && options.status !== 'all') {
    dataParams.push(options.status);
    statusWhere = `AND h.status = $${dataParams.length}`;
  }

  dataParams.push(limit);
  const limitParam = `$${dataParams.length}`;
  dataParams.push(offset);
  const offsetParam = `$${dataParams.length}`;

  const countParams = dataParams.slice(0, dataParams.length - 2);

  const dataSql = `
    WITH ${filteredProto.sql},
    filtered_events AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    ),
    filtered_stories AS (
      SELECT DISTINCT e.story_id
      FROM filtered_events fe
      JOIN events e ON e.id = fe.canonical_event_id
      WHERE e.story_id IS NOT NULL
    ),
    story_event_counts AS (
      SELECT
        e.story_id,
        COUNT(DISTINCT e.id)::int AS event_count
      FROM filtered_events fe
      JOIN events e ON e.id = fe.canonical_event_id
      GROUP BY e.story_id
    )
    SELECT
      h.id,
      h.story_id,
      h.predicted_event,
      h.probability,
      h.status,
      h.created_at,
      s.title AS story_title,
      s.summary AS story_summary,
      COALESCE(sec.event_count, 0)::int AS event_count
    FROM hypotheses h
    JOIN filtered_stories fs ON fs.story_id = h.story_id
    JOIN stories s ON s.id = h.story_id
    LEFT JOIN story_event_counts sec ON sec.story_id = h.story_id
    WHERE 1 = 1 ${statusWhere}
    ORDER BY h.probability DESC NULLS LAST, h.created_at DESC, h.id DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  const countSql = `
    WITH ${filteredProto.sql},
    filtered_events AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    ),
    filtered_stories AS (
      SELECT DISTINCT e.story_id
      FROM filtered_events fe
      JOIN events e ON e.id = fe.canonical_event_id
      WHERE e.story_id IS NOT NULL
    )
    SELECT COUNT(*)::int AS total
    FROM hypotheses h
    JOIN filtered_stories fs ON fs.story_id = h.story_id
    WHERE 1 = 1 ${statusWhere};
  `;

  const [dataResult, countResult] = await Promise.all([
    runDashboardQuery('hypotheses_pending_page.data', dataSql, dataParams),
    runDashboardQuery('hypotheses_pending_page.count', countSql, countParams),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.total || 0),
  };
}

export async function getDashboardRelationshipsPage(options = {}) {
  const page = Math.max(parseInt(options.page || '1', 10), 1);
  const limit = Math.max(parseInt(options.limit || '50', 10), 1);
  const offset = (page - 1) * limit;
  const filteredProto = buildDashboardFilteredProtoCte(options.filters || {});
  const params = [...filteredProto.params];

  let typeWhere = '';
  if (options.relationshipType) {
    params.push(options.relationshipType);
    typeWhere = `AND er.relationship_type = $${params.length}`;
  }

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const dataSql = `
    WITH ${filteredProto.sql},
    filtered_canonical AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    )
    SELECT
      er.id,
      er.source_event_id AS source_id,
      er.target_event_id AS target_id,
      er.relationship_type,
      er.confidence,
      er.weight,
      er.created_at AS relationship_created_at,
      COALESCE(er.updated_at, er.created_at) AS relationship_updated_at,
      LEFT(COALESCE(er.description, ''), 400) AS description,
      LEFT(COALESCE(s.normalized_data->>'title', s.event_type), 180) AS source_title,
      LEFT(COALESCE(t.normalized_data->>'title', t.event_type), 180) AS target_title,
      ((COALESCE(er.confidence, 0) * 2) + COALESCE(er.weight, 0)) AS complexity_score
    FROM event_relationships er
    JOIN filtered_canonical fcs ON fcs.canonical_event_id = er.source_event_id
    JOIN filtered_canonical fct ON fct.canonical_event_id = er.target_event_id
    JOIN events s ON s.id = er.source_event_id
    JOIN events t ON t.id = er.target_event_id
    WHERE 1 = 1 ${typeWhere}
    ORDER BY COALESCE(er.updated_at, er.created_at) DESC NULLS LAST, complexity_score DESC, er.id DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  const countParams = params.slice(0, params.length - 2);
  const countSql = `
    WITH ${filteredProto.sql},
    filtered_canonical AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    )
    SELECT COUNT(*)::int AS total
    FROM event_relationships er
    JOIN filtered_canonical fcs ON fcs.canonical_event_id = er.source_event_id
    JOIN filtered_canonical fct ON fct.canonical_event_id = er.target_event_id
    WHERE 1 = 1 ${typeWhere};
  `;

  const [dataResult, countResult] = await Promise.all([
    runDashboardQuery('relationships_page.data', dataSql, params),
    runDashboardQuery('relationships_page.count', countSql, countParams),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.total || 0),
  };
}

function toPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeCursor(cursor) {
  const parsed = parseInt(cursor || '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function getDashboardRelationshipSubgraph(options = {}) {
  const filteredProto = buildDashboardFilteredProtoCte(options.filters || {});
  const params = [...filteredProto.params];
  const centerEventId = toPositiveInt(options.centerEventId, 0);
  const limitNodes = toPositiveInt(options.limitNodes, 80);
  const limitEdges = toPositiveInt(options.limitEdges, 120);
  const cursor = normalizeCursor(options.cursor);
  const storyFirst = options.storyFirst !== false;
  const relationshipType = options.relationshipType || null;

  if (!centerEventId) {
    return {
      nodes: [],
      edges: [],
      focus: { center_event_id: null, mode: 'event' },
      page_info: { cursor, next_cursor: cursor, has_more: false },
      stats: { returned_nodes: 0, returned_edges: 0, filtered_candidates: 0 },
    };
  }

  params.push(centerEventId);
  const centerParam = `$${params.length}`;
  params.push(storyFirst);
  const storyFirstParam = `$${params.length}`;
  params.push(limitEdges);
  const limitEdgesParam = `$${params.length}`;
  params.push(cursor);
  const cursorParam = `$${params.length}`;

  let typeWhere = '';
  if (relationshipType) {
    params.push(relationshipType);
    typeWhere = `AND er.relationship_type = $${params.length}`;
  }

  const sql = `
    WITH ${filteredProto.sql},
    filtered_canonical AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    ),
    center_event AS (
      SELECT e.id, e.story_id
      FROM events e
      WHERE e.id = ${centerParam}
        AND EXISTS (SELECT 1 FROM filtered_canonical fc WHERE fc.canonical_event_id = e.id)
    ),
    ranked_edges AS (
      SELECT
        er.id,
        er.source_event_id AS source_id,
        er.target_event_id AS target_id,
        er.relationship_type,
        er.confidence,
        er.weight,
        er.description,
        er.created_at AS relationship_created_at,
        COALESCE(er.updated_at, er.created_at) AS relationship_updated_at,
        ((COALESCE(er.confidence, 0) * 2) + COALESCE(er.weight, 0)) AS complexity_score,
        CASE
          WHEN ${storyFirstParam} = true AND (s.story_id = ce.story_id OR t.story_id = ce.story_id) THEN 0
          ELSE 1
        END AS priority_group
      FROM event_relationships er
      JOIN center_event ce ON true
      JOIN events s ON s.id = er.source_event_id
      JOIN events t ON t.id = er.target_event_id
      JOIN filtered_canonical fcs ON fcs.canonical_event_id = s.id
      JOIN filtered_canonical fct ON fct.canonical_event_id = t.id
      WHERE (er.source_event_id = ce.id OR er.target_event_id = ce.id)
      ${typeWhere}
      ORDER BY priority_group ASC, COALESCE(er.updated_at, er.created_at) DESC NULLS LAST, complexity_score DESC, er.id DESC
      LIMIT ${limitEdgesParam} OFFSET ${cursorParam}
    ),
    node_ids AS (
      SELECT source_id AS event_id FROM ranked_edges
      UNION
      SELECT target_id AS event_id FROM ranked_edges
      UNION
      SELECT ${centerParam} AS event_id
    ),
    node_rows AS (
      SELECT
        e.id,
        e.event_type,
        e.start_time,
        e.story_id,
        (e.normalized_data->>'title') AS title,
        (e.normalized_data->>'description') AS description,
        a1.canonical_name AS actor1_name,
        a2.canonical_name AS actor2_name,
        loc.canonical_name AS location_name,
        s.title AS story_name
      FROM events e
      JOIN node_ids ni ON ni.event_id = e.id
      LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
      LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
      LEFT JOIN entity_mapping loc ON e.location_id = loc.id
      LEFT JOIN stories s ON s.id = e.story_id
    )
    SELECT
      (SELECT COALESCE(json_agg(node_rows), '[]'::json) FROM node_rows) AS nodes_json,
      (SELECT COALESCE(json_agg(ranked_edges), '[]'::json) FROM ranked_edges) AS edges_json,
      (SELECT COUNT(*)::int FROM ranked_edges) AS returned_edges,
      (SELECT COUNT(*)::int FROM node_rows) AS returned_nodes;
  `;

  const result = await queryOne(sql, params);
  const nodes = Array.isArray(result?.nodes_json) ? result.nodes_json : [];
  const edges = Array.isArray(result?.edges_json) ? result.edges_json : [];
  const returnedEdges = Number(result?.returned_edges || 0);
  const returnedNodes = Number(result?.returned_nodes || 0);

  return {
    nodes: nodes.slice(0, limitNodes),
    edges,
    focus: { center_event_id: centerEventId, mode: 'event' },
    page_info: {
      cursor,
      next_cursor: cursor + returnedEdges,
      has_more: returnedEdges >= limitEdges
    },
    stats: {
      returned_nodes: Math.min(returnedNodes, limitNodes),
      returned_edges: returnedEdges,
      filtered_candidates: returnedEdges
    },
  };
}

export async function getDashboardRelationshipNeighbors(options = {}) {
  return getDashboardRelationshipSubgraph({
    ...options,
    radius: 1,
  });
}

export async function getDashboardRelationshipClusters(options = {}) {
  const filteredProto = buildDashboardFilteredProtoCte(options.filters || {});
  const params = [...filteredProto.params];
  const limitNodes = toPositiveInt(options.limitNodes, 60);
  const limitEdges = toPositiveInt(options.limitEdges, 120);

  params.push(limitNodes);
  const limitNodesParam = `$${params.length}`;
  params.push(limitEdges);
  const limitEdgesParam = `$${params.length}`;

  const sql = `
    WITH ${filteredProto.sql},
    filtered_canonical AS (
      SELECT DISTINCT canonical_event_id
      FROM filtered_proto
      WHERE canonical_event_id IS NOT NULL
    ),
    cluster_nodes AS (
      SELECT
        s.id AS cluster_id,
        s.title AS cluster_title,
        COUNT(DISTINCT e.id)::int AS event_count,
        MAX(e.start_time) AS latest_time
      FROM filtered_canonical fc
      JOIN events e ON e.id = fc.canonical_event_id
      JOIN stories s ON s.id = e.story_id
      GROUP BY s.id, s.title
      ORDER BY event_count DESC, latest_time DESC NULLS LAST, s.id DESC
      LIMIT ${limitNodesParam}
    ),
    cluster_edges AS (
      SELECT
        es.story_id AS source_cluster_id,
        et.story_id AS target_cluster_id,
        COUNT(DISTINCT er.id)::int AS relation_count,
        AVG(COALESCE(er.weight, 0))::float AS avg_weight,
        AVG(COALESCE(er.confidence, 0))::float AS avg_confidence
      FROM event_relationships er
      JOIN events es ON es.id = er.source_event_id
      JOIN events et ON et.id = er.target_event_id
      JOIN cluster_nodes cs ON cs.cluster_id = es.story_id
      JOIN cluster_nodes ct ON ct.cluster_id = et.story_id
      WHERE es.story_id IS NOT NULL
        AND et.story_id IS NOT NULL
        AND es.story_id <> et.story_id
      GROUP BY es.story_id, et.story_id
      ORDER BY relation_count DESC, avg_weight DESC, avg_confidence DESC
      LIMIT ${limitEdgesParam}
    )
    SELECT
      (SELECT COALESCE(json_agg(cluster_nodes), '[]'::json) FROM cluster_nodes) AS nodes_json,
      (SELECT COALESCE(json_agg(cluster_edges), '[]'::json) FROM cluster_edges) AS edges_json;
  `;

  const result = await queryOne(sql, params);
  const nodes = Array.isArray(result?.nodes_json) ? result.nodes_json : [];
  const edges = Array.isArray(result?.edges_json) ? result.edges_json : [];

  return {
    nodes,
    edges,
    focus: { center_event_id: null, mode: 'cluster' },
    page_info: { cursor: 0, next_cursor: 0, has_more: false },
    stats: { returned_nodes: nodes.length, returned_edges: edges.length, filtered_candidates: edges.length },
  };
}

/**
 * 获取标准事件聚合总数
 */
export async function getEventsWithAggregationCount() {
  const sql = `SELECT COUNT(*) FROM events;`;
  const result = await query(sql);
  return parseInt(result.rows[0].count);
}

/**
 * 获取标准事件的原子事件（按新闻分组）
 */
export async function getProtoEventsForCanonicalEventGrouped(eventId) {
  const sql = `
    SELECT
      pe.id,
      pe.actor_raw, pe.action_raw, pe.object_raw,
      pe.event_time,
      pe.news_id,
      n.title as news_title,
      n.source as news_source,
      n.published_at as news_published_at,
      a1.canonical_name as actor_name,
      a2.canonical_name as object_name,
      loc.canonical_name as location_name
    FROM proto_events pe
    LEFT JOIN entity_mapping a1 ON pe.actor_entity_id = a1.id
    LEFT JOIN entity_mapping a2 ON pe.object_entity_id = a2.id
    LEFT JOIN entity_mapping loc ON pe.location_id = loc.id
    LEFT JOIN news n ON pe.news_id = n.id
    WHERE pe.canonical_event_id = $1
    ORDER BY n.published_at DESC, pe.created_at ASC;
  `;
  const result = await query(sql, [eventId]);
  return result.rows;
}
