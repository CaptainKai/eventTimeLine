const { Client } = require('pg');

const client = new Client('postgres://postgres:123456@localhost:5432/timeline');

async function run() {
  await client.connect();

  console.log("=== 正在查询表的总行数 ===");
  const tables = [
    'proto_events', 
    'relationship_summaries', 
    'relationship_summary_members', 
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
      LEFT JOIN relationship_summary_members m ON s.id = m.summary_id
      GROUP BY s.id, s.summary_type, s.canonical_event_id, s.status
      ORDER BY member_count DESC
      LIMIT 20
    `);
    console.table(summaryRes.rows);
  } catch(e) {
    console.log("Error:", e.message);
  }

  console.log("\n=== 采样具有较多成员的 relationship_summaries 内部的原子边数量 ===");
  // 注意，我需要看看 atomic_event_relationships 表的结构才能知道怎么 JOIN 或关联到 summary
  try {
    const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='atomic_event_relationships'`);
    console.log("atomic_event_relationships columns:", cols.rows.map(r=>r.column_name).join(', '));
  } catch (e) {
     console.log(e.message);
  }

  await client.end();
}

run();
