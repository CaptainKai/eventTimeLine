import { query } from './connection.mjs';

export async function listAdsTopicTrends(limit = 20) {
  const result = await query(`SELECT bucket_start,topic_key,event_count,avg_confidence,unique_entity_count,updated_at FROM ads_topic_trend_1h ORDER BY bucket_start DESC,event_count DESC LIMIT $1`, [Math.min(Math.max(Number(limit), 1), 100)]);
  return result.rows.map(row => ({
    id: `ads:${row.bucket_start.toISOString()}:${row.topic_key}`,
    title: row.topic_key,
    description: `Hourly topic aggregate with ${row.unique_entity_count} unique entities`,
    member_count: row.event_count,
    edge_count: 0,
    avg_confidence: Number(row.avg_confidence || 0),
    time_start: row.bucket_start,
    time_end: new Date(row.bucket_start.getTime() + 3600000),
    schema_version: 'ads-topic-trend-v1',
  }));
}

export async function recordAuthorityAudit(record) {
  await query(`INSERT INTO authority_switch_audit(domain,requested_mode,effective_mode,primary_count,shadow_count,overlap_count,match_ratio,duration_ms,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [record.domain,record.requested_mode,record.effective_mode,record.primary_count ?? null,record.shadow_count ?? null,record.overlap_count ?? null,record.match_ratio ?? null,record.duration_ms || 0,JSON.stringify(record.metadata || {})]);
}
