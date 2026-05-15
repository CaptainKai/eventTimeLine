/**
 * 诊断脚本：检查数据库表结构
 */
import { query } from '../lib/db/connection.mjs';

async function checkSchema() {
  console.log('=== 检查 events 表结构 ===\n');

  const eventCols = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'events'
    ORDER BY ordinal_position
  `);

  console.log('events 表字段:');
  for (const col of eventCols.rows) {
    console.log(`  ${col.column_name}: ${col.data_type}`);
  }

  console.log('\n=== 检查 proto_events 表结构 ===\n');

  const protoCols = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'proto_events'
    ORDER BY ordinal_position
  `);

  console.log('proto_events 表字段:');
  for (const col of protoCols.rows) {
    console.log(`  ${col.column_name}: ${col.data_type}`);
  }

  console.log('\n=== 检查 news 表结构 ===\n');

  const newsCols = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'news'
    ORDER BY ordinal_position
  `);

  console.log('news 表字段:');
  for (const col of newsCols.rows) {
    console.log(`  ${col.column_name}: ${col.data_type}`);
  }
}

checkSchema()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });