import pg from 'pg';
import fetch from 'node-fetch';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'timeline',
  user: 'postgres',
  password: '123456',
});

async function main() {
  // 获取最新 100 个事件的 ID（与 API /events/graph 一致）
  const eventsRes = await pool.query(`
    SELECT id FROM events ORDER BY id DESC LIMIT 100
  `);
  const eventIds = eventsRes.rows.map(r => r.id);
  console.log(`待分析事件数: ${eventIds.length}, ID范围: ${Math.min(...eventIds)} ~ ${Math.max(...eventIds)}`);

  // 找出这批事件中还没有作为 source 分析过的事件
  const alreadyDone = await pool.query(`
    SELECT DISTINCT source_event_id FROM event_relationships
    WHERE source_event_id = ANY($1::int[])
  `, [eventIds]);
  const doneSet = new Set(alreadyDone.rows.map(r => r.source_event_id));

  const toAnalyze = eventIds.filter(id => !doneSet.has(id));
  console.log(`已完成关系分析: ${doneSet.size} 个, 需重新分析: ${toAnalyze.length} 个`);

  if (toAnalyze.length === 0) {
    console.log('没有需要分析的事件');
    await pool.end();
    return;
  }

  // 逐个调用 API 做关系分析并保存
  let success = 0;
  let fail = 0;
  let totalRels = 0;

  for (const eventId of toAnalyze) {
    try {
      const resp = await fetch(`http://localhost:3118/api/v1/events/${eventId}/update-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      if (data.success) {
        success++;
        totalRels += data.relationships_added || 0;
        console.log(`  [${eventId}] +${data.relationships_added} 条关系`);
      } else {
        fail++;
        console.error(`  [${eventId}] 失败:`, data.error);
      }
    } catch (e) {
      fail++;
      console.error(`  [${eventId}] 异常:`, e.message);
    }
    // 稍作延时避免压垮服务器
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n完成: 成功 ${success}, 失败 ${fail}, 新增关系 ${totalRels} 条`);

  // 再验证一下现在 /events/graph 返回多少条边
  const graphResp = await fetch('http://localhost:3118/api/v1/events/graph');
  const graphData = await graphResp.json();
  console.log(`\n验证 /events/graph: ${graphData.data?.nodes?.length} 节点, ${graphData.data?.links?.length} 条边`);

  await pool.end();
}

main().catch(console.error);
