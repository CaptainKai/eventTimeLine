import { query } from '../lib/db/connection.mjs';

/**
 * 清理孤立的 stories（没有关联任何事件的）
 */
export async function deleteOrphanedStories() {
  const result = await query(`
    DELETE FROM stories
    WHERE id NOT IN (SELECT DISTINCT story_id FROM events WHERE story_id IS NOT NULL)
  `);
  return result.rowCount;
}

/**
 * 清理孤立的事件（没有任何 proto_events 关联的）
 */
export async function deleteOrphanedEvents() {
  const orphanedResult = await query(`
    SELECT id FROM events
    WHERE id NOT IN (SELECT DISTINCT canonical_event_id FROM proto_events WHERE canonical_event_id IS NOT NULL)
  `);

  const orphanedEventIds = orphanedResult.rows.map(r => r.id);

  if (orphanedEventIds.length === 0) {
    return { deleted: 0 };
  }

  // 删除 hypotheses
  await query(`
    DELETE FROM hypotheses
    WHERE story_id IN (SELECT story_id FROM events WHERE id = ANY($1::int[]) AND story_id IS NOT NULL)
  `, [orphanedEventIds]);

  // 删除 event_relationships
  await query(`
    DELETE FROM event_relationships
    WHERE source_event_id = ANY($1::int[])
       OR target_event_id = ANY($1::int[])
  `, [orphanedEventIds]);

  // 删除 event_news
  await query(`DELETE FROM event_news WHERE event_id = ANY($1::int[])`, [orphanedEventIds]);

  // 删除孤立事件
  await query(`DELETE FROM events WHERE id = ANY($1::int[])`, [orphanedEventIds]);

  return { deleted: orphanedEventIds.length };
}