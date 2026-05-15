import { query, queryOne } from './connection.mjs';

/**
 * 保存 LLM 解析结果
 */
export async function saveLlmParseResult(data) {
  const sql = `
    INSERT INTO llm_parse_results (
      news_id, prompt, raw_response, proto_event_count,
      model_used, parse_duration_ms, status, error_message
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id;
  `;

  const result = await query(sql, [
    data.news_id,
    data.prompt,
    JSON.stringify(data.raw_response),
    data.proto_event_count || 0,
    data.model_used || null,
    data.parse_duration_ms || null,
    data.status || 'success',
    data.error_message || null
  ]);

  return result.rows[0].id;
}

/**
 * 获取新闻的最新 LLM 解析结果
 */
export async function getLlmParseResultByNewsId(newsId) {
  const sql = `
    SELECT *
    FROM llm_parse_results
    WHERE news_id = $1
    ORDER BY created_at DESC
    LIMIT 1;
  `;

  return await queryOne(sql, [newsId]);
}

/**
 * 获取新闻的所有 LLM 解析结果（历史）
 */
export async function getLlmParseHistory(newsId) {
  const sql = `
    SELECT id, prompt, proto_event_count, model_used, parse_duration_ms, status, error_message, created_at
    FROM llm_parse_results
    WHERE news_id = $1
    ORDER BY created_at DESC;
  `;

  const result = await query(sql, [newsId]);
  return result.rows;
}

/**
 * 获取某条新闻的最新解析结果中的 raw_response
 */
export async function getLlmRawResponse(newsId) {
  const sql = `
    SELECT raw_response, proto_event_count, model_used, created_at
    FROM llm_parse_results
    WHERE news_id = $1 AND status = 'success'
    ORDER BY created_at DESC
    LIMIT 1;
  `;

  return await queryOne(sql, [newsId]);
}

/**
 * 更新 LLM 解析结果状态
 */
export async function updateLlmParseStatus(id, status, errorMessage = null) {
  const sql = `
    UPDATE llm_parse_results
    SET status = $2, error_message = $3, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
  `;

  const result = await query(sql, [id, status, errorMessage]);
  return result.rows[0];
}

export default {
  saveLlmParseResult,
  getLlmParseResultByNewsId,
  getLlmParseHistory,
  getLlmRawResponse,
  updateLlmParseStatus
};