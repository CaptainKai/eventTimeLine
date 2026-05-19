const { Client } = require('pg');

const client = new Client('postgres://postgres:123456@localhost:5432/timeline');

async function run() {
  await client.connect();

  console.log("=== 1. atomic_event_relationships 类型和权重分布 ===");
  const edgeDistRes = await client.query(`
    SELECT relationship_type, COUNT(*) as count, AVG(weight) as avg_weight, AVG(confidence) as avg_conf
    FROM atomic_event_relationships
    GROUP BY relationship_type
    ORDER BY count DESC
  `);
  console.table(edgeDistRes.rows);

  console.log("\n=== 2. 查看是否有大量重复或非常低权重的边 ===");
  const lowWeightRes = await client.query(`
    SELECT COUNT(*) as low_weight_count
    FROM atomic_event_relationships
    WHERE weight < 0.2
  `);
  console.table(lowWeightRes.rows);

  console.log("\n=== 3. 采样几条 relationship_type 数量最多的边看看 description ==");
  if (edgeDistRes.rows.length > 0) {
    const topType = edgeDistRes.rows[0].relationship_type;
    const sampleRes = await client.query(`
      SELECT source_proto_event_id, target_proto_event_id, weight, confidence, evidence, description
      FROM atomic_event_relationships
      WHERE relationship_type = $1
      LIMIT 5
    `, [topType]);
    console.log(sampleRes.rows);
  }

  await client.end();
}

run();
