#!/usr/bin/env node
/**
 * 验证修复结果
 */

import { initDB, query } from '../lib/db/connection.mjs';

async function verifyFixes() {
  console.log('=== 验证修复结果 ===\n');

  try {
    await initDB();

    // 事件类型统计
    console.log('事件类型统计：');
    const eventStats = await query(`
      SELECT event_type, COUNT(*) as count
      FROM events
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 15
    `);

    eventStats.rows.forEach(row => {
      console.log(`   - ${row.event_type}: ${row.count}`);
    });

    console.log('\n=== 验证完成 ===');

  } catch (error) {
    console.error('❌ 出错:', error);
  }
}

verifyFixes();