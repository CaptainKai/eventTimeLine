import { query, queryOne } from './connection.mjs';

/**
 * 记录事件属性历史
 */
export async function recordAttributeHistory(eventId, attributes, options = {}) {
  const sql = `
    INSERT INTO event_attribute_history (
      event_id, snapshot_time, news_count, triggering_news_id,
      sentiment, importance, tone, mentions, news_count_at_snapshot,
      aggregation_window, is_calculated, calculation_method
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id;
  `;

  const result = await query(sql, [
    eventId,
    options.snapshotTime || new Date().toISOString(),
    attributes.news_count || 0,
    options.triggeringNewsId || null,
    attributes.sentiment || null,
    attributes.importance || null,
    attributes.tone || null,
    attributes.mentions || 0,
    attributes.news_count || 0,
    options.aggregationWindow || 'hour',
    options.isCalculated !== false,
    options.calculationMethod || 'weighted_avg'
  ]);

  return result.rows[0].id;
}

/**
 * 获取事件的属性历史
 */
export async function getEventAttributeHistory(eventId, options = {}) {
  const conditions = ['event_id = $1'];
  const params = [eventId];
  let paramIndex = 2;

  if (options.aggregationWindow) {
    conditions.push(`aggregation_window = $${paramIndex}`);
    params.push(options.aggregationWindow);
    paramIndex++;
  }

  if (options.startDate) {
    conditions.push(`snapshot_time >= $${paramIndex}`);
    params.push(options.startDate);
    paramIndex++;
  }

  if (options.endDate) {
    conditions.push(`snapshot_time <= $${paramIndex}`);
    params.push(options.endDate);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  const sql = `
    SELECT
      eah.*,
      n.title as triggering_news_title
    FROM event_attribute_history eah
    LEFT JOIN news n ON eah.triggering_news_id = n.id
    WHERE ${whereClause}
    ORDER BY eah.snapshot_time DESC;
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * 批量记录属性历史（用于回溯历史）
 */
export async function bulkRecordAttributeHistory(eventId, historyData) {
  const results = [];

  for (const data of historyData) {
    const id = await recordAttributeHistory(eventId, data.attributes, data.options);
    results.push(id);
  }

  return results;
}

/**
 * 获取最新的属性快照
 */
export async function getLatestAttributeSnapshot(eventId, aggregationWindow = 'hour') {
  const sql = `
    SELECT
      eah.*,
      n.title as triggering_news_title
    FROM event_attribute_history eah
    LEFT JOIN news n ON eah.triggering_news_id = n.id
    WHERE eah.event_id = $1
      AND eah.aggregation_window = $2
    ORDER BY eah.snapshot_time DESC
    LIMIT 1;
  `;

  const result = await query(sql, [eventId, aggregationWindow]);
  return result.rows[0];
}

/**
 * 删除旧的属性历史（保留最近N天）
 */
export async function cleanupOldHistory(eventId, daysToKeep = 30) {
  const sql = `
    DELETE FROM event_attribute_history
    WHERE event_id = $1
      AND snapshot_time < CURRENT_TIMESTAMP - INTERVAL '${daysToKeep} days'
      AND aggregation_window = 'hour';
  `;

  const result = await query(sql, [eventId]);
  return result.rowCount;
}
