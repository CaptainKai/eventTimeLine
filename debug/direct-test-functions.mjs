// 直接测试我们修改的函数，不经过API路由
import { getEvents } from '../lib/db/events-queries.mjs';
import { getRelationshipGraph } from '../lib/db/event-relationships-queries.mjs';

async function testDirect() {
  console.log('--- 直接测试库函数 ---');

  // 1. 首先获取一些事件
  console.log('1. 获取事件列表...');
  const events = await getEvents(1, 5);
  console.log(`获取到 ${events.length} 个事件`);
  events.forEach(e => {
    console.log(`  - 事件 ${e.id}: ${e.event_type} (标题: ${e.title})`);
  });

  // 2. 调用 getRelationshipGraph
  console.log('\n2. 调用 getRelationshipGraph...');
  const eventIds = events.map(e => e.id);
  const graph = await getRelationshipGraph(eventIds);

  console.log(`\n返回的节点数量: ${graph.nodes.length}`);
  graph.nodes.forEach(node => {
    console.log(`  - 节点 ${node.id}: ${node.name}`);
  });
}

testDirect().catch(console.error);
