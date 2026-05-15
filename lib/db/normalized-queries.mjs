import { query, queryOne } from './connection.mjs';

/**
 * 保存标准化事件
 */
export async function saveNormalizedEvent(event) {
  const sql = `
    INSERT INTO normalized_events (
      raw_event_id, event_type, event_time, actor1_id, actor2_id,
      sentiment, importance, location, location_id, event_code,
      tone, mentions, normalized_data, title, description
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id;
  `;

  const result = await query(sql, [
    event.raw_event_id,
    event.event_type,
    event.event_time,
    event.actor1_id || null,
    event.actor2_id || null,
    event.sentiment || null,
    event.importance || null,
    event.location || null,
    event.location_id || null,
    event.event_code || null,
    event.tone || null,
    event.mentions || null,
    event.normalized_data || {},
    event.title || null,
    event.description || null,
  ]);

  return result.rows[0].id;
}

/**
 * 获取标准化事件列表（分页）
 */
export async function getNormalizedEvents(page = 1, limit = 50, options = {}) {
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      ne.*,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name,
      re.source,
      re.source_url
    FROM normalized_events ne
    LEFT JOIN entity_mapping a1 ON ne.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON ne.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON ne.location_id = loc.id
    LEFT JOIN raw_events re ON ne.raw_event_id = re.id
    ${whereClause}
    ORDER BY ne.event_time DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
  `;

  params.push(limit, offset);
  const result = await query(sql, params);
  return result.rows;
}

/**
 * 根据ID获取标准化事件
 */
export async function getNormalizedEventById(id) {
  const sql = `
    SELECT
      ne.*,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name,
      re.source,
      re.source_url,
      re.raw_data
    FROM normalized_events ne
    LEFT JOIN entity_mapping a1 ON ne.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON ne.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON ne.location_id = loc.id
    LEFT JOIN raw_events re ON ne.raw_event_id = re.id
    WHERE ne.id = $1;
  `;
  return await queryOne(sql, [id]);
}

/**
 * 根据日期范围获取事件（用于时间线）
 */
export async function getEventsByDateRange(startDate, endDate, granularity = 'day', options = {}) {
  let groupBy;
  let dateFormat;

  switch (granularity) {
    case 'hour':
      groupBy = "DATE_TRUNC('hour', ne.event_time)";
      dateFormat = "TO_CHAR(DATE_TRUNC('hour', ne.event_time), 'YYYY-MM-DD HH24:00')";
      break;
    case 'week':
      groupBy = "DATE_TRUNC('week', ne.event_time)";
      dateFormat = "TO_CHAR(DATE_TRUNC('week', ne.event_time), 'YYYY-MM-DD')";
      break;
    case 'month':
      groupBy = "DATE_TRUNC('month', ne.event_time)";
      dateFormat = "TO_CHAR(DATE_TRUNC('month', ne.event_time), 'YYYY-MM')";
      break;
    case 'day':
    default:
      groupBy = "DATE_TRUNC('day', ne.event_time)";
      dateFormat = "TO_CHAR(DATE_TRUNC('day', ne.event_time), 'YYYY-MM-DD')";
  }

  const conditions = [`ne.event_time >= $1`, `ne.event_time <= $2`];
  const params = [startDate, endDate];
  let paramIndex = 3;

  if (options.event_type) {
    conditions.push(`ne.event_type = $${paramIndex}`);
    params.push(options.event_type);
    paramIndex++;
  }

  if (options.actor_id) {
    conditions.push(`(ne.actor1_id = $${paramIndex} OR ne.actor2_id = $${paramIndex})`);
    params.push(options.actor_id);
    paramIndex++;
  }

  if (options.location_id) {
    conditions.push(`ne.location_id = $${paramIndex}`);
    params.push(options.location_id);
    paramIndex++;
  }

  const sql = `
    SELECT
      ${dateFormat} as date,
      ${groupBy} as datetime,
      COUNT(*) as event_count,
      AVG(ne.sentiment) as avg_sentiment,
      SUM(ne.mentions) as total_mentions,
      AVG(ne.importance) as avg_importance,
      ne.event_type
    FROM normalized_events ne
    WHERE ${conditions.join(' AND ')}
    GROUP BY ${groupBy}, ${dateFormat}, ne.event_type
    ORDER BY ${groupBy} DESC;
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * 搜索标准化事件
 */
export async function searchNormalizedEvents({ q, event_type, startDate, endDate, page = 1, limit = 50 }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (q) {
    conditions.push(`(ne.title ILIKE $${paramIndex} OR ne.description ILIKE $${paramIndex})`);
    params.push(`%${q}%`);
    paramIndex++;
  }

  if (event_type) {
    conditions.push(`ne.event_type = $${paramIndex}`);
    params.push(event_type);
    paramIndex++;
  }

  if (startDate) {
    conditions.push(`ne.event_time >= $${paramIndex}`);
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    conditions.push(`ne.event_time <= $${paramIndex}`);
    params.push(endDate);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      ne.*,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name
    FROM normalized_events ne
    LEFT JOIN entity_mapping a1 ON ne.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON ne.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON ne.location_id = loc.id
    ${whereClause}
    ORDER BY ne.event_time DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
  `;

  params.push(limit, offset);
  const result = await query(sql, params);
  return result.rows;
}
