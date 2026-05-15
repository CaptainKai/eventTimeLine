import { query } from '../lib/db/connection.mjs';

async function checkUnparsed() {
  // 查看未解析新闻的特征
  const sql = `
    SELECT n.id, n.title, n.source, n.importance, n.normalized_data, n.created_at
    FROM news n
    LEFT JOIN proto_events pe ON n.id = pe.news_id
    WHERE pe.id IS NULL AND n.source = 'jin10'
    ORDER BY n.created_at DESC
    LIMIT 10
  `;

  const result = await query(sql);
  console.log('未解析的 jin10 新闻样例:');
  result.rows.forEach(row => {
    console.log(`- ID: ${row.id}, importance: ${row.importance}, title: ${row.title?.slice(0, 50)}...`);
    console.log(`  normalized_data: ${JSON.stringify(row.normalized_data)}`);
    console.log(`  created_at: ${row.created_at}`);
    console.log();
  });

  // 统计未解析新闻的 importance 分布
  const statsSql = `
    SELECT importance, COUNT(*) as count
    FROM news n
    LEFT JOIN proto_events pe ON n.id = pe.news_id
    WHERE pe.id IS NULL AND n.source = 'jin10'
    GROUP BY importance
    ORDER BY importance DESC
  `;
  const stats = await query(statsSql);
  console.log('\n未解析新闻的 importance 分布:');
  stats.rows.forEach(row => {
    console.log(`  importance=${row.importance}: ${row.count} 条`);
  });

  process.exit(0);
}

checkUnparsed().catch(console.error);
