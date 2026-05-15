import { query } from './connection.mjs';

export async function recordEntityCleanupAudit(entry) {
  const sql = `
    INSERT INTO entity_cleanup_audit (
      entity_id,
      entity_raw_name,
      entity_canonical_name,
      llm_decision,
      reason,
      affected_proto_count,
      affected_event_count,
      affected_story_count,
      deleted_entity_row,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    RETURNING id;
  `;

  const result = await query(sql, [
    entry.entity_id,
    entry.entity_raw_name || null,
    entry.entity_canonical_name || null,
    entry.llm_decision || null,
    entry.reason || null,
    entry.affected_proto_count || 0,
    entry.affected_event_count || 0,
    entry.affected_story_count || 0,
    entry.deleted_entity_row === true,
    JSON.stringify(entry.metadata || {})
  ]);

  return result.rows[0]?.id || null;
}
