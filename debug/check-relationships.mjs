import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'timeline',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '123456',
});

async function main() {
  // 1. 总关系数
  const total = await pool.query('SELECT COUNT(*) FROM event_relationships');
  console.log('event_relationships 总行数:', total.rows[0].count);

  // 2. 总事件数
  const totalEvents = await pool.query('SELECT COUNT(*) FROM events');
  console.log('events 总行数:', totalEvents.rows[0].count);

  // 3. 查看关系中涉及的事件ID范围
  const relEvents = await pool.query(`
    SELECT
      MIN(source_event_id) as min_source,
      MAX(source_event_id) as max_source,
      COUNT(DISTINCT source_event_id) as unique_sources,
      COUNT(DISTINCT target_event_id) as unique_targets
    FROM event_relationships
  `);
  console.log('\n关系表统计:', relEvents.rows[0]);

  // 4. 这次 API 返回的 100 个事件 ID 范围
  // 先拿到 API 的 eventIds
  const graphResponse = await fetch('http://localhost:3118/api/v1/events/graph');
  const graphData = await graphResponse.json();
  const eventIds = graphData.data?.nodes?.map(n => n.id) || [];
  console.log('\nAPI 返回的 100 个事件 ID 范围:', Math.min(...eventIds), '~', Math.max(...eventIds));

  // 5. 查这 100 个事件在关系表中作为 source 的次数
  const sourceCount = await pool.query(
    `SELECT COUNT(*) FROM event_relationships WHERE source_event_id = ANY($1::int[])`,
    [eventIds]
  );
  console.log('\n这 100 个事件作为 source 的关系数:', sourceCount.rows[0].count);

  // 6. 查这 100 个事件作为 target 的次数
  const targetCount = await pool.query(
    `SELECT COUNT(*) FROM event_relationships WHERE target_event_id = ANY($1::int[])`,
    [eventIds]
  );
  console.log('这 100 个事件作为 target 的关系数:', targetCount.rows[0].count);

  // 7. 查这 100 个事件在 event_relationships 中出现了多少次（去重）
  const appearCount = await pool.query(`
    SELECT COUNT(*) FROM (
      SELECT source_event_id FROM event_relationships WHERE source_event_id = ANY($1::int[])
      UNION
      SELECT target_event_id FROM event_relationships WHERE target_event_id = ANY($1::int[])
    ) t
  `, [eventIds]);
  console.log('这 100 个事件中在关系表中出现过的数量:', appearCount.rows[0].count);

  // 8. 查当前最新的 100 个事件 ID
  const latestEvents = await pool.query(`
    SELECT id FROM events ORDER BY id DESC LIMIT 100
  `);
  const latestEventIds = latestEvents.rows.map(r => r.id);
  console.log('\n数据库最新 100 个事件 ID 范围:', Math.min(...latestEventIds), '~', Math.max(...latestEventIds));

  const latestSourceCount = await pool.query(
    `SELECT COUNT(*) FROM event_relationships WHERE source_event_id = ANY($1::int[])`,
    [latestEventIds]
  );
  console.log('最新 100 个事件作为 source 的关系数:', latestSourceCount.rows[0].count);

  const latestTargetCount = await pool.query(
    `SELECT COUNT(*) FROM event_relationships WHERE target_event_id = ANY($1::int[])`,
    [latestEventIds]
  );
  console.log('最新 100 个事件作为 target 的关系数:', latestTargetCount.rows[0].count);

  // 9. 交叉：API 的 100 个事件里有关系的数量
  const apiSrcCount = await pool.query(
    `SELECT COUNT(DISTINCT source_event_id) FROM event_relationships WHERE source_event_id = ANY($1::int[])`,
    [eventIds]
  );
  const apiTgtCount = await pool.query(
    `SELECT COUNT(DISTINCT target_event_id) FROM event_relationships WHERE target_event_id = ANY($1::int[])`,
    [eventIds]
  );
  console.log('\nAPI 的 100 个事件中作为 source 出现的唯一事件数:', apiSrcCount.rows[0].count);
  console.log('API 的 100 个事件中作为 target 出现的唯一事件数:', apiTgtCount.rows[0].count);

  // 10. 查看关系表中 source 和 target 不一致的情况
  const crossCheck = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM event_relationships er
       WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = er.source_event_id)) as bad_sources,
      (SELECT COUNT(*) FROM event_relationships er
       WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = er.target_event_id)) as bad_targets
  `);
  console.log('\n关系表中 source 不存在于 events 表的数量:', crossCheck.rows[0].bad_sources);
  console.log('关系表中 target 不存在于 events 表的数量:', crossCheck.rows[0].bad_targets);

  await pool.end();
}

main().catch(console.error);
