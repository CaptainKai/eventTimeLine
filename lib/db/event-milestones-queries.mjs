import { query, queryOne } from './connection.mjs';

/**
 * 创建事件时间点
 */
export async function createEventMilestone(milestone) {
  const sql = `
    INSERT INTO event_milestones (
      event_id, milestone_time, milestone_type, milestone_status,
      title, description, news_id, confidence, position
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id;
  `;

  const result = await query(sql, [
    milestone.event_id,
    milestone.milestone_time,
    milestone.milestone_type,
    milestone.milestone_status || 'confirmed',
    milestone.title,
    milestone.description || null,
    milestone.news_id || null,
    milestone.confidence || 1.0,
    milestone.position || 0
  ]);

  return result.rows[0].id;
}

/**
 * 获取事件的时间点
 */
export async function getEventMilestones(eventId) {
  const sql = `
    SELECT
      em.*,
      n.title as news_title
    FROM event_milestones em
    LEFT JOIN news n ON em.news_id = n.id
    WHERE em.event_id = $1
    ORDER BY em.position, em.milestone_time;
  `;

  const result = await query(sql, [eventId]);
  return result.rows;
}

/**
 * 批量创建事件时间点
 */
export async function bulkCreateEventMilestones(eventId, milestones) {
  const results = [];

  for (const milestone of milestones) {
    const id = await createEventMilestone({
      event_id: eventId,
      milestone_time: milestone.milestone_time,
      milestone_type: milestone.milestone_type,
      milestone_status: milestone.milestone_status,
      title: milestone.title,
      description: milestone.description,
      news_id: milestone.news_id,
      confidence: milestone.confidence,
      position: milestone.position
    });
    results.push(id);
  }

  return results;
}

/**
 * 更新事件时间点
 */
export async function updateEventMilestone(id, updates) {
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
    UPDATE event_milestones
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex + 1}
    RETURNING *;
  `;

  params.push(id);

  const result = await query(sql, params);
  return result.rows[0];
}

/**
 * 删除事件的时间点
 */
export async function deleteEventMilestones(eventId) {
  const sql = `
    DELETE FROM event_milestones
    WHERE event_id = $1
    RETURNING id;
  `;

  const result = await query(sql, [eventId]);
  return result.rows.map(row => row.id);
}
