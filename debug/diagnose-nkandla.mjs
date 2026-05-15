/**
 * 诊断脚本：检查 Nkandla 相关新闻的原子事实
 */
import { query } from '../lib/db/connection.mjs';

async function diagnoseNkandla() {
  console.log('=== 查找 Nkandla 相关新闻 ===\n');

  // 1. 查找包含 Nkandla 的新闻
  const newsResult = await query(`
    SELECT id, title, source, event_id, published_at
    FROM news
    WHERE title ILIKE '%Nkandla%' OR content ILIKE '%Nkandla%'
    ORDER BY published_at DESC
    LIMIT 20
  `);

  console.log(`找到 ${newsResult.rows.length} 条相关新闻:\n`);
  for (const news of newsResult.rows) {
    console.log(`新闻 ID: ${news.id}`);
    console.log(`  标题: ${news.title}`);
    console.log(`  来源: ${news.source}`);
    console.log(`  事件ID: ${news.event_id}`);
    console.log(`  发布时间: ${news.published_at}`);

    // 2. 查找该新闻的原子事实
    const protoResult = await query(`
      SELECT id, actor_raw, action_raw, object_raw, location_raw, created_at
      FROM proto_events
      WHERE news_id = $1
      ORDER BY created_at ASC
    `, [news.id]);

    console.log(`  原子事实数量: ${protoResult.rows.length}`);
    for (const proto of protoResult.rows) {
      console.log(`    - [${proto.id}] ${proto.actor_raw} ${proto.action_raw} ${proto.object_raw} @ ${proto.location_raw}`);
    }
    console.log('');
  }

  // 3. 统计：没有关联新闻的原子事实
  console.log('=== 检查孤立原子事实（没有关联新闻）===\n');

  const orphanedProto = await query(`
    SELECT pe.id, pe.actor_raw, pe.action_raw, pe.object_raw, pe.news_id, pe.created_at
    FROM proto_events pe
    WHERE pe.news_id IS NULL
    ORDER BY pe.created_at DESC
    LIMIT 20
  `);

  console.log(`孤立原子事实数量: ${orphanedProto.rows.length}`);
  for (const proto of orphanedProto.rows) {
    console.log(`  - [${proto.id}] news_id=${proto.news_id} | ${proto.actor_raw} ${proto.action_raw} ${proto.object_raw}`);
  }

  // 4. 统计：没有关联事件的新闻
  console.log('\n=== 检查孤立新闻（没有关联事件）===\n');

  const orphanedNews = await query(`
    SELECT n.id, n.title, n.source
    FROM news n
    WHERE n.event_id IS NULL
    ORDER BY n.published_at DESC
    LIMIT 10
  `);

  console.log(`孤立新闻数量: ${orphanedNews.rows.length}`);
  for (const news of orphanedNews.rows) {
    console.log(`  - [${news.id}] ${news.title} (${news.source})`);
  }
}

diagnoseNkandla()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });