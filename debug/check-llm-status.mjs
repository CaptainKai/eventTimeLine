import { query } from '../lib/db/connection.mjs';

async function check() {
  // 检查最新的 llm_parse_results
  const recent = await query(`
    SELECT id, news_id, proto_event_count, model_used, status, created_at
    FROM llm_parse_results
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log('最近的 llm_parse_results:');
  recent.rows.forEach(r => {
    console.log(`  id=${r.id}, news_id=${r.news_id}, proto_count=${r.proto_event_count}, model=${r.model_used}`);
  });

  // 检查最新新闻是否有 proto_events
  const newsWithProto = await query(`
    SELECT n.id, n.title, n.source, n.importance, n.created_at, COUNT(pe.id) as proto_count
    FROM news n
    LEFT JOIN proto_events pe ON pe.news_id = n.id
    WHERE n.created_at > NOW() - INTERVAL '1 hour'
    GROUP BY n.id
    ORDER BY n.created_at DESC
    LIMIT 5
  `);
  console.log('\n最近1小时的新闻:');
  newsWithProto.rows.forEach(r => {
    console.log(`  news_id=${r.id}, source=${r.source}, importance=${r.importance}, proto_count=${r.proto_count}`);
  });

  // 检查 llm_parse_results 总数
  const total = await query('SELECT COUNT(*) as count FROM llm_parse_results');
  console.log(`\nllm_parse_results 总数: ${total.rows[0].count}`);

  process.exit(0);
}

check().catch(console.error);
