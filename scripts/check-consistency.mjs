#!/usr/bin/env node

import { query } from '../lib/db/connection.mjs';

async function checkConsistency() {
  console.log('=== 事件数据一致性检查 ===');

  try {
    // 1. 检查 proto_events 表结构
    const protoEventsColumns = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'proto_events' AND column_name = 'canonical_event_id'
    `);

    if (protoEventsColumns.rows.length === 0) {
      console.log('❌ proto_events 表缺少 canonical_event_id 字段');
      console.log('请先运行 SQL 脚本：sql/add-canonical-event-id.sql');
      process.exit(1);
    }

    // 2. 检查数据一致性
    const { rows: stats } = await query(`
      SELECT
        COUNT(*) as total_proto,
        COUNT(canonical_event_id) as linked_proto,
        SUM(CASE WHEN canonical_event_id IS NULL THEN 1 ELSE 0 END) as unlinked_proto,
        COUNT(DISTINCT canonical_event_id) as unique_canonical
      FROM proto_events
    `);

    console.log('🚀 开始一致性检查...');
    console.log('📊 数据统计：');
    console.log(`   总原子事件: ${stats[0].total_proto}`);
    console.log(`   已关联标准事件: ${stats[0].linked_proto}`);
    console.log(`   未关联原子事件: ${stats[0].unlinked_proto}`);
    console.log(`   关联到的标准事件数量: ${stats[0].unique_canonical}`);

    const percentage = Math.round(
      (parseInt(stats[0].linked_proto) / parseInt(stats[0].total_proto)) * 100
    );

    console.log(`💡 关联率: ${percentage}%`);

    // 3. 检查哪些新闻的原子事件没有被关联
    const { rows: unlinkedNews } = await query(`
      SELECT DISTINCT n.id, n.title, COUNT(pe.id) as proto_count
      FROM proto_events pe
      JOIN news n ON pe.news_id = n.id
      WHERE pe.canonical_event_id IS NULL
      GROUP BY n.id, n.title
      ORDER BY proto_count DESC
    `);

    if (unlinkedNews.length > 0) {
      console.log(`\n⚠️ 包含未关联原子事件的新闻(${unlinkedNews.length}条):`);
      unlinkedNews.slice(0, 5).forEach(news => {
        console.log(`   ID: ${news.id} | 原子事件数: ${news.proto_count} | ${news.title}`);
      });

      if (unlinkedNews.length > 5) {
        console.log(`   ...还有 ${unlinkedNews.length - 5} 条`);
      }
    }

    // 4. 检查事件新闻关联
    const { rows: newsEventMismatches } = await query(`
      SELECT DISTINCT n.id, n.title, COUNT(DISTINCT e.id) as event_count
      FROM news n
      JOIN event_news en ON n.id = en.news_id
      JOIN events e ON en.event_id = e.id
      LEFT JOIN proto_events pe ON n.id = pe.news_id AND pe.canonical_event_id = e.id
      WHERE pe.id IS NULL
      GROUP BY n.id, n.title
    `);

    if (newsEventMismatches.length > 0) {
      console.log(`\n⚠️ 事件新闻关联不匹配(${newsEventMismatches.length}条):`);
      newsEventMismatches.slice(0, 3).forEach(mismatch => {
        console.log(`   ID: ${mismatch.id} | 事件数: ${mismatch.event_count} | ${mismatch.title}`);
      });
    }

    // 5. 检查孤立的标准事件（没有新闻关联的事件）
    const { rows: orphanEvents } = await query(`
      SELECT e.id, e.event_type, COUNT(n.id) as news_count
      FROM events e
      LEFT JOIN event_news en ON e.id = en.event_id
      LEFT JOIN news n ON en.news_id = n.id
      WHERE e.id NOT IN (SELECT DISTINCT canonical_event_id FROM proto_events WHERE canonical_event_id IS NOT NULL)
      GROUP BY e.id, e.event_type
    `);

    if (orphanEvents.length > 0) {
      console.log(`\n⚠️ 孤立的标准事件(${orphanEvents.length}条):`);
      orphanEvents.slice(0, 3).forEach(event => {
        console.log(`   ID: ${event.id} | 事件类型: ${event.event_type} | 新闻数: ${event.news_count}`);
      });
    }

    // 6. 提供修复建议
    if (parseInt(stats[0].unlinked_proto) > 0 || unlinkedNews.length > 0) {
      console.log(`\n🎯 建议操作：`);

      if (percentage < 80) {
        console.log('   1. 运行一致性修复脚本：node scripts/fix-consistency.mjs');
      }

      if (unlinkedNews.length > 0) {
        console.log('   2. 重新解析包含未关联原子事件的新闻');
        console.log('      或使用管理员接口：/api/v1/admin/reparse-all');
      }

      if (orphanEvents.length > 0) {
        console.log('   3. 检查孤立的标准事件（可能是无效数据）');
      }
    }

    console.log('\n✅ 一致性检查完成');

  } catch (error) {
    console.error('❌ 检查失败:', error);
    process.exit(1);
  }
}

async function fixConsistency() {
  console.log('=== 数据一致性修复 ===');

  try {
    // 1. 修复 proto_events.canonical_event_id 与 event_news 的关联
    console.log('🔄 修复 proto_events.canonical_event_id 关联...');

    const fixResult = await query(`
      WITH updated AS (
        UPDATE proto_events pe
        SET canonical_event_id = en.event_id
        FROM event_news en
        WHERE pe.news_id = en.news_id
          AND pe.canonical_event_id IS NULL
        RETURNING pe.id
      )
      SELECT COUNT(*) FROM updated
    `);

    console.log(`✅ 修复了 ${fixResult.rows[0].count} 条 proto_events 记录`);

    // 2. 检查修复结果
    const afterFixStats = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(canonical_event_id) as linked,
        COUNT(*) - COUNT(canonical_event_id) as unlinked
      FROM proto_events
    `);

    console.log(`💡 修复后状态: ${afterFixStats.rows[0].linked}/${afterFixStats.rows[0].total} 已关联`);

    if (afterFixStats.rows[0].unlinked > 0) {
      console.log(`⚠️ 仍有 ${afterFixStats.rows[0].unlinked} 条未关联的记录`);
      console.log('   这些可能需要重新解析对应的新闻');
    }

    console.log('✅ 修复完成');

  } catch (error) {
    console.error('❌ 修复失败:', error);
    process.exit(1);
  }
}

// 命令行参数处理
const command = process.argv[2];
if (!command) {
  console.log('用法:');
  console.log('  node scripts/check-consistency.mjs check    # 检查一致性');
  console.log('  node scripts/check-consistency.mjs fix      # 自动修复');
  process.exit(0);
}

if (command === 'check') {
  checkConsistency();
} else if (command === 'fix') {
  fixConsistency();
} else {
  console.log('无效命令');
  process.exit(1);
}
