#!/usr/bin/env node
/**
 * 修复参与者和地点选项问题的脚本
 * 删除无意义的实体，修复参与者和地点的下拉选项
 */

import { initDB, query } from '../lib/db/connection.mjs';

async function fixParticipantLocationOptions() {
  console.log('=== 修复参与者和地点选项问题 ===\n');

  try {
    await initDB();
    console.log('✅ 数据库连接成功\n');

    // 1. 定义无意义的实体列表
    const meaninglessEntities = [
      'Great', 'Plus', '一次', '的', '是', '在', '对', '和', '有', '为', '从', '向', '与',
      'Am', 'Gb', 'St', 'AS', 'CH', 'IN', 'IZ', 'JA', 'NZ', 'SF', 'TU', 'UP'
    ];

    // 2. 查找并处理这些无意义的实体
    console.log('1. 查找并处理无意义的实体：');

    for (const entityName of meaninglessEntities) {
      try {
        const entityResult = await query(`
          SELECT * FROM entity_mapping
          WHERE canonical_name ILIKE $1 OR raw_name ILIKE $1
        `, [`%${entityName}%`]);

        if (entityResult.rows.length > 0) {
          console.log(`\n   找到包含 "${entityName}" 的实体 (${entityResult.rows.length} 个):`);

          // 先断开与事件的关联，然后删除
          for (const entity of entityResult.rows) {
            console.log(`     - [${entity.id}] ${entity.canonical_name} (${entity.entity_type})`);

            // 断开与事件的关联
            await query(`
              UPDATE events
              SET actor1_id = NULL
              WHERE actor1_id = $1
            `, [entity.id]);

            await query(`
              UPDATE events
              SET actor2_id = NULL
              WHERE actor2_id = $1
            `, [entity.id]);

            await query(`
              UPDATE events
              SET location_id = NULL
              WHERE location_id = $1
            `, [entity.id]);

            // 从事件新闻关联表中移除
            await query(`
              DELETE FROM event_news
              WHERE news_id IN (
                SELECT id FROM news
                WHERE event_id IN (
                  SELECT id FROM events
                  WHERE actor1_id = $1 OR actor2_id = $1 OR location_id = $1
                )
              )
            `, [entity.id]);

            // 从实体映射表中删除
            await query(`
              DELETE FROM entity_mapping
              WHERE id = $1
            `, [entity.id]);

            console.log(`        ✅ 删除成功`);
          }
        }
      } catch (error) {
        console.error(`   ❌ 处理实体 "${entityName}" 时出错: ${error.message}`);
      }
    }

    console.log();

    // 3. 清理参与者和地点为无效值的事件
    console.log('2. 清理参与者和地点为无效值的事件：');

    // 清理参与者为 "Unknown Actor" 的事件
    const unknownActorEvents = await query(`
      SELECT e.id, a1.canonical_name
      FROM events e
      LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
      WHERE a1.canonical_name = 'Unknown Actor' OR e.event_type ILIKE '%Unknown%'
    `);

    if (unknownActorEvents.rows.length > 0) {
      console.log(`   发现 ${unknownActorEvents.rows.length} 个参与者为 "Unknown Actor" 的事件`);

      // 我们不直接删除这些事件，而是标记或修复它们
      // 这里我们只是记录一下
      for (const event of unknownActorEvents.rows.slice(0, 3)) {
        console.log(`     - 事件 ${event.id}: ${event.canonical_name}`);
      }
    }

    // 4. 优化实体类型
    console.log('\n3. 优化实体类型分类：');

    // 检查是否有国家实体被错误地标记为演员或地点
    const incorrectEntityTypes = await query(`
      SELECT * FROM entity_mapping
      WHERE (entity_type = 'actor' AND canonical_name IN ('中国', '美国', '俄罗斯', '英国', '法国', '德国', '日本', '韩国', '印度'))
         OR (entity_type = 'location' AND canonical_name IN ('中国', '美国', '俄罗斯', '英国', '法国', '德国', '日本', '韩国', '印度'))
    `);

    if (incorrectEntityTypes.rows.length > 0) {
      console.log(`   发现 ${incorrectEntityTypes.rows.length} 个实体类型分类不正确`);

      for (const entity of incorrectEntityTypes.rows) {
        await query(`
          UPDATE entity_mapping
          SET entity_type = 'country'
          WHERE id = $1
        `, [entity.id]);
        console.log(`     - ${entity.canonical_name} 类型已更正为 country`);
      }
    } else {
      console.log(`   ✅ 实体类型分类基本正确`);
    }

    // 5. 生成参与者和地点的统计
    console.log('\n4. 参与者和地点统计：');

    const [actorCount, locationCount, countryCount] = await Promise.all([
      query(`SELECT COUNT(DISTINCT canonical_name) FROM entity_mapping WHERE entity_type = 'actor'`),
      query(`SELECT COUNT(DISTINCT canonical_name) FROM entity_mapping WHERE entity_type = 'location'`),
      query(`SELECT COUNT(DISTINCT canonical_name) FROM entity_mapping WHERE entity_type = 'country'`)
    ]);

    console.log(`   参与者: ${actorCount.rows[0].count}`);
    console.log(`   地点: ${locationCount.rows[0].count}`);
    console.log(`   国家: ${countryCount.rows[0].count}`);

    console.log('\n=== 修复完成 ===');

  } catch (error) {
    console.error('❌ 修复过程中出错:', error);
  }
}

fixParticipantLocationOptions();
