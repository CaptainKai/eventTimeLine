#!/usr/bin/env node
/**
 * 修复事件类型中的 "not specified below" 问题
 */

import { initDB, query } from '../lib/db/connection.mjs';

async function fixEventTypes() {
  console.log('=== 修复事件类型中的 "not specified below" 问题 ===\n');

  try {
    await initDB();
    console.log('✅ 数据库连接成功\n');

    // 1. 查找需要修复的事件类型
    console.log('1. 查找需要修复的事件类型：');

    const eventsToFix = await query(`
      SELECT DISTINCT event_type
      FROM events
      WHERE event_type LIKE '%not specified below%'
    `);

    if (eventsToFix.rows.length === 0) {
      console.log('   ✅ 没有需要修复的事件类型');
      return;
    }

    console.log(`   发现 ${eventsToFix.rows.length} 种需要修复的事件类型`);
    eventsToFix.rows.forEach(row => {
      console.log(`      - ${row.event_type}`);
    });

    // 2. 修复事件类型
    console.log('\n2. 修复事件类型：');

    const fixedTypes = [];

    for (const row of eventsToFix.rows) {
      const originalType = row.event_type;
      const fixedType = originalType.replace(/, not specified below$/, '');

      const updateResult = await query(`
        UPDATE events
        SET event_type = $1
        WHERE event_type = $2
      `, [fixedType, originalType]);

      console.log(`   ✅ 更新 ${updateResult.rowCount} 条事件类型：${originalType} → ${fixedType}`);
      fixedTypes.push(fixedType);
    }

    // 3. 检查修复后的事件类型
    console.log('\n3. 修复后的事件类型统计：');

    const eventStats = await query(`
      SELECT event_type, COUNT(*) as count
      FROM events
      WHERE event_type IN (${fixedTypes.map(() => '$' + (fixedTypes.indexOf(event_type) + 1)).join(',')})
      GROUP BY event_type
      ORDER BY count DESC
    `);

    eventStats.rows.forEach(stat => {
      console.log(`      - ${stat.event_type}: ${stat.count} 个`);
    });

    console.log('\n=== 修复完成 ===');

  } catch (error) {
    console.error('❌ 修复过程中出错:', error);
  }
}

fixEventTypes();
