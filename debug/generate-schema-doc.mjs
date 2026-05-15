import { query } from '../lib/db/connection.mjs';

async function generateSchemaDoc() {
  console.log('# Event Timeline 数据库表结构说明\n');
  console.log('生成时间:', new Date().toISOString(), '\n');

  // 获取所有表
  const tablesResult = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  console.log('## 表列表\n');
  tablesResult.rows.forEach(r => console.log(`- ${r.table_name}`));

  // 获取每个表的列信息
  console.log('\n## 表结构详情\n');

  for (const { table_name } of tablesResult.rows) {
    const columnsResult = await query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table_name]);

    console.log(`### ${table_name}\n`);
    console.log('| 列名 | 类型 | 可空 | 默认值 |');
    console.log('|------|------|------|--------|');
    columnsResult.rows.forEach(col => {
      console.log(`| ${col.column_name} | ${col.data_type} | ${col.is_nullable} | ${col.column_default || '-'} |`);
    });
    console.log();
  }

  // 获取外键关系
  console.log('## 外键关系\n');

  const fkResult = await query(`
    SELECT
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.column_name
  `);

  console.log('| 源表 | 源列 | 目标表 | 目标列 |');
  console.log('|------|------|--------|--------|');
  fkResult.rows.forEach(fk => {
    console.log(`| ${fk.source_table} | ${fk.source_column} | ${fk.target_table} | ${fk.target_column} |`);
  });

  process.exit(0);
}

generateSchemaDoc().catch(console.error);
