import { initDB, query, queryOne, closeDB } from '../lib/db/connection.mjs';

async function main() {
  initDB();
  try {
    console.log('--- Super-Node 951457 Info ---');
    const summary = await queryOne('SELECT * FROM relationship_summaries WHERE id = 951457');
    console.log('Summary:', summary);

    // 查询成员数量
    const memberCount = await queryOne('SELECT COUNT(*) as count FROM relationship_summary_members WHERE summary_id = 951457');
    console.log('Member Count (via relationship_summary_members):', memberCount);

    // 查询是否有这个表
    const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log('Tables in DB:', tables.rows.map(r => r.table_name));

  } catch (e) {
    console.error('Error querying:', e);
  } finally {
    await closeDB();
  }
}

main();
