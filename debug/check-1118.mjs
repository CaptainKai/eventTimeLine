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
  // 查 1118 是否在 events 表中
  const ev = await pool.query('SELECT id, event_type FROM events WHERE id = 1118');
  console.log('1118 in events:', ev.rows);

  // 查 1118 是否在 event_relationships 里
  const rel = await pool.query('SELECT id, source_event_id, target_event_id FROM event_relationships WHERE source_event_id = 1118 OR target_event_id = 1118 LIMIT 5');
  console.log('1118 in relationships:', rel.rows);

  // 查 1087 是否在 events 表中
  const ev1087 = await pool.query('SELECT id, event_type FROM events WHERE id = 1087');
  console.log('1087 in events:', ev1087.rows);

  // 用 API 的逻辑查一次
  const latestEvents = await pool.query('SELECT id FROM events ORDER BY id DESC LIMIT 100');
  const eventIds = latestEvents.rows.map(r => r.id);
  console.log('\n最新 100 个事件的 ID 范围:', Math.min(...eventIds), '~', Math.max(...eventIds));

  // 查这 100 个事件的 links
  const links = await pool.query(`
    SELECT source_event_id, target_event_id
    FROM event_relationships
    WHERE source_event_id = ANY($1::int[]) OR target_event_id = ANY($1::int[])
    ORDER BY weight DESC LIMIT 20
  `, [eventIds]);
  console.log('\n这些事件的 links:');
  links.rows.forEach(r => console.log(`  ${r.source_event_id} -> ${r.target_event_id}`));

  // 用 allConnectedIds 查 nodes
  const connectedIds = new Set(eventIds);
  links.rows.forEach(r => { connectedIds.add(r.source_event_id); connectedIds.add(r.target_event_id); });
  const allConnectedIds = Array.from(connectedIds);
  console.log('\nallConnectedIds 数量:', allConnectedIds.length);

  const nodes = await pool.query(`
    SELECT e.id, e.event_type FROM events e WHERE e.id = ANY($1::int[])
  `, [allConnectedIds]);
  console.log('实际能从 events 表查到的节点数量:', nodes.rows.length);

  // 哪些 ID 在 links 里但不在 events 里？
  const linkIds = new Set();
  links.rows.forEach(r => { linkIds.add(r.source_event_id); linkIds.add(r.target_event_id); });
  const nodeIds = new Set(nodes.rows.map(n => n.id));
  const dangling = [];
  linkIds.forEach(id => { if (!nodeIds.has(id)) dangling.push(id); });
  console.log('\n dangling IDs (in links but not in events):', dangling);

  await pool.end();
}

main().catch(console.error);
