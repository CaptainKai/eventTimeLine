import { query } from '../lib/db/connection.mjs';

async function check() {
  // 查看最新记录
  const result = await query(`
    SELECT id, news_id, raw_response, proto_event_count, model_used
    FROM llm_parse_results
    ORDER BY id DESC
    LIMIT 5
  `);
  console.log('最新 5 条 llm_parse_results:');
  result.rows.forEach(r => {
    console.log('---');
    console.log('id:', r.id, ', news_id:', r.news_id, ', model:', r.model_used);
    console.log('raw_response:', JSON.stringify(r.raw_response, null, 2));
  });
  process.exit(0);
}

check();
