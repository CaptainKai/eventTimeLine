import { query } from '../lib/db/connection.mjs';

async function analyze() {
  // 获取所有表的字段结构
  const tables = ['news', 'proto_events', 'events', 'entity_mapping', 'llm_parse_results', 'event_relationships', 'stories', 'hypotheses', 'event_news'];

  for (const table of tables) {
    console.log(`\n=== ${table} 表结构 ===`);
    const cols = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [table]);

    cols.rows.forEach(r => {
      console.log(`  ${r.column_name}: ${r.data_type} (${r.is_nullable})`);
    });

    // 统计各字段非空比例
    const countCols = cols.rows.map(r => `COUNT(${r.column_name}) as "${r.column_name}"`).join(', ');
    const stats = await query(`SELECT COUNT(*) as total, ${countCols} FROM ${table}`);
    console.log(`\n  总记录: ${stats.rows[0].total}`);
    console.log('  非空统计:');
    delete stats.rows[0].total;
    const total = parseInt(cols.rows.length > 0 ? (await query(`SELECT COUNT(*) as t FROM ${table}`)).rows[0].t : 0);
    for (const [col, val] of Object.entries(stats.rows[0])) {
      const pct = total > 0 ? ((parseInt(val) / total) * 100).toFixed(1) : '0';
      const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
      console.log(`    ${col.padEnd(20)}: ${val.toString().padStart(5)} (${pct.padStart(5)}%) ${bar}`);
    }
  }

  process.exit(0);
}

analyze();
