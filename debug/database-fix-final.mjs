#!/usr/bin/env node
/**
 * 数据库诊断与修复脚本 - 最终版
 * 修复发现的数据完整性问题
 */

import { initDB, query } from '../lib/db/connection.mjs';

async function runFixes() {
  console.log('=== 事件时间线引擎数据库诊断与修复 ===\n');

  try {
    await initDB();
    console.log('✅ 数据库连接成功\n');

    // 1. 只清理真正无效的实体（不被引用的）
    console.log('1. 清理无效的实体映射记录：');

    // 查找不被任何表引用的无效实体
    const unusedInvalidEntities = await query(`
      DELETE FROM entity_mapping
      WHERE (canonical_name IS NULL OR canonical_name = ''
             OR raw_name IS NULL OR raw_name = ''
             OR entity_type IS NULL OR entity_type = ''
             OR LENGTH(canonical_name) < 2
             OR canonical_name IN ('一次', '的', '是', '在', '对', '和', '有', '为', '从', '向', '与', 'Great', 'Plus'))
        AND id NOT IN (SELECT COALESCE(actor1_id, 0) FROM events WHERE actor1_id IS NOT NULL)
        AND id NOT IN (SELECT COALESCE(actor2_id, 0) FROM events WHERE actor2_id IS NOT NULL)
        AND id NOT IN (SELECT COALESCE(location_id, 0) FROM events WHERE location_id IS NOT NULL)
      RETURNING *
    `);

    if (unusedInvalidEntities.rows.length > 0) {
      console.log(`   ✅ 删除了 ${unusedInvalidEntities.rows.length} 个未被引用的无效实体映射记录`);
      unusedInvalidEntities.rows.slice(0, 5).forEach(e => {
        console.log(`      - 删除: "${e.raw_name}" (${e.entity_type})`);
      });
      if (unusedInvalidEntities.rows.length > 5) {
        console.log(`      ... 还有 ${unusedInvalidEntities.rows.length - 5} 条`);
      }
    } else {
      console.log(`   ✅ 没有发现未被引用的无效实体`);
    }

    console.log();

    // 2. 检查事件表的数据完整性
    console.log('2. 检查事件表的数据完整性：');

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

    // 3. 显示一些随机事件用于检查
    console.log('3. 随机选择一些事件进行检查：');

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

    // 4. 生成统计报告
    console.log('4. 数据库统计报告：');

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

    // 5. 检查和修复新闻只显示一条的问题
    console.log('\n5. 检查新闻-事件关联：');

    const orphanedNews = await query(`
      SELECT COUNT(*) as count FROM news
      WHERE id NOT IN (SELECT news_id FROM event_news)
    `);

    console.log(`   未关联到事件的新闻: ${orphanedNews.rows[0].count} 条`);

    const eventNewsCount = await query(`
      SELECT event_id, COUNT(*) as news_count
      FROM event_news
      GROUP BY event_id
      ORDER BY news_count DESC
      LIMIT 10
    `);

    console.log(`\n   事件新闻关联统计（前10）：`);
    eventNewsCount.rows.forEach(stat => {
      console.log(`      - 事件 ${stat.event_id}: ${stat.news_count} 条新闻`);
    });

    console.log('\n=== 诊断与修复完成 ===');

  } catch (error) {
    console.error('❌ 过程中出错:', error);
  }
}

runFixes();
