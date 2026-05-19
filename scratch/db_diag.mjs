import db from '../lib/db/connection.mjs';

async function main() {
  db.initDB();
  try {
    console.log('--- 获取全局 Summary (Top 100) ---');
    const nodesRes = await db.query(`
      SELECT id FROM relationship_summaries
      ORDER BY member_count DESC, updated_at DESC
      LIMIT 100
    `);
    const nodeIds = nodesRes.rows.map(n => n.id);
    console.log(`Top 100 Summary 数量: ${nodeIds.length}`);

    if (nodeIds.length === 0) {
      console.log('无 Summary 节点');
      return;
    }

    console.log('\n--- 测试 1: 原始 COUNT(DISTINCT) SQL 性能 (带 EXPLAIN ANALYZE) ---');
    const start1 = Date.now();
    const res1 = await db.query(`
      EXPLAIN ANALYZE
      WITH edge_links AS (
        SELECT 
          rse1.summary_id AS source,
          rse2.summary_id AS target,
          COUNT(DISTINCT rse1.atomic_relationship_id)::int AS edge_weight
        FROM relationship_summary_edges rse1
        JOIN relationship_summary_edges rse2 ON rse1.atomic_relationship_id = rse2.atomic_relationship_id
        WHERE rse1.summary_id = ANY($1::int[])
          AND rse2.summary_id = ANY($1::int[])
          AND rse1.summary_id < rse2.summary_id
        GROUP BY rse1.summary_id, rse2.summary_id
      ),
      node_links AS (
        SELECT 
          rsm1.summary_id AS source,
          rsm2.summary_id AS target,
          COUNT(DISTINCT rsm1.proto_event_id)::int AS node_weight
        FROM relationship_summary_members rsm1
        JOIN relationship_summary_members rsm2 ON rsm1.proto_event_id = rsm2.proto_event_id
        WHERE rsm1.summary_id = ANY($1::int[])
          AND rsm2.summary_id = ANY($1::int[])
          AND rsm1.summary_id < rsm2.summary_id
        GROUP BY rsm1.summary_id, rsm2.summary_id
      )
      SELECT 
        COALESCE(el.source, nl.source) AS source,
        COALESCE(el.target, nl.target) AS target,
        (COALESCE(el.edge_weight, 0) + COALESCE(nl.node_weight, 0))::int AS weight,
        COALESCE(el.edge_weight, 0)::int AS edge_weight,
        COALESCE(nl.node_weight, 0)::int AS bridge_weight
      FROM edge_links el
      FULL OUTER JOIN node_links nl ON el.source = nl.source AND el.target = nl.target
      WHERE (COALESCE(el.edge_weight, 0) + COALESCE(nl.node_weight, 0)) > 0
    `, [nodeIds]);
    console.log(`测试 1 (原始 SQL EXPLAIN ANALYZE) 耗时: ${Date.now() - start1}ms`);

    console.log('\n--- 测试 2: 优化后的 COUNT(*) SQL 性能 (带 EXPLAIN ANALYZE) ---');
    // 因为 summary_id 和 proto_event_id 是联合主键/唯一索引，所以 COUNT(DISTINCT proto_event_id) 等价于 COUNT(*)
    // 同理，summary_id 和 atomic_relationship_id 是联合主键/唯一索引，所以 COUNT(DISTINCT atomic_relationship_id) 等价于 COUNT(*)
    const start2 = Date.now();
    const res2 = await db.query(`
      EXPLAIN ANALYZE
      WITH edge_links AS (
        SELECT 
          rse1.summary_id AS source,
          rse2.summary_id AS target,
          COUNT(*)::int AS edge_weight
        FROM relationship_summary_edges rse1
        JOIN relationship_summary_edges rse2 ON rse1.atomic_relationship_id = rse2.atomic_relationship_id
        WHERE rse1.summary_id = ANY($1::int[])
          AND rse2.summary_id = ANY($1::int[])
          AND rse1.summary_id < rse2.summary_id
        GROUP BY rse1.summary_id, rse2.summary_id
      ),
      node_links AS (
        SELECT 
          rsm1.summary_id AS source,
          rsm2.summary_id AS target,
          COUNT(*)::int AS node_weight
        FROM relationship_summary_members rsm1
        JOIN relationship_summary_members rsm2 ON rsm1.proto_event_id = rsm2.proto_event_id
        WHERE rsm1.summary_id = ANY($1::int[])
          AND rsm2.summary_id = ANY($1::int[])
          AND rsm1.summary_id < rsm2.summary_id
        GROUP BY rsm1.summary_id, rsm2.summary_id
      )
      SELECT 
        COALESCE(el.source, nl.source) AS source,
        COALESCE(el.target, nl.target) AS target,
        (COALESCE(el.edge_weight, 0) + COALESCE(nl.node_weight, 0))::int AS weight,
        COALESCE(el.edge_weight, 0)::int AS edge_weight,
        COALESCE(nl.node_weight, 0)::int AS bridge_weight
      FROM edge_links el
      FULL OUTER JOIN node_links nl ON el.source = nl.source AND el.target = nl.target
      WHERE (COALESCE(el.edge_weight, 0) + COALESCE(nl.node_weight, 0)) > 0
    `, [nodeIds]);
    console.log(`测试 2 (优化 COUNT(*) SQL EXPLAIN ANALYZE) 耗时: ${Date.now() - start2}ms`);
    console.log('测试 2 执行计划主要部分:');
    console.log(res2.rows.slice(0, 15).map(r => r['QUERY PLAN']).join('\n'));

    console.log('\n--- 测试 3: Node.js 内存计算方案耗时测试 ---');
    const start3 = Date.now();
    
    // 1. 获取 edges 数据
    const edgesStart = Date.now();
    const edgesRes = await db.query(`
      SELECT summary_id, atomic_relationship_id 
      FROM relationship_summary_edges 
      WHERE summary_id = ANY($1::int[])
    `, [nodeIds]);
    const dbEdgesTime = Date.now() - edgesStart;

    // 2. 获取 members 数据
    const membersStart = Date.now();
    const membersRes = await db.query(`
      SELECT summary_id, proto_event_id 
      FROM relationship_summary_members 
      WHERE summary_id = ANY($1::int[])
    `, [nodeIds]);
    const dbMembersTime = Date.now() - membersStart;

    console.log(`  [DB] 获取 ${edgesRes.rows.length} 条边数据耗时: ${dbEdgesTime}ms`);
    console.log(`  [DB] 获取 ${membersRes.rows.length} 条成员数据耗时: ${dbMembersTime}ms`);

    // 3. 在内存中进行多对多映射与笛卡尔积关联计算
    const jsStart = Date.now();
    
    // 3.1 处理 edges 关联 (共享边重量)
    const edgeToSummaries = new Map();
    for (const row of edgesRes.rows) {
      const eid = row.atomic_relationship_id;
      const sid = row.summary_id;
      if (!edgeToSummaries.has(eid)) {
        edgeToSummaries.set(eid, []);
      }
      edgeToSummaries.get(eid).push(sid);
    }

    const pairWeights = new Map(); // Key: 's1-s2', Value: { edge_weight: 0, node_weight: 0 }
    const getOrCreatePair = (s1, s2) => {
      const source = Math.min(s1, s2);
      const target = Math.max(s1, s2);
      const key = `${source}-${target}`;
      if (!pairWeights.has(key)) {
        pairWeights.set(key, { source, target, edge_weight: 0, node_weight: 0 });
      }
      return pairWeights.get(key);
    };

    for (const [eid, summaries] of edgeToSummaries.entries()) {
      if (summaries.length < 2) continue;
      for (let i = 0; i < summaries.length; i++) {
        for (let j = i + 1; j < summaries.length; j++) {
          const pair = getOrCreatePair(summaries[i], summaries[j]);
          pair.edge_weight++;
        }
      }
    }

    // 3.2 处理 members 关联 (桥接事件重量)
    const protoToSummaries = new Map();
    for (const row of membersRes.rows) {
      const pid = row.proto_event_id;
      const sid = row.summary_id;
      if (!protoToSummaries.has(pid)) {
        protoToSummaries.set(pid, []);
      }
      protoToSummaries.get(pid).push(sid);
    }

    for (const [pid, summaries] of protoToSummaries.entries()) {
      if (summaries.length < 2) continue;
      for (let i = 0; i < summaries.length; i++) {
        for (let j = i + 1; j < summaries.length; j++) {
          const pair = getOrCreatePair(summaries[i], summaries[j]);
          pair.node_weight++;
        }
      }
    }

    // 3.3 整理输出格式
    const links = [];
    for (const pair of pairWeights.values()) {
      const weight = pair.edge_weight + pair.node_weight;
      if (weight > 0) {
        links.push({
          source: pair.source,
          target: pair.target,
          weight,
          edge_weight: pair.edge_weight,
          bridge_weight: pair.node_weight
        });
      }
    }

    const jsTime = Date.now() - jsStart;
    const totalTime3 = Date.now() - start3;
    console.log(`  [JS] 内存笛卡尔积计算耗时: ${jsTime}ms`);
    console.log(`测试 3 (JS 内存计算方案) 总耗时: ${totalTime3}ms, 得到链接数: ${links.length}`);

  } catch (error) {
    console.error('诊断出错:', error);
  } finally {
    await db.closeDB();
  }
}

main();
