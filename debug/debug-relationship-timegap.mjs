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
  // 最新事件 ID 分布
  const latestIds = await pool.query(`
    SELECT id, start_time FROM events ORDER BY id DESC LIMIT 10
  `);
  console.log('最新 10 个事件:', latestIds.rows);

  // 最旧事件 ID 分布
  const oldestIds = await pool.query(`
    SELECT id, start_time FROM events ORDER BY id ASC LIMIT 10
  `);
  console.log('\n最旧 10 个事件:', oldestIds.rows);

  // 关系表中的 source_event_id 分布
  const sourceIds = await pool.query(`
    SELECT source_event_id, COUNT(*) as cnt
    FROM event_relationships
    GROUP BY source_event_id
    ORDER BY source_event_id DESC
    LIMIT 10
  `);
  console.log('\n关系表中 source_event_id 最大的 10 个:', sourceIds.rows);

  // 关系表里的关系：都是哪些事件之间的？
  // 检查关系中涉及的事件总数
  const relScope = await pool.query(`
    SELECT
      COUNT(DISTINCT source_event_id) + COUNT(DISTINCT target_event_id) -
      COUNT(*) as overlapping_count,
      COUNT(DISTINCT source_event_id) as src_count,
      COUNT(DISTINCT target_event_id) as tgt_count
    FROM event_relationships
  `);
  console.log('\n关系表中涉及的唯一事件总数:', relScope.rows[0]);

  // 看看 ID > 1500 的事件有多少关系
  const highIdRels = await pool.query(`
    SELECT COUNT(*) FROM event_relationships
    WHERE source_event_id > 1500 OR target_event_id > 1500
  `);
  console.log('ID > 1500 的事件的关系数:', highIdRels.rows[0].count);

  // ID > 1510 的
  const highIdRels2 = await pool.query(`
    SELECT COUNT(*) FROM event_relationships
    WHERE source_event_id > 1510 OR target_event_id > 1510
  `);
  console.log('ID > 1510 的事件的关系数:', highIdRels2.rows[0].count);

  // 查 API 返回的那 1 条边
  const oneLink = await pool.query(`
    SELECT * FROM event_relationships
    WHERE source_event_id BETWEEN 1512 AND 1615
      AND target_event_id BETWEEN 1512 AND 1615
    LIMIT 5
  `);
  console.log('\n那 1 条边详情:', oneLink.rows);

  // 查这些新事件作为 target 被哪些旧事件连接
  const newAsTarget = await pool.query(`
    SELECT source_event_id, target_event_id, relationship_type
    FROM event_relationships
    WHERE target_event_id BETWEEN 1512 AND 1615
    LIMIT 20
  `);
  console.log('\n新事件作为 target 的关系 (source -> target):', newAsTarget.rows);

  // 查这些新事件作为 source 连接了哪些旧事件
  const newAsSource = await pool.query(`
    SELECT source_event_id, target_event_id, relationship_type
    FROM event_relationships
    WHERE source_event_id BETWEEN 1512 AND 1615
    LIMIT 20
  `);
  console.log('\n新事件作为 source 的关系 (source -> target):', newAsSource.rows);

  await pool.end();
}

main().catch(console.error);
