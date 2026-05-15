import { initDB } from '../lib/db/connection.mjs';
import { getNewsById, getNewsProtoEvents } from '../lib/db/news-queries.mjs';

async function test() {
  console.log('初始化数据库连接...');
  await initDB();

  console.log('=== 测试 getNewsById ===');
  const news = await getNewsById(1671);
  console.log('News:', { id: news.id, event_id: news.event_id, title: news.title });

  console.log('\n=== 测试 getNewsProtoEvents ===');
  const protoEvents = await getNewsProtoEvents(1671);
  console.log('protoEvents:', protoEvents.map(pe => ({
    id: pe.id,
    canonical_event_id: pe.canonical_event_id,
    actor: pe.actor_raw,
    action: pe.action_raw,
    object: pe.object_raw
  })));

  console.log('\n=== 模拟 API 返回 ===');
  const lineageData = {
    article: news,
    proto_events: protoEvents,
    canonical_event_id: protoEvents.find(pe => pe.canonical_event_id)?.canonical_event_id || null
  };
  console.log('lineageData:', {
    ...lineageData,
    proto_events: lineageData.proto_events.length + ' 条'
  });
  console.log('canonical_event_id:', lineageData.canonical_event_id);

  process.exit(0);
}

test().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});