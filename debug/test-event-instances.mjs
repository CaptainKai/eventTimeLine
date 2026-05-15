#!/usr/bin/env node
/**
 * 测试和检查事件实例格式
 * 验证事件是否符合 "when WHO did WHAT to WHOM" 格式
 */

import { initDB, query } from '../lib/db/connection.mjs';

async function testEventInstances() {
  console.log('=== 事件实例格式检查 ===\n');

  try {
    await initDB();
    console.log('✅ 数据库连接成功\n');

    // 1. 随机选择一些事件进行详细检查
    console.log('1. 随机选择事件进行详细检查：');

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
      LIMIT 10
    `);

    let validCount = 0;
    let invalidCount = 0;

    randomEvents.rows.forEach(event => {
      console.log(`\n【事件 ${event.id}】`);
      console.log(`  类型: ${event.event_type}`);
      console.log(`  时间: ${event.start_time}`);
      console.log(`  参与者1: ${event.actor1_name || 'null'}`);
      console.log(`  参与者2: ${event.actor2_name || 'null'}`);
      console.log(`  地点: ${event.location_name || 'null'}`);
      if (event.title) {
        console.log(`  标题: ${event.title}`);
      }

      // 检查格式是否符合 "when WHO did WHAT to WHOM"
      const hasTime = !!event.start_time;
      const hasActor = !!event.actor1_name;
      const hasAction = !!event.event_type;
      const hasObject = !!event.actor2_name;

      const isFormatValid = hasTime && hasActor && hasAction;

      if (isFormatValid) {
        console.log(`  ✅ 格式基本符合要求`);
        validCount++;
      } else {
        console.log(`  ❌ 格式不符合要求`);
        invalidCount++;

        if (!hasTime) console.log(`    - 缺少: 时间 (when)`);
        if (!hasActor) console.log(`    - 缺少: 参与者 (WHO)`);
        if (!hasAction) console.log(`    - 缺少: 动作 (WHAT)`);
      }
    });

    console.log(`\n统计: ${validCount} 个基本符合, ${invalidCount} 个不符合`);

    // 2. 查找所有参与者为 "Unknown Actor" 的事件
    console.log('\n2. 查找参与者为 "Unknown Actor" 的事件：');

    const unknownActorEvents = await query(`
      SELECT
        e.id,
        e.event_type,
        (e.normalized_data->>'title') as title,
        (e.normalized_data->>'description') as description
      FROM events e
      LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
      WHERE a1.canonical_name = 'Unknown Actor'
      LIMIT 10
    `);

    if (unknownActorEvents.rows.length > 0) {
      console.log(`   发现 ${unknownActorEvents.rows.length} 个参与者为 "Unknown Actor" 的事件`);
      unknownActorEvents.rows.forEach(event => {
        console.log(`\n   事件 ${event.id}:`);
        console.log(`     类型: ${event.event_type}`);
        if (event.title) console.log(`     标题: ${event.title}`);
        if (event.description) console.log(`     描述: ${event.description.substring(0, 100)}...`);
      });
    } else {
      console.log(`   ✅ 没有发现参与者为 "Unknown Actor" 的事件`);
    }

    // 3. 检查事件标题格式问题
    console.log('\n3. 检查事件标题格式问题：');

    const badTitleEvents = await query(`
      SELECT
        e.id,
        e.event_type,
        a1.canonical_name as actor1_name,
        a2.canonical_name as actor2_name,
        (e.normalized_data->>'title') as title
      FROM events e
      LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
      LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
      WHERE (e.normalized_data->>'title') IS NOT NULL
        AND (
          (e.normalized_data->>'title') LIKE '%进行%'
          OR (e.normalized_data->>'title') LIKE '%对%'
          OR (e.normalized_data->>'title') LIKE '%Unknown Actor%'
        )
      LIMIT 10
    `);

    if (badTitleEvents.rows.length > 0) {
      console.log(`   发现 ${badTitleEvents.rows.length} 个可能有标题格式问题的事件`);
      badTitleEvents.rows.forEach(event => {
        console.log(`\n   事件 ${event.id}:`);
        console.log(`     标题: ${event.title}`);
        console.log(`     应该是: [${event.start_time ? '时间' : '?时间'}] ${event.actor1_name || '?WHO'} ${event.event_type || '?WHAT'} ${event.actor2_name ? 'to ' + event.actor2_name : ''}`);
      });
    } else {
      console.log(`   ✅ 没有发现明显的标题格式问题`);
    }

    console.log('\n=== 检查完成 ===');

  } catch (error) {
    console.error('❌ 过程中出错:', error);
  }
}

testEventInstances();
