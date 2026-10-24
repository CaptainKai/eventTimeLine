import { query } from './connection.mjs';

export async function recordAgentToolAudit(entry) {
  const result = await query(`INSERT INTO agent_tool_audit (request_id,tool_name,arguments,status,result_count,duration_ms,error_code,evidence_ids,data_version) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id`, [entry.request_id,entry.tool_name,JSON.stringify(entry.arguments || {}),entry.status,entry.result_count ?? null,entry.duration_ms,entry.error_code || null,JSON.stringify(entry.evidence_ids || []),entry.data_version || null]);
  return result.rows[0];
}

