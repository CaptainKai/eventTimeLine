import { query } from '../lib/db/connection.mjs';

async function check() {
  // 检查 news 表的 normalized_data
  const news = await query(`
    SELECT id, normalized_data
    FROM news
    WHERE id IN (SELECT DISTINCT news_id FROM proto_events LIMIT 1)
  `);
  console.log('news.normalized_data:');
  console.log(JSON.stringify(news.rows[0].normalized_data, null, 2));

  // 检查有 llm_parse_results 的新闻的 proto_events
  const llmNews = await query(`
    SELECT
      lpr.news_id,
      lpr.proto_event_count,
      lpr.model_used,
      lpr.status,
      COUNT(pe.id) as actual_proto_count
    FROM llm_parse_results lpr
    LEFT JOIN proto_events pe ON pe.news_id = lpr.news_id
    GROUP BY lpr.news_id, lpr.proto_event_count, lpr.model_used, lpr.status
    LIMIT 5
  `);
  console.log('\n有 llm_parse_results 的新闻:');
  llmNews.rows.forEach(r => {
    console.log(`  news_id: ${r.news_id}, llm_proto_count: ${r.proto_event_count}, actual: ${r.actual_proto_count}, model: ${r.model_used}`);
  });

  process.exit(0);
}

check().catch(console.error);
