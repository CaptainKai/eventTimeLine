import { query } from '../lib/db/connection.mjs';

async function check() {
  const result = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'proto_events'
    ORDER BY ordinal_position
  `);
  console.log('proto_events 表结构:');
  result.rows.forEach(r => console.log('  ', r.column_name, ':', r.data_type));

  // 看一条示例数据
  const sample = await query('SELECT * FROM proto_events LIMIT 1');
  console.log('\n示例数据:');
  console.log(JSON.stringify(sample.rows[0], null, 2));
  process.exit(0);
}

check();
