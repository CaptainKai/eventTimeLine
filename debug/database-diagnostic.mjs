#!/usr/bin/env node
/**
 * 数据库完整性诊断脚本
 * 检查各层数据是否符合定义，并识别潜在问题
 */

import { initDB, query } from '../lib/db/connection.mjs';

async function runDiagnostics() {
  console.log('=== 事件时间线引擎数据库诊断 ===\n');

  try {
    await initDB();
    console.log('✅ 数据库连接成功\n');

    // 1. 检查各层表的存在性
    console.log('1. 检查各层数据表的完整性：');
    const tablesToCheck = [
      { name: 'raw_events', description: '原始事件表' },
      { name: 'news', description: '新闻表' },
      { name: 'proto_events', description: '原子事实表' },
      { name: 'events', description: '标准事件表' },
      { name: 'entity_mapping', description: '实体映射表' },
      { name: 'event_relationships', description: '事件关系表' },
      { name: 'event_attribute_history', description: '事件属性历史表' },
      { name: 'event_milestones', description: '事件里程碑表' },
      { name: 'event_news', description: '事件-新闻关联表' },
    ];

    for (const table of tablesToCheck) {
      try {
        const result = await query(`SELECT COUNT(*) FROM ${table.name}`);
        console.log(`   ✅ ${table.description} (${table.name}): ${result.rows[0].count} 条记录`);
      } catch (error) {
        console.log(`   ❌ ${table.description} (${table.name}): 表不存在或查询失败 - ${error.message}`);
      }
    }
    console.log();

    // 2. 检查实体映射表的完整性
    console.log('2. 检查实体映射表的完整性：');
    const entityTypes = await query(`
      SELECT entity_type, COUNT(*) as count
      FROM entity_mapping
      GROUP BY entity_type
      ORDER BY count DESC
    `);

    if (entityTypes.rows.length > 0) {
      console.log(`   实体类型分布：`);
      entityTypes.rows.forEach(row => {
        console.log(`      - ${row.entity_type}: ${row.count} 个`);
      });
    } else {
      console.log(`   ❌ 实体映射表为空`);
    }

    // 检查是否有无效的实体
    const invalidEntities = await query(`
      SELECT * FROM entity_mapping
      WHERE canonical_name IS NULL OR canonical_name = ''
      OR raw_name IS NULL OR raw_name = ''
      OR entity_type IS NULL OR entity_type = ''
    `);

    if (invalidEntities.rows.length > 0) {
      console.log(`   ❌ 发现 ${invalidEntities.rows.length} 个无效的实体映射记录`);
    }

    console.log();

    // 3. 检查事件表的完整性
    console.log('3. 检查标准事件表的完整性：');

    const totalEvents = await query(`SELECT COUNT(*) FROM events`);
    console.log(`   总事件数: ${totalEvents.rows[0].count}`);

    // 检查缺少关键字段的事件
    const eventsWithoutType = await query(`
      SELECT COUNT(*) FROM events
      WHERE event_type IS NULL OR event_type = ''
    `);
    if (eventsWithoutType.rows[0].count > 0) {
      console.log(`   ❌ ${eventsWithoutType.rows[0].count} 个事件缺少事件类型`);
    }

    const eventsWithoutTime = await query(`
      SELECT COUNT(*) FROM events
      WHERE start_time IS NULL
    `);
    if (eventsWithoutTime.rows[0].count > 0) {
      console.log(`   ❌ ${eventsWithoutTime.rows[0].count} 个事件缺少事件时间`);
    }

    const eventsWithoutActor = await query(`
      SELECT COUNT(*) FROM events
      WHERE actor1_id IS NULL
    `);
    if (eventsWithoutActor.rows[0].count > 0) {
      console.log(`   ❌ ${eventsWithoutActor.rows[0].count} 个事件缺少参与者1`);
    }

    console.log();

    // 4. 检查事件-新闻关联表
    console.log('4. 检查事件-新闻关联表：');

    const eventNewsCount = await query(`SELECT COUNT(*) FROM event_news`);
    console.log(`   事件-新闻关联数: ${eventNewsCount.rows[0].count}`);

    // 检查是否有孤立的新闻
    const orphanedNews = await query(`
      SELECT COUNT(*) FROM news
      WHERE event_id NOT IN (SELECT id FROM events)
    `);
    if (orphanedNews.rows[0].count > 0) {
      console.log(`   ⚠️ ${orphanedNews.rows[0].count} 条新闻属于已删除的事件`);
    }

    console.log();

    // 5. 随机选择一些事件进行详细检查
    console.log('5. 检查事件实例的格式：');

    const randomEvents = await query(`
      SELECT e.id, e.event_type, a1.canonical_name as actor1_name,
             a2.canonical_name as actor2_name, e.start_time,
             (e.normalized_data->>'title') as title,
             (e.normalized_data->>'description') as description
      FROM events e
      LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
      LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
      ORDER BY RANDOM()
      LIMIT 5
    `);

    console.log(`   随机检查 ${randomEvents.rows.length} 个事件：`);

    randomEvents.rows.forEach(event => {
      console.log(`\n      事件 ${event.id} (${event.event_type || 'Unknown'}):`);
      console.log(`         时间: ${event.start_time}`);
      console.log(`         参与者1: ${event.actor1_name || 'null'}`);
      console.log(`         参与者2: ${event.actor2_name || 'null'}`);

      // 检查事件实例格式是否符合 "when WHO did WHAT to WHOM"
      if (event.title) {
        const hasTime = /\d{4}|\d{1,2}\s*[月|日]|(?:上午|下午|晚上)/.test(event.title);
        const hasActor = /[国家|组织|公司|政府|军队|警方|抗议者|民众]/i.test(event.title) ||
                         event.actor1_name || event.actor2_name;
        const hasAction = /[发生|举行|进行|签署|发布|攻击|抗议|会谈|访问]/i.test(event.title);

        if (!hasTime || !hasActor || !hasAction) {
          console.log(`         ⚠️  事件标题格式可能不符合要求: "${event.title}"`);
        }
      }
    });

    console.log('\n=== 诊断完成 ===');

  } catch (error) {
    console.error('❌ 诊断过程中出错:', error);
  }
}

runDiagnostics();
