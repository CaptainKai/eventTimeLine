const { Client } = require('pg');

const client = new Client('postgres://postgres:123456@localhost:5432/timeline');

async function run() {
  await client.connect();

  console.log("=== 1. Summary Status 分布 ===");
  const statusRes = await client.query(`
    SELECT summary_status, COUNT(*) as count, SUM(member_count) as total_members, SUM(edge_count) as total_edges
    FROM relationship_summaries
    GROUP BY summary_status
  `);
  console.table(statusRes.rows);

  console.log("\n=== 2. Active Summary 的 Member 和 Edge 统计 ===");
  const statsRes = await client.query(`
    SELECT 
      MIN(member_count) as min_members,
      MAX(member_count) as max_members,
      AVG(member_count) as avg_members,
      MIN(edge_count) as min_edges,
      MAX(edge_count) as max_edges,
      AVG(edge_count) as avg_edges
    FROM relationship_summaries
    WHERE summary_status = 'active'
  `);
  console.table(statsRes.rows);

  console.log("\n=== 3. 边数量最多的 5 个 Active Summary ===");
  const topRes = await client.query(`
    SELECT id, title, summary_kind, member_count, edge_count, 
           (edge_count::float / NULLIF(member_count * (member_count - 1), 0)) as edge_density
    FROM relationship_summaries
    WHERE summary_status = 'active'
    ORDER BY edge_count DESC
    LIMIT 5
  `);
  console.table(topRes.rows);

  console.log("\n=== 4. 提取某个边最多的 Summary 的一些边特征 ===");
  if (topRes.rows.length > 0) {
    const targetSummaryId = topRes.rows[0].id;
    console.log(`Analyzing Summary ID: ${targetSummaryId}`);
    
    const edgeDistRes = await client.query(`
      SELECT relationship_type, COUNT(*) as count, AVG(weight) as avg_weight
      FROM atomic_event_relationships
      WHERE summary_id = $1
      GROUP BY relationship_type
    `, [targetSummaryId]);
    console.table(edgeDistRes.rows);
  } else {
    // 可能是老的数据表结构导致 edge 里面没有 summary_id？我们刚才看 cols 的时候确实有。
    const edgeCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='atomic_event_relationships'`);
    console.log("atomic_event_relationships columns:", edgeCols.rows.map(r=>r.column_name).join(', '));
  }

  await client.end();
}

run();
