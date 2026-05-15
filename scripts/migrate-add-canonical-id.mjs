#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { query } from '../lib/db/connection.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  console.log('=== 数据库结构升级：为 proto_events 表添加 canonical_event_id 字段 ===');

  try {
    // 1. 读取 SQL 脚本
    const sqlPath = join(__dirname, '../sql/add-canonical-event-id.sql');
    const sql = await readFile(sqlPath, 'utf8');

    // 2. 执行 SQL
    console.log('正在执行数据库结构升级...');

    // 分步骤执行 SQL
    const statements = sql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (!statement.startsWith('--') && statement.trim()) {
        try {
          await query(statement);
        } catch (error) {
          console.warn(`   警告: ${error.message}`);
        }
      }
    }

    console.log('✅ 数据库结构升级完成');

    // 3. 显示升级结果
    await showMigrationResult();

  } catch (error) {
    console.error('❌ 升级失败:', error);
    process.exit(1);
  }
}

async function showMigrationResult() {
  const [columns, stats] = await Promise.all([
    query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'proto_events'
        AND column_name = 'canonical_event_id'
    `),
    query(`
      SELECT
        COUNT(*) as total_proto,
        COUNT(canonical_event_id) as linked_proto,
        COUNT(*) - COUNT(canonical_event_id) as unlinked_proto
      FROM proto_events
    `)
  ]);

  const columnExists = columns.rows.length > 0;
  const { total_proto, linked_proto, unlinked_proto } = stats.rows[0];
  const linkedPercentage = Math.round((linked_proto / total_proto) * 100);

  console.log('\n📊 升级结果统计：');
  console.log(`   canonical_event_id 字段: ${columnExists ? '✅ 已存在' : '❌ 缺失'}`);
  console.log(`   原子事件总数: ${total_proto}`);
  console.log(`   已关联标准事件: ${linked_proto} (${linkedPercentage}%)`);
  console.log(`   未关联事件: ${unlinked_proto}`);

  if (unlinked_proto > 0) {
    console.log(`\n⚠️  建议操作：`);
    if (unlinked_proto > total_proto * 0.2) {
      console.log(`   运行一致性修复：node scripts/check-consistency.mjs fix`);
    }
    console.log(`   或重新解析未关联的新闻`);
  }
}

// 主程序
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}

export { runMigration };
