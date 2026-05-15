#!/usr/bin/env node
/**
 * 数据库诊断与修复脚本
 * 修复发现的数据完整性问题
 */

import { initDB, query } from '../lib/db/connection.mjs';

async function runFixes() {
  console.log('=== 事件时间线引擎数据库诊断与修复 ===\n');

  try {
    await initDB();
    console.log('✅ 数据库连接成功\n');

    // 1. 清理无效的实体映射
    console.log('1. 清理无效的实体映射记录：');

    // 查找并删除空的或无意义的实体
    const invalidEntities = await query(`
      DELETE FROM entity_mapping
      WHERE canonical_name IS NULL OR canonical_name = ''
         OR raw_name IS NULL OR raw_name = ''
         OR entity_type IS NULL OR entity_type = ''
         OR LENGTH(canonical_name) < 2
         OR canonical_name ~ '^[0-9]+$'
         OR canonical_name ~ '^[\\s\\p{P}]+$'
      RETURNING *
    `);

    if (invalidEntities.rows.length > 0) {
      console.log(`   ✅ 删除了 ${invalidEntities.rows.length} 个无效的实体映射记录`);
      invalidEntities.rows.slice(0, 5).forEach(e => {
        console.log(`      - 删除: "${e.raw_name}" (${e.entity_type})`);
      });
      if (invalidEntities.rows.length > 5) {
        console.log(`      ... 还有 ${invalidEntities.rows.length - 5} 条`);
      }
    } else {
      console.log(`   ✅ 没有发现无效的实体映射`);
    }

    console.log();

    // 2. 查找并修复可疑的实体（长度太短、纯数字、标点符号等）
    console.log('2. 查找可疑的实体：');

    const suspiciousEntities = await query(`
      SELECT id, raw_name, canonical_name, entity_type
      FROM entity_mapping
      WHERE LENGTH(canonical_name) <= 2
         OR canonical_name ~ '^[0-9]+$'
         OR canonical_name ~ '^[\\s\\p{P}]+$'
         OR canonical_name IN ('一次', '的', '是', '在', '对', '和', '有', '为', '从', '向', '与')
      ORDER BY entity_type, canonical_name
      LIMIT 50
    `);

    if (suspiciousEntities.rows.length > 0) {
      console.log(`   ⚠️ 发现 ${suspiciousEntities.rows.length} 个可疑实体`);
      console.log(`      这些实体将被删除，请检查后确认`);

      // 先显示出来不删除
      suspiciousEntities.rows.forEach(e => {
        console.log(`      - [${e.id}] "${e.raw_name}" → "${e.canonical_name}" (${e.entity_type})`);
      });

      // 询问用户是否删除（这里我们只是记录，实际删除需要谨慎）
      const deleteSuspicious = false; // 设置为 true 来执行删除
      if (deleteSuspicious) {
        const deleteIds = suspiciousEntities.rows.map(e => e.id);
        await query(`DELETE FROM entity_mapping WHERE id = ANY($1)`, [deleteIds]);
        console.log(`   ✅ 删除了 ${deleteIds.length} 个可疑实体`);
      }
    } else {
      console.log(`   ✅ 没有发现可疑实体`);
    }

    console.log();

    // 3. 检查事件表的数据完整性
    console.log('3. 检查事件表的数据完整性：');

    // 检查缺少事件类型的事件
    const eventsWithoutType = await query(`
      SELECT COUNT(*) FROM events
      WHERE event_type IS NULL OR event_type = ''
    `);

    if (eventsWithoutType.rows[0].count > 0) {
      console.log(`   ⚠️ ${eventsWithoutType.rows[0].count} 个事件缺少事件类型`);
    } else {
      console.log(`   ✅ 所有事件都有事件类型`);
    }

    // 检查缺少时间的事件
    const eventsWithoutTime = await query(`
      SELECT COUNT(*) FROM events
      WHERE start_time IS NULL
    `);

    if (eventsWithoutTime.rows[0].count > 0) {
      console.log(`   ⚠️ ${eventsWithoutTime.rows[0].count} 个事件缺少时间`);
    } else {
      console.log(`   ✅ 所有事件都有时间`);
    }

    // 检查无效的参与者引用
    const invalidActorRefs = await query(`
      SELECT COUNT(*) FROM events
      WHERE actor1_id IS NOT NULL
        AND actor1_id NOT IN (SELECT id FROM entity_mapping)
    `);

    if (invalidActorRefs.rows[0].count > 0) {
      console.log(`   ⚠️ ${invalidActorRefs.rows[0].count} 个事件的参与者1引用无效`);

      // 清理无效引用
      await query(`
        UPDATE events
        SET actor1_id = NULL
        WHERE actor1_id IS NOT NULL
          AND actor1_id NOT IN (SELECT id FROM entity_mapping)
      `);
      console.log(`   ✅ 已清理无效的参与者1引用`);
    }

    const invalidActor2Refs = await query(`
      SELECT COUNT(*) FROM events
      WHERE actor2_id IS NOT NULL
        AND actor2_id NOT IN (SELECT id FROM entity_mapping)
    `);

    if (invalidActor2Refs.rows[0].count > 0) {
      console.log(`   ⚠️ ${invalidActor2Refs.rows[0].count} 个事件的参与者2引用无效`);

      await query(`
        UPDATE events
        SET actor2_id = NULL
        WHERE actor2_id IS NOT NULL
          AND actor2_id NOT IN (SELECT id FROM entity_mapping)
      `);
      console.log(`   ✅ 已清理无效的参与者2引用`);
    }

    const invalidLocationRefs = await query(`
      SELECT COUNT(*) FROM events
      WHERE location_id IS NOT NULL
        AND location_id NOT IN (SELECT id FROM entity_mapping)
    `);

    if (invalidLocationRefs.rows[0].count > 0) {
      console.log(`   ⚠️ ${invalidLocationRefs.rows[0].count} 个事件的地点引用无效`);

      await query(`
        UPDATE events
        SET location_id = NULL
        WHERE location_id IS NOT NULL
          AND location_id NOT IN (SELECT id FROM entity_mapping)
      `);
      console.log(`   ✅ 已清理无效的地点引用`);
    }

    console.log();

    // 4. 显示一些随机事件用于检查
    console.log('4. 随机选择一些事件进行检查：');

    const randomEvents = await query(`
      SELECT
        e.id,
        e.event_type,
        a1.canonical_name as actor1_name,
        a2.canonical_name as actor2_name,
        loc.canonical_name as location_name,
        e.start_time,
        (e.normalized_data->>'title') as title,
        (e.normalized_data->>'description') as description
      FROM events e
      LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
      LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
      LEFT JOIN entity_mapping loc ON e.location_id = loc.id
      ORDER BY RANDOM()
      LIMIT 3
    `);

    randomEvents.rows.forEach(event => {
      console.log(`\n   事件 ${event.id}:`);
      console.log(`      类型: ${event.event_type}`);
      console.log(`      时间: ${event.start_time}`);
      console.log(`      参与者1: ${event.actor1_name || 'null'}`);
      console.log(`      参与者2: ${event.actor2_name || 'null'}`);
      console.log(`      地点: ${event.location_name || 'null'}`);
      if (event.title) {
        console.log(`      标题: ${event.title}`);
      }
      if (event.description) {
        console.log(`      描述: ${event.description.substring(0, 100)}...`);
      }

      // 检查格式是否符合 "when WHO did WHAT to WHOM"
      const hasActor = event.actor1_name;
      const hasAction = event.event_type;
      const hasTime = event.start_time;

      if (!hasActor || !hasAction || !hasTime) {
        console.log(`      ⚠️ 此事件可能不符合 "when WHO did WHAT to WHOM" 格式`);
      }
    });

    console.log();

    // 5. 生成统计报告
    console.log('5. 数据库统计报告：');

    const entityStats = await query(`
      SELECT entity_type, COUNT(DISTINCT canonical_name) as unique_count, COUNT(*) as total_count
      FROM entity_mapping
      GROUP BY entity_type
      ORDER BY total_count DESC
    `);

    console.log(`   实体统计：`);
    entityStats.rows.forEach(stat => {
      console.log(`      - ${stat.entity_type}: ${stat.unique_count} 个唯一实体, ${stat.total_count} 条映射记录`);
    });

    const eventStats = await query(`
      SELECT event_type, COUNT(*) as count
      FROM events
      WHERE event_type IS NOT NULL
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log(`\n   事件类型统计（前10）：`);
    eventStats.rows.forEach(stat => {
      console.log(`      - ${stat.event_type}: ${stat.count} 个`);
    });

    const newsStats = await query(`
      SELECT source, COUNT(*) as count
      FROM news
      WHERE source IS NOT NULL
      GROUP BY source
      ORDER BY count DESC
    `);

    console.log(`\n   新闻来源统计：`);
    newsStats.rows.forEach(stat => {
      console.log(`      - ${stat.source}: ${stat.count} 条`);
    });

    console.log('\n=== 诊断与修复完成 ===');

  } catch (error) {
    console.error('❌ 过程中出错:', error);
  }
}

runFixes();
