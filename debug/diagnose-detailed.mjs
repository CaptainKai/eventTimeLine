/**
 * 诊断脚本：深入分析原子事实重复问题
 */
import { query } from '../lib/db/connection.mjs';

async function diagnose() {
  console.log('=== 分析新闻 438 的原子事实 ===\n');

  // 查看所有原子事实
  const protos = await query(`
    SELECT id, actor_raw, action_raw, object_raw, location_raw, extraction_confidence, created_at
    FROM proto_events
    WHERE news_id = 438
    ORDER BY id
  `);

  console.log(`新闻 438 共有 ${protos.rows.length} 条原子事实:\n`);
  for (const p of protos.rows) {
    console.log(`  [${p.id}] actor="${p.actor_raw}" action="${p.action_raw}" object="${p.object_raw}" loc="${p.location_raw}" conf=${p.extraction_confidence}`);
  }

  // 检查这些原子事实是否有重复
  console.log('\n=== 检查原子事实重复模式 ===\n');

  const duplicates = await query(`
    SELECT actor_raw, action_raw, object_raw, COUNT(*) as cnt
    FROM proto_events
    WHERE news_id = 438
    GROUP BY actor_raw, action_raw, object_raw
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);

  console.log('重复的原子事实组合:');
  for (const d of duplicates.rows) {
    console.log(`  "${d.actor_raw}" + "${d.action_raw}" + "${d.object_raw}" => ${d.cnt} 次`);
  }

  // 检查事件 744 的详情
  console.log('\n=== 检查事件 744 ===\n');

  const event = await query(`
    SELECT id, event_type, action, actor1_id, actor2_id, location_id, start_time, current_importance, total_mentions
    FROM events
    WHERE id = 744
  `);

  console.log('事件 744:');
  console.log(JSON.stringify(event.rows[0], null, 2));

  // 检查 news 表中 event_id 的分布
  console.log('\n=== 检查没有 event_id 的新闻 ===\n');

  const newsWithoutEvent = await query(`
    SELECT COUNT(*) as cnt FROM news WHERE event_id IS NULL
  `);
  console.log(`没有关联事件的新闻数量: ${newsWithoutEvent.rows[0].cnt}`);

  // 检查 proto_events 表中 news_id 的分布
  console.log('\n=== 检查没有 news_id 的原子事实 ===\n');

  const protoWithoutNews = await query(`
    SELECT COUNT(*) as cnt FROM proto_events WHERE news_id IS NULL
  `);
  console.log(`没有关联新闻的原子事实数量: ${protoWithoutNews.rows[0].cnt}`);
}

diagnose()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });