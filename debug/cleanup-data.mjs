/**
 * 数据清理脚本：删除孤立事件和重复原子事实
 */
import { query } from '../lib/db/connection.mjs';

async function cleanup() {
  console.log('=== 开始数据清理 ===\n');

  // 1. 找出没有新闻关联的事件
  console.log('--- Step 1: 查找孤立事件 ---');

  const orphanedEvents = await query(`
    SELECT e.id, e.event_type, e.start_time, e.total_news_count
    FROM events e
    LEFT JOIN news n ON n.event_id = e.id
    WHERE n.id IS NULL
    LIMIT 50
  `);

  console.log(`发现 ${orphanedEvents.rows.length} 个孤立事件（没有关联新闻）`);

  if (orphanedEvents.rows.length > 0) {
    console.log('孤立事件列表:');
    for (const e of orphanedEvents.rows) {
      console.log(`  - 事件 ${e.id}: ${e.event_type} (${e.start_time})`);
    }

    // 获取孤立事件的ID列表
    const orphanedIds = orphanedEvents.rows.map(e => e.id);

    // 2. 删除孤立事件（先删除关联表中的记录）
    console.log('\n--- Step 2: 删除孤立事件 ---');

    // 删除 event_news 关联
    await query(`
      DELETE FROM event_news WHERE event_id = ANY($1)
    `, [orphanedIds]);

    // 删除 event_relationships 中涉及这些事件的记录
    await query(`
      DELETE FROM event_relationships WHERE source_event_id = ANY($1) OR target_event_id = ANY($1)
    `, [orphanedIds]);

    // 删除孤立事件
    const deleteResult = await query(`
      DELETE FROM events WHERE id = ANY($1) RETURNING id
    `, [orphanedIds]);

    console.log(`删除了 ${deleteResult.rows.length} 个孤立事件`);
  }

  // 3. 对重复原子事实进行去重
  console.log('\n--- Step 3: 原子事实去重 ---');

  // 查找有重复的原子事实组
  const duplicateGroups = await query(`
    SELECT actor_raw, action_raw, object_raw, array_agg(id) as ids, COUNT(*) as cnt
    FROM proto_events
    WHERE news_id IS NOT NULL
    GROUP BY actor_raw, action_raw, object_raw
    HAVING COUNT(*) > 1
  `);

  console.log(`发现 ${duplicateGroups.rows.length} 组重复原子事实`);

  let totalDuplicatesRemoved = 0;

  for (const group of duplicateGroups.rows) {
    // 保留最小ID的那个，删除其他的
    const ids = group.ids.sort((a, b) => a - b);
    const toDelete = ids.slice(1); // 删除除了第一个之外的所有

    const deleteResult = await query(`
      DELETE FROM proto_events WHERE id = ANY($1) RETURNING id
    `, [toDelete]);

    totalDuplicatesRemoved += deleteResult.rows.length;
    console.log(`  处理: "${group.actor_raw}" + "${group.action_raw}" + "${group.object_raw}" => 保留 ${ids[0]}, 删除 ${toDelete.length} 个`);
  }

  console.log(`总共删除了 ${totalDuplicatesRemoved} 条重复原子事实`);

  // 4. 统计清理后的数据
  console.log('\n--- Step 4: 清理后统计 ---');

  const stats = await query(`
    SELECT
      (SELECT COUNT(*) FROM events) as events_count,
      (SELECT COUNT(*) FROM news) as news_count,
      (SELECT COUNT(*) FROM proto_events) as proto_events_count,
      (SELECT COUNT(*) FROM event_news) as event_news_count
  `);

  console.log('清理后数据统计:');
  console.log(`  事件数: ${stats.rows[0].events_count}`);
  console.log(`  新闻数: ${stats.rows[0].news_count}`);
  console.log(`  原子事实数: ${stats.rows[0].proto_events_count}`);
  console.log(`  事件-新闻关联数: ${stats.rows[0].event_news_count}`);

  console.log('\n=== 清理完成 ===');
}

cleanup()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('清理失败:', err);
    process.exit(1);
  });