import { initDB } from '../lib/db/connection.mjs';
import { getNewsProtoEvents } from '../lib/db/news-queries.mjs';

async function test() {
  console.log('初始化数据库连接...');
  await initDB();

  console.log('查询新闻 1671 的原子事件...');
  const protoEvents = await getNewsProtoEvents(1671);
  console.log('查询结果:', protoEvents.length, '条');

  protoEvents.forEach((pe, i) => {
    console.log(`\n事件 ${i + 1}:`);
    console.log('  id:', pe.id);
    console.log('  actor_raw:', pe.actor_raw);
    console.log('  object_raw:', pe.object_raw);
    console.log('  action_raw:', pe.action_raw);
    console.log('  event_time:', pe.event_time);
    console.log('  canonical_event_id:', pe.canonical_event_id);
    console.log('  news_id:', pe.news_id);
    console.log('  actor_name:', pe.actor_name);
    console.log('  object_name:', pe.object_name);
  });

  process.exit(0);
}

test().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});