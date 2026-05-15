import { query, queryOne } from './connection.mjs';

/**
 * 获取所有新闻（分页）
 */
export async function getNews(page = 1, limit = 50, options = {}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (options.event_id) {
    conditions.push(`event_id = $${paramIndex}`);
    params.push(options.event_id);
    paramIndex++;
  }

  if (options.source) {
    conditions.push(`source = $${paramIndex}`);
    params.push(options.source);
    paramIndex++;
  }

  if (options.lang) {
    conditions.push(`lang = $${paramIndex}`);
    params.push(options.lang);
    paramIndex++;
  }

  if (options.start_date) {
    conditions.push(`published_at >= $${paramIndex}`);
    params.push(options.start_date);
    paramIndex++;
  }

  if (options.end_date) {
    conditions.push(`published_at <= $${paramIndex}`);
    params.push(options.end_date);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      n.*,
      e.event_type,
      e.start_time as event_time,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name
    FROM news n
    LEFT JOIN events e ON n.event_id = e.id
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    ${whereClause}
    ORDER BY n.published_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
  `;

  params.push(limit, offset);
  const result = await query(sql, params);
  return result.rows;
}

/**
 * 获取单个新闻详情
 */
export async function getNewsById(id) {
  const sql = `
    SELECT
      n.*,
      e.event_type,
      e.start_time as event_time,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name,
      loc.canonical_name as location_name
    FROM news n
    LEFT JOIN events e ON n.event_id = e.id
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    LEFT JOIN entity_mapping loc ON e.location_id = loc.id
    WHERE n.id = $1;
  `;

  return await queryOne(sql, [id]);
}

/**
 * 获取事件的新闻列表 (通过关联表)
 */
export async function getNewsByEventId(eventId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const sql = `
    SELECT
      n.*,
      en.confidence as association_confidence
    FROM news n
    JOIN event_news en ON en.news_id = n.id
    WHERE en.event_id = $1
    ORDER BY n.published_at DESC
    LIMIT $2 OFFSET $3;
  `;

  const result = await query(sql, [eventId, limit, offset]);
  return result.rows;
}

/**
 * 根据来源 URL 获取新闻
 */
export async function getNewsBySourceUrl(source, sourceUrl) {
  const sql = `
    SELECT *
    FROM news
    WHERE source = $1 AND source_url = $2
    LIMIT 1;
  `;

  return await queryOne(sql, [source, sourceUrl]);
}

/**
 * 创建新闻条目
 */
export async function createNews(newsData) {
  const sql = `
    INSERT INTO news (
      raw_event_id, event_id, title, content, source,
      source_url, published_at, lang, sentiment, importance,
      tone, reliability_score, mentions, normalized_data
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING id;
  `;

  const result = await query(sql, [
    newsData.raw_event_id || null,
    newsData.event_id || null,
    newsData.title,
    newsData.content || null,
    newsData.source,
    newsData.source_url,
    newsData.published_at,
    newsData.lang || 'en',
    newsData.sentiment || null,
    newsData.importance || null,
    newsData.tone || null,
    newsData.reliability_score || 0.9,
    newsData.mentions || 0,
    newsData.normalized_data || {}
  ]);

  return result.rows[0].id;
}

/**
 * 按来源 URL 进行新闻 Upsert
 */
export async function upsertNews(newsData) {
  const sql = `
    INSERT INTO news (
      raw_event_id, event_id, title, content, source,
      source_url, published_at, lang, sentiment, importance,
      tone, reliability_score, mentions, normalized_data
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
    ON CONFLICT (source, source_url)
    DO UPDATE SET
      raw_event_id = COALESCE(EXCLUDED.raw_event_id, news.raw_event_id),
      event_id = COALESCE(EXCLUDED.event_id, news.event_id),
      title = COALESCE(NULLIF(EXCLUDED.title, ''), news.title),
      content = COALESCE(EXCLUDED.content, news.content),
      published_at = COALESCE(EXCLUDED.published_at, news.published_at),
      lang = COALESCE(NULLIF(EXCLUDED.lang, ''), news.lang),
      sentiment = COALESCE(EXCLUDED.sentiment, news.sentiment),
      importance = COALESCE(EXCLUDED.importance, news.importance),
      tone = COALESCE(EXCLUDED.tone, news.tone),
      reliability_score = GREATEST(news.reliability_score, COALESCE(EXCLUDED.reliability_score, news.reliability_score)),
      mentions = COALESCE(EXCLUDED.mentions, news.mentions),
      normalized_data = COALESCE(news.normalized_data, '{}'::jsonb) || COALESCE(EXCLUDED.normalized_data, '{}'::jsonb),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, (xmax = 0) AS is_new;
  `;

  const result = await query(sql, [
    newsData.raw_event_id || null,
    newsData.event_id || null,
    newsData.title,
    newsData.content || null,
    newsData.source,
    newsData.source_url,
    newsData.published_at,
    newsData.lang || 'en',
    newsData.sentiment ?? null,
    newsData.importance ?? null,
    newsData.tone ?? null,
    newsData.reliability_score ?? 0.9,
    newsData.mentions ?? 0,
    JSON.stringify(newsData.normalized_data || {})
  ]);

  const id = result.rows[0].id;
  const record = await getNewsById(id);
  return { id, isNew: result.rows[0].is_new, record };
}

/**
 * 更新新闻信息
 */
export async function updateNews(id, updates) {
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
    UPDATE news
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex + 1}
    RETURNING *;
  `;

  params.push(id);

  const result = await query(sql, params);
  return result.rows[0];
}

/**
 * 获取新闻数量
 */
export async function getNewsCount(options = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (options.event_id) {
    conditions.push(`event_id = $${paramIndex}`);
    params.push(options.event_id);
    paramIndex++;
  }

  if (options.source) {
    conditions.push(`source = $${paramIndex}`);
    params.push(options.source);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT COUNT(*) FROM news
    ${whereClause}
  `;

  const result = await query(sql, params);
  return parseInt(result.rows[0].count);
}

/**
 * 搜索新闻（支持关键词搜索）
 */
export async function searchNews({ q, page = 1, limit = 50 }) {
  const offset = (page - 1) * limit;
  const sql = `
    SELECT
      n.*,
      e.event_type,
      a1.canonical_name as actor1_name,
      a2.canonical_name as actor2_name
    FROM news n
    LEFT JOIN events e ON n.event_id = e.id
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    WHERE
      (
        n.title ILIKE $1 OR
        n.content ILIKE $1 OR
        a1.canonical_name ILIKE $1 OR
        a2.canonical_name ILIKE $1
      )
    ORDER BY n.published_at DESC
    LIMIT $2 OFFSET $3;
  `;

  const result = await query(sql, [`%${q}%`, limit, offset]);
  return result.rows;
}

/**
 * 获取新闻统计信息
 */
export async function getNewsStats(options = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (options.start_date) {
    conditions.push(`published_at >= $${paramIndex}`);
    params.push(options.start_date);
    paramIndex++;
  }

  if (options.end_date) {
    conditions.push(`published_at <= $${paramIndex}`);
    params.push(options.end_date);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      COUNT(*) as total_news,
      COUNT(DISTINCT source) as unique_sources,
      AVG(reliability_score) as avg_reliability,
      AVG(sentiment) as avg_sentiment
    FROM news
    ${whereClause};
  `;

  const result = await query(sql, params);
  return result.rows[0];
}
/**
 * 获取新闻关联的原子事实 (L2 ProtoEvents)
 * 使用 DISTINCT ON 去重，确保相同 actor/action/object 只返回一条
 */
export async function getNewsProtoEvents(newsId) {
  const sql = `
    SELECT DISTINCT ON (pe.actor_raw, pe.action_raw, pe.object_raw)
      pe.*,
      lr.id as llm_parse_id,
      a1.canonical_name as actor_name,
      a2.canonical_name as object_name,
      loc.canonical_name as location_name
    FROM proto_events pe
    LEFT JOIN llm_parse_results lr ON lr.news_id = pe.news_id
    LEFT JOIN entity_mapping a1 ON pe.actor_entity_id = a1.id
    LEFT JOIN entity_mapping a2 ON pe.object_entity_id = a2.id
    LEFT JOIN entity_mapping loc ON pe.location_id = loc.id
    WHERE pe.news_id = $1
    ORDER BY pe.actor_raw, pe.action_raw, pe.object_raw, pe.created_at ASC;
  `;
  const result = await query(sql, [newsId]);
  return result.rows;
}

/**
 * 检查新闻是否已被解析过（存在有效的原子事件）
 * @param {number} newsId - 新闻ID
 * @returns {Promise<boolean>} true 表示已解析（有原子事件）
 */
export async function isNewsParsed(newsId) {
  const sql = `
    SELECT 1 FROM proto_events
    WHERE news_id = $1
    LIMIT 1
  `;
  const result = await query(sql, [newsId]);
  return result.rows.length > 0;
}

/**
 * 获取已提取原子事件的新闻列表（分页），附带 proto_events 数量
 */
export async function getNewsWithProtoEvents(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const sql = `
    SELECT
      n.id, n.title, n.source, n.source_url, n.published_at, n.lang, n.importance,
      COUNT(pe.id) as proto_event_count
    FROM news n
    JOIN proto_events pe ON pe.news_id = n.id
    GROUP BY n.id
    ORDER BY n.published_at DESC
    LIMIT $1 OFFSET $2;
  `;
  const result = await query(sql, [limit, offset]);
  return result.rows;
}

/**
 * 获取新闻总数（用于分页）
 */
export async function getNewsWithProtoEventsCount() {
  const sql = `
    SELECT COUNT(DISTINCT n.id) as count
    FROM news n
    JOIN proto_events pe ON pe.news_id = n.id;
  `;
  const result = await query(sql);
  return parseInt(result.rows[0].count);
}

/**
 * 通过 source 和 source_url 检查新闻是否已被解析过
 * @param {string} source - 新闻来源
 * @param {string} sourceUrl - 原文链接
 * @returns {Promise<number|null>} 返回已存在的新闻ID，如果没有返回null
 */
export async function checkNewsExists(source, sourceUrl) {
  const sql = `
    SELECT id FROM news
    WHERE source = $1 AND source_url = $2
    LIMIT 1
  `;
  const result = await query(sql, [source, sourceUrl]);
  return result.rows[0]?.id || null;
}
