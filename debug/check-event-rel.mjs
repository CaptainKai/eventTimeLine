/**
 * 检查事件关系表结构
 */
import { query } from '../lib/db/connection.mjs';

async function check() {
  console.log('=== 检查 event_relationships 表结构 ===\n');

  const cols = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'event_relationships'
    ORDER BY ordinal_position
  `);

  console.log('event_relationships 表字段:');
  for (const col of cols.rows) {
    console.log(`  ${col.column_name}: ${col.data_type}`);
  }
}

check()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });