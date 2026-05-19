import db from '../lib/db/connection.mjs';
import { getGlobalRelationshipSummaryGraph } from '../lib/db/relationship-summary-queries.mjs';

async function main() {
  db.initDB();
  try {
    console.log('--- 测试优化后的 getGlobalRelationshipSummaryGraph 实际执行 ---');
    const start = Date.now();
    const result = await getGlobalRelationshipSummaryGraph({ minMemberCount: 1, limit: 100 });
    const duration = Date.now() - start;
    
    console.log(`执行成功！总耗时: ${duration}ms`);
    console.log(`节点数: ${result.nodes.length}`);
    console.log(`边连接数: ${result.links.length}`);
    if (result.links.length > 0) {
      console.log('首条链接展示:', result.links[0]);
    }
  } catch (error) {
    console.error('测试出错:', error);
  } finally {
    await db.closeDB();
  }
}

main();
