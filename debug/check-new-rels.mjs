import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'timeline',
  user: 'postgres',
  password: '123456',
});

async function main() {
  // 看这 100 个最新事件的 actor / location 情况
  const events = await pool.query(`
    SELECT id, event_type, actor1_id, actor2_id, location_id, start_time
    FROM events
    WHERE id >= 1512
    ORDER BY id DESC
    LIMIT 20
  `);
  console.log('最新 20 个事件的 actors/locations:');
  events.rows.forEach(e => {
    console.log(`  ${e.id}: type=${e.event_type}, actor1=${e.actor1_id}, actor2=${e.actor2_id}, loc=${e.location_id}, time=${e.start_time}`);
  });

  // 看这 15 条新关系是从哪个 source 指向哪个 target
  const newRels = await pool.query(`
    SELECT source_event_id, target_event_id, relationship_type, weight
    FROM event_relationships
    WHERE source_event_id > 1510 OR target_event_id > 1510
    ORDER BY created_at DESC
    LIMIT 30
  `);
  console.log('\n新关系的 source/target:');
  newRels.rows.forEach(r => {
    console.log(`  ${r.source_event_id} -> ${r.target_event_id} [${r.relationship_type}] w=${r.weight.toFixed(3)}`);
  });

  // 看看有没有 source > 1510 的
  const newSources = await pool.query(`
    SELECT DISTINCT source_event_id FROM event_relationships
    WHERE source_event_id > 1510
  `);
  console.log('\nsource > 1510 的:', newSources.rows);

  await pool.end();
}

main().catch(console.error);
