import { query } from '../lib/db/connection.mjs';
import { getRelationshipGraph } from '../lib/db/event-relationships-queries.mjs';
import { getEvents } from '../lib/db/events-queries.mjs';

async function debugGetRelationshipGraph() {
  try {
    console.log('--- 1. 获取事件列表 ---');
    const events = await getEvents(1, 5); // 获取前5个事件
    const eventIds = events.map(event => event.id);
    console.log('事件ID列表:', eventIds);

    console.log('\n--- 2. 调用 getRelationshipGraph ---');
    const graph = await getRelationshipGraph(eventIds);

    console.log('\n--- 3. 打印节点数据 ---');
    console.log(`节点数量: ${graph.nodes.length}`);
    graph.nodes.forEach(node => {
      console.log(`  事件ID: ${node.id}`);
      console.log(`  类型: ${node.type}`);
      console.log(`  名称: ${node.name}`);
      console.log(`  新闻数量: ${node.total_news_count}`);
    });

    console.log('\n--- 4. 直接查询原子事件 ---');
    const sql = `
      SELECT DISTINCT ON (pe.canonical_event_id)
        pe.canonical_event_id,
        pe.actor_raw,
        pe.action_raw,
        pe.object_raw,
        n.title as news_title
      FROM proto_events pe
      LEFT JOIN news n ON pe.news_id = n.id
      WHERE pe.canonical_event_id = ANY($1::int[])
      ORDER BY pe.canonical_event_id, pe.created_at DESC;
    `;

    const result = await query(sql, [eventIds]);
    console.log('原子事件查询结果:');
    result.rows.forEach(row => {
      console.log(`  事件ID ${row.canonical_event_id}:`);
      console.log(`    新闻标题: ${row.news_title}`);
      console.log(`    Actor: ${row.actor_raw}`);
      console.log(`    Action: ${row.action_raw}`);
      console.log(`    Object: ${row.object_raw}`);
    });
  } catch (error) {
    console.error('错误:', error);
  }
}

debugGetRelationshipGraph().then(() => {
  process.exit(0);
});
