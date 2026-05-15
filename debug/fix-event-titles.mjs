#!/usr/bin/env node
/**
 * 修复事件标题格式 - 使其符合 "when WHO did WHAT to WHOM" 标准
 */

import { initDB, query } from '../lib/db/connection.mjs';

async function fixEventTitles() {
  console.log('=== 修复事件标题格式 ===\n');

  try {
    await initDB();

    // 1. 查找所有有问题的标题
    console.log('1. 查找有问题的标题：');

    const badTitles = await query(`
      SELECT e.id, e.event_type, e.start_time,
             a1.canonical_name as actor1_name,
             a2.canonical_name as actor2_name,
             loc.canonical_name as location_name,
             (e.normalized_data->>'title') as old_title
      FROM events e
      LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
      LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
      LEFT JOIN entity_mapping loc ON e.location_id = loc.id
      WHERE (e.normalized_data->>'title') IS NOT NULL
        AND (
          (e.normalized_data->>'title') LIKE '%对%进行%'
        )
      LIMIT 20
    `);

    console.log(`   发现 ${badTitles.rows.length} 个需要修复的标题`);

    // 2. 修复标题格式
    let fixedCount = 0;
    for (const event of badTitles.rows) {
      // 构建新标题：时间 + 参与者1 + 事件类型 + [to 参与者2] [+ in 地点]
      let newTitle = '';

      // 时间部分
      if (event.start_time) {
        const date = new Date(event.start_time);
        const timeStr = date.toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        newTitle += `${timeStr} `;
      }

      // 参与者1 (WHO)
      const actor1 = event.actor1_name || 'Unknown Actor';
      newTitle += actor1;

      // 事件类型 (WHAT)
      const action = event.event_type || '进行某动作';
      newTitle += ` ${action}`;

      // 参与者2 (to WHOM)
      if (event.actor2_name) {
        newTitle += ` to ${event.actor2_name}`;
      }

      // 地点 (in WHERE)
      if (event.location_name) {
        newTitle += ` in ${event.location_name}`;
      }

      // 更新数据库 - 使用显式类型转换
      const sql = `
        UPDATE events
        SET normalized_data = COALESCE(normalized_data, '{}'::jsonb) || jsonb_build_object('title', $1::text)
        WHERE id = $2
      `;
      await query(sql, [newTitle, event.id]);

      fixedCount++;
      console.log(`   修复: ${event.old_title.substring(0, 40)}...`);
      console.log(`     → ${newTitle}`);
    }

    console.log(`\n2. 已修复 ${fixedCount} 个标题`);

    console.log('\n=== 修复完成 ===');

  } catch (error) {
    console.error('❌ 出错:', error);
  }
}

fixEventTitles();