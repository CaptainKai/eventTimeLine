import { query } from '../lib/db/connection.mjs';
import { getRelationshipGraph } from '../lib/db/event-relationships-queries.mjs';

async function fixAllEventTitles() {
  try {
    console.log('[Fix] Starting to update all event titles in database...');
    
    // 1. 获取所有事件 ID
    const eventsResult = await query('SELECT id FROM events');
    const eventIds = eventsResult.rows.map(r => r.id);
    console.log(`[Fix] Found ${eventIds.length} events to process.`);

    // 2. 分批处理（避免一次性查询过多数据）
    const batchSize = 100;
    for (let i = 0; i < eventIds.length; i += batchSize) {
      const batchIds = eventIds.slice(i, i + batchSize);
      console.log(`[Fix] Processing batch ${i / batchSize + 1}...`);

      // 使用我们重构后的逻辑获取带有新名称的节点
      const graph = await getRelationshipGraph(batchIds);
      
      for (const node of graph.nodes) {
        // 更新数据库中的 normalized_data->>'title'
        await query(
          "UPDATE events SET normalized_data = jsonb_set(COALESCE(normalized_data, '{}'::jsonb), '{title}', $1) WHERE id = $2",
          [`"${node.name}"`, node.id]
        );
      }
    }

    console.log('[Fix] All event titles updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[Fix] Error updating event titles:', error);
    process.exit(1);
  }
}

fixAllEventTitles();
