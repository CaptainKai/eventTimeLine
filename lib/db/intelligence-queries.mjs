import { query, queryOne } from './connection.mjs';

/**
 * 获取所有故事 (L5 Stories)
 */
export async function getStories(options = {}) {
  const params = [];
  let sql = `
    SELECT s.*,
           COUNT(e.id) as event_count,
           MAX(e.updated_at) as last_event_at,
           COALESCE(
             (
               SELECT array_agg(DISTINCT actor_name)
               FROM (
                 SELECT a1.canonical_name as actor_name
                 FROM events e2
                 LEFT JOIN entity_mapping a1 ON e2.actor1_id = a1.id
                 WHERE e2.story_id = s.id AND a1.canonical_name IS NOT NULL
               ) actor_list
             ),
             '{}'::text[]
           ) as lead_actors,
           COALESCE(
             (
               SELECT array_agg(DISTINCT e2.event_type)
               FROM events e2
               WHERE e2.story_id = s.id AND e2.event_type IS NOT NULL
             ),
             '{}'::text[]
           ) as event_types,
           COALESCE((SELECT COUNT(*) FROM hypotheses h WHERE h.story_id = s.id), 0) as hypothesis_count,
           COALESCE((SELECT COUNT(*) FROM hypotheses h WHERE h.story_id = s.id AND h.status = 'pending'), 0) as pending_hypothesis_count
    FROM stories s
    LEFT JOIN events e ON e.story_id = s.id
    GROUP BY s.id
    ORDER BY s.escalation_level DESC, s.updated_at DESC
  `;
  
  const result = await query(sql, params);
  return result.rows;
}

/**
 * 获取单个故事详情
 */
export async function getStoryById(id) {
  const sql = `SELECT * FROM stories WHERE id = $1`;
  return await queryOne(sql, [id]);
}

/**
 * 获取故事下的事件链
 */
export async function getStoryEvents(storyId) {
  const sql = `
    SELECT e.*, 
           a1.canonical_name as actor1_name,
           a2.canonical_name as actor2_name
    FROM events e
    LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
    LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
    WHERE e.story_id = $1
    ORDER BY e.start_time ASC
  `;
  const result = await query(sql, [storyId]);
  return result.rows;
}

/**
 * 获取故事下的推演假设 (L6 Hypotheses)
 */
export async function getStoryHypotheses(storyId) {
  const sql = `
    SELECT * FROM hypotheses 
    WHERE story_id = $1
    ORDER BY probability DESC, created_at DESC
  `;
  const result = await query(sql, [storyId]);
  return result.rows;
}

/**
 * 汇总所有待验证假设
 */
export async function getPendingHypotheses() {
  const sql = `
    SELECT h.*, s.title as story_title
    FROM hypotheses h
    JOIN stories s ON h.story_id = s.id
    WHERE h.status = 'pending'
    ORDER BY h.probability DESC
  `;
  const result = await query(sql);
  return result.rows;
}
