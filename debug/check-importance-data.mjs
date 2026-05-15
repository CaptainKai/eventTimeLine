import { query } from '../lib/db/connection.mjs';

async function checkImportanceData() {
  // 查询 importance >= 0.5 的 jin10 新闻及其关联情况
  const sql = `
    SELECT
      n.id as news_id,
      n.title,
      n.importance,
      n.normalized_data->>'proto_event_count' as proto_event_count_in_metadata,
      COUNT(pe.id) as actual_proto_events,
      COUNT(DISTINCT pe.canonical_event_id) as canonical_events,
      COUNT(en.id) as event_news_links
    FROM news n
    LEFT JOIN proto_events pe ON pe.news_id = n.id
    LEFT JOIN event_news en ON en.news_id = n.id
    WHERE n.source = 'jin10' AND n.importance >= 0.5
    GROUP BY n.id, n.title, n.importance, n.normalized_data
    ORDER BY n.importance DESC, n.id DESC
    LIMIT 20
  `;

  console.log('=== importance >= 0.5 的 jin10 新闻关联情况 ===\n');

  const result = await query(sql);

  console.log(`共 ${result.rows.length} 条 (显示前20条)\n`);
  console.log('news_id | importance | proto_count(元数据) | actual_proto | canonical_events | event_news_links | 标题');
  console.log('-'.repeat(120));

  result.rows.forEach(row => {
    const title = row.title?.slice(0, 30) || '';
    console.log(`${row.news_id} | ${row.importance} | ${row.proto_event_count_in_metadata || 'null'} | ${row.actual_proto_events} | ${row.canonical_events} | ${row.event_news_links} | ${title}...`);
  });

  // 统计总体情况
  const statsSql = `
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN pe.id IS NOT NULL THEN 1 END) as has_proto,
      COUNT(CASE WHEN en.id IS NOT NULL THEN 1 END) as has_event_news
    FROM news n
    LEFT JOIN proto_events pe ON pe.news_id = n.id
    LEFT JOIN event_news en ON en.news_id = n.id
    WHERE n.source = 'jin10' AND n.importance >= 0.5
  `;

  const stats = await query(statsSql);
  console.log('\n=== 统计 ===');
  console.log(`importance >= 0.5 的 jin10 新闻总数: ${stats.rows[0].total}`);
  console.log(`有 proto_events 的: ${stats.rows[0].has_proto}`);
  console.log(`有 event_news 关联的: ${stats.rows[0].has_event_news}`);

  process.exit(0);
}

checkImportanceData().catch(console.error);
