/**
 * 诊断脚本：检查原子事实与事件的关联问题
 */
import { query } from '../lib/db/connection.mjs';

async function diagnoseIssues() {
  console.log('=== 检查事件 744 的详细信息 ===\n');

  // 查找事件 744 的详情
  const eventResult = await query(`
    SELECT id, event_type, title, actor1_name, actor2_name, location_name, start_time
    FROM events
    WHERE id = 744
  `);

  if (eventResult.rows.length > 0) {
    const event = eventResult.rows[0];
    console.log(`事件 ID: ${event.id}`);
    console.log(`  类型: ${event.event_type}`);
    console.log(`  标题: ${event.title}`);
    console.log(`  Actor1: ${event.actor1_name}`);
    console.log(`  Actor2: ${event.actor2_name}`);
    console.log(`  地点: ${event.location_name}`);
    console.log(`  时间: ${event.start_time}`);
  }

  // 检查事件新闻关联表
  console.log('\n=== 检查 event_news 关联表 ===\n');

  const eventNewsResult = await query(`
    SELECT en.event_id, en.news_id, en.confidence, n.title as news_title
    FROM event_news en
    JOIN news n ON en.news_id = n.id
    WHERE en.event_id = 744
    LIMIT 20
  `);

  console.log(`事件 744 关联的新闻数量: ${eventNewsResult.rows.length}`);
  for (const en of eventNewsResult.rows) {
    console.log(`  - 新闻 ${en.news_id}: ${en.news_title} (置信度: ${en.confidence})`);
  }

  // 检查事件是否正确关联到新闻
  console.log('\n=== 检查 news.event_id 字段 ===\n');

  const newsWithEvent = await query(`
    SELECT n.id, n.title, n.event_id, e.event_type
    FROM news n
    LEFT JOIN events e ON n.event_id = e.id
    WHERE n.id = 438
  `);

  console.log('新闻 438 的 event_id 关联:');
  console.log(JSON.stringify(newsWithEvent.rows, null, 2));

  // 检查原子事实的 actor_entity_id 和 object_entity_id 是否有值
  console.log('\n=== 检查原子事实的实体映射 ===\n');

  const protoDetail = await query(`
    SELECT id, actor_raw, actor_entity_id, object_raw, object_entity_id, location_raw, location_id
    FROM proto_events
    WHERE news_id = 438
    LIMIT 5
  `);

  console.log('原子事实实体映射:');
  console.log(JSON.stringify(protoDetail.rows, null, 2));

  // 统计总体的原子事实数量
  console.log('\n=== 统计原子事实 ===\n');

  const protoStats = await query(`
    SELECT COUNT(*) as total, COUNT(DISTINCT news_id) as unique_news
    FROM proto_events
  `);

  console.log(`总原子事实: ${protoStats.rows[0].total}`);
  console.log(`涉及新闻数: ${protoStats.rows[0].unique_news}`);
}

diagnoseIssues()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });