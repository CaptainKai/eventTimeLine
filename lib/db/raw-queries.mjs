import { query, queryOne } from './connection.mjs';

/**
 * 保存原始事件
 */
export async function saveRawEvent(event) {
  const sql = `
    INSERT INTO raw_events (source, source_event_id, event_time, raw_data, source_url)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (source, source_event_id)
    DO UPDATE SET
      event_time = EXCLUDED.event_time,
      raw_data = EXCLUDED.raw_data,
      source_url = EXCLUDED.source_url
    RETURNING id;
  `;

  const result = await query(sql, [
    event.source,
    event.source_event_id,
    event.event_time,
    event.raw_data,
    event.source_url || null,
  ]);

  return result.rows[0].id;
}

/**
 * 获取原始事件列表（分页）
 */
export async function getRawEvents(page = 1, limit = 50, sort = 'date_desc') {
  const offset = (page - 1) * limit;
  const orderBy = sort === 'date_desc' ? 'event_time DESC' : 'event_time ASC';

  const sql = `
    SELECT * FROM raw_events
    ORDER BY ${orderBy}
    LIMIT $1 OFFSET $2;
  `;

  const result = await query(sql, [limit, offset]);
  return result.rows;
}

/**
 * 根据ID获取原始事件
 */
export async function getRawEventById(id) {
  const sql = 'SELECT * FROM raw_events WHERE id = $1;';
  return await queryOne(sql, [id]);
}

/**
 * 根据源和源事件ID获取原始事件
 */
export async function getRawEventBySource(source, sourceEventId) {
  const sql = 'SELECT * FROM raw_events WHERE source = $1 AND source_event_id = $2;';
  return await queryOne(sql, [source, sourceEventId]);
}

/**
 * 搜索原始事件
 */
export async function searchRawEvents({ q, source, startDate, endDate, page = 1, limit = 50 }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (q) {
    conditions.push(`raw_data::text ILIKE $${paramIndex}`);
    params.push(`%${q}%`);
    paramIndex++;
  }

  if (source) {
    conditions.push(`source = $${paramIndex}`);
    params.push(source);
    paramIndex++;
  }

  if (startDate) {
    conditions.push(`event_time >= $${paramIndex}`);
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    conditions.push(`event_time <= $${paramIndex}`);
    params.push(endDate);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT * FROM raw_events
    ${whereClause}
    ORDER BY event_time DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
  `;

  params.push(limit, offset);
  const result = await query(sql, params);
  return result.rows;
}

/**
 * 删除原始事件
 */
export async function deleteRawEvent(id) {
  const sql = 'DELETE FROM raw_events WHERE id = $1 RETURNING *;';
  return await queryOne(sql, [id]);
}
