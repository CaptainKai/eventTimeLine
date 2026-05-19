const { Client } = require('pg');

const client = new Client('postgres://postgres:123456@localhost:5432/timeline');

async function run() {
  await client.connect();

  console.log("=== 正在查询表的总行数 ===");
  const tables = [
    'proto_events', 
    'relationship_summaries', 
    'summary_members', 
    'atomic_event_relationships'
  ];

  for (const table of tables) {
    try {
      const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`${table} count:`, res.rows[0].count);
    } catch(e) {
      console.log(`Error querying ${table}:`, e.message);
    }
  }

  console.log("\n=== 采样 relationship_summaries (包含成员数量) ===");
  try {
    const summaryRes = await client.query(`
      SELECT s.id, s.summary_type, s.canonical_event_id, s.status, COUNT(m.proto_event_id) as member_count
      FROM relationship_summaries s
      LEFT JOIN summary_members m ON s.id = m.summary_id
      GROUP BY s.id, s.summary_type, s.canonical_event_id, s.status
      ORDER BY member_count DESC
      LIMIT 10
    `);
    console.table(summaryRes.rows);
  } catch(e) {
    console.log("Error:", e.message);
  }

  console.log("\n=== 采样具有较多成员的 relationship_summaries 对应的边数 ===");
  try {
    const edgeRes = await client.query(`
      SELECT summary_id, COUNT(*) as edge_count, AVG(weight) as avg_weight
      FROM atomic_event_relationships
      GROUP BY summary_id
      ORDER BY edge_count DESC
      LIMIT 10
    `);
    console.table(edgeRes.rows);
  } catch(e) {
    console.log("Error:", e.message);
  }

  await client.end();
}

run();
