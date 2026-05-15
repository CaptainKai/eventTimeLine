import { query, queryOne } from './connection.mjs';

/**
 * 创建事件-新闻关联
 */
export async function createEventNewsAssociation(association) {
  const sql = `
    INSERT INTO event_news (
      event_id, news_id, confidence, association_type, contribution_score
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (event_id, news_id)
    DO UPDATE SET
      confidence = $3,
      association_type = $4,
      contribution_score = $5,
      created_at = CURRENT_TIMESTAMP
    RETURNING id;
  `;

  const result = await query(sql, [
    association.event_id,
    association.news_id,
    association.confidence || 1.0,
    association.association_type || 'primary',
    association.contribution_score || 1.0
  ]);

  return result.rows[0].id;
}

/**
 * 获取事件的新闻关联
 */
export async function getEventNewsAssociations(eventId) {
  const sql = `
    SELECT
      en.*,
      n.title,
      n.source,
      n.source_url,
      n.published_at,
      n.sentiment,
      n.importance
    FROM event_news en
    JOIN news n ON en.news_id = n.id
    WHERE en.event_id = $1
    ORDER BY n.published_at DESC;
  `;

  const result = await query(sql, [eventId]);
  return result.rows;
}

/**
 * 批量创建事件-新闻关联
 */
export async function bulkCreateEventNewsAssociations(eventId, newsIds) {
  const results = [];

  for (const newsId of newsIds) {
    const id = await createEventNewsAssociation({
      event_id: eventId,
      news_id: newsId,
      confidence: 0.8,
      association_type: 'primary'
    });
    results.push(id);
  }

  return results;
}

/**
 * 更新事件-新闻关联的贡献权重
 */
export async function updateAssociationContribution(eventId, newsId, contributionScore) {
  const sql = `
    UPDATE event_news
    SET contribution_score = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE event_id = $2 AND news_id = $3
    RETURNING *;
  `;

  const result = await query(sql, [contributionScore, eventId, newsId]);
  return result.rows[0];
}

/**
 * 删除事件-新闻关联
 */
export async function deleteEventNewsAssociation(eventId, newsId) {
  const sql = `
    DELETE FROM event_news
    WHERE event_id = $1 AND news_id = $2
    RETURNING *;
  `;

  const result = await query(sql, [eventId, newsId]);
  return result.rows.length > 0;
}

/**
 * 获取事件的新闻数量
 */
export async function getNewsCountForEvent(eventId) {
  const sql = `
    SELECT COUNT(*) FROM event_news WHERE event_id = $1;
  `;

  const result = await query(sql, [eventId]);
  return parseInt(result.rows[0].count);
}

/**
 * 获取事件关联的新闻列表（分页）
 */
export async function getNewsForEvent(eventId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const sql = `
    SELECT
      n.*,
      en.confidence,
      en.confidence as association_confidence,
      en.association_type,
      en.contribution_score
    FROM event_news en
    JOIN news n ON en.news_id = n.id
    WHERE en.event_id = $1
    ORDER BY n.published_at DESC
    LIMIT $2 OFFSET $3;
  `;

  const result = await query(sql, [eventId, limit, offset]);
  return result.rows;
}
