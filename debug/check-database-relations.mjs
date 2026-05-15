/**
 * 数据库关系完整性检查
 * 检查外键关系是否正确建立
 */

import { query } from '../lib/db/connection.mjs';

async function checkDatabaseRelations() {
  console.log('='.repeat(60));
  console.log('数据库关系完整性检查');
  console.log('='.repeat(60));

  const issues = [];

  // 1. proto_events -> news 关联
  console.log('\n[1] proto_events -> news 关联');
  const protoWithoutNews = await query(`
    SELECT COUNT(*) as count
    FROM proto_events pe
    LEFT JOIN news n ON pe.news_id = n.id
    WHERE pe.news_id IS NOT NULL AND n.id IS NULL
  `);
  console.log(`  - proto_events.news_id 指向不存在新闻的记录: ${protoWithoutNews.rows[0].count}`);
  if (parseInt(protoWithoutNews.rows[0].count) > 0) issues.push('proto_events.news_id 有孤立记录');

  const protoWithNullNews = await query(`
    SELECT COUNT(*) as count FROM proto_events WHERE news_id IS NULL
  `);
  console.log(`  - proto_events.news_id 为 NULL 的记录: ${protoWithNullNews.rows[0].count}`);

  // 2. proto_events -> events (canonical_event_id) 关联
  console.log('\n[2] proto_events -> events (canonical_event_id) 关联');
  const protoWithoutCanonical = await query(`
    SELECT COUNT(*) as count FROM proto_events WHERE canonical_event_id IS NULL
  `);
  console.log(`  - proto_events.canonical_event_id 为 NULL 的记录: ${protoWithoutCanonical.rows[0].count}`);

  // 3. event_news 关联表
  console.log('\n[3] event_news 关联表');
  const eventNewsStats = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN event_id IS NULL THEN 1 END) as null_event,
      COUNT(CASE WHEN news_id IS NULL THEN 1 END) as null_news
    FROM event_news
  `);
  console.log(`  - event_news 总记录: ${eventNewsStats.rows[0].total}`);
  console.log(`  - event_id 为 NULL: ${eventNewsStats.rows[0].null_event}`);
  console.log(`  - news_id 为 NULL: ${eventNewsStats.rows[0].null_news}`);

  // 4. events -> proto_events 反向关联
  console.log('\n[4] events -> proto_events 反向关联');
  const eventsWithoutProto = await query(`
    SELECT COUNT(*) as count
    FROM events e
    LEFT JOIN proto_events pe ON e.id = pe.canonical_event_id
    WHERE pe.id IS NULL
  `);
  console.log(`  - 没有任何 proto_events 的 events: ${eventsWithoutProto.rows[0].count}`);

  // 5. news -> proto_events 关联
  console.log('\n[5] news -> proto_events 关联');
  const newsWithoutProto = await query(`
    SELECT COUNT(*) as count
    FROM news n
    LEFT JOIN proto_events pe ON n.id = pe.news_id
    WHERE pe.id IS NULL
  `);
  console.log(`  - 没有任何 proto_events 的 news: ${newsWithoutProto.rows[0].count}`);

  const newsWithProto = await query(`
    SELECT COUNT(DISTINCT news_id) as count FROM proto_events WHERE news_id IS NOT NULL
  `);
  const totalNews = await query(`SELECT COUNT(*) as count FROM news`);
  console.log(`  - 有 proto_events 的 news: ${newsWithProto.rows[0].count} / ${totalNews.rows[0].count}`);

  // 6. 按来源统计未解析的新闻
  console.log('\n[6] 按来源统计未解析的新闻');
  const unparsedBySource = await query(`
    SELECT n.source, COUNT(*) as count
    FROM news n
    LEFT JOIN proto_events pe ON n.id = pe.news_id
    WHERE pe.id IS NULL
    GROUP BY n.source
    ORDER BY count DESC
  `);
  unparsedBySource.rows.forEach(row => {
    console.log(`  - ${row.source}: ${row.count} 条未解析`);
  });

  // 7. events -> story 关联 (L5)
  console.log('\n[7] events -> stories 关联 (L5)');
  const eventsWithoutStory = await query(`
    SELECT COUNT(*) as count FROM events WHERE story_id IS NULL
  `);
  console.log(`  - 没有关联 story 的 events: ${eventsWithoutStory.rows[0].count}`);

  // 8. stories -> events 反向关联
  console.log('\n[8] stories -> events 反向关联');
  const orphanStories = await query(`
    SELECT COUNT(*) as count
    FROM stories s
    LEFT JOIN events e ON s.id = e.story_id
    WHERE e.id IS NULL
  `);
  console.log(`  - 没有任何 events 的 stories: ${orphanStories.rows[0].count}`);

  // 9. hypotheses -> story 关联 (L6)
  console.log('\n[9] hypotheses -> stories 关联 (L6)');
  const hypothesesWithoutStory = await query(`
    SELECT COUNT(*) as count FROM hypotheses WHERE story_id IS NULL
  `);
  console.log(`  - 没有关联 story 的 hypotheses: ${hypothesesWithoutStory.rows[0].count}`);

  // 10. LLM 解析结果统计
  console.log('\n[10] LLM 解析结果统计');
  const llmStats = await query(`
    SELECT
      status,
      COUNT(*) as count
    FROM llm_parse_results
    GROUP BY status
    ORDER BY count DESC
  `);
  if (llmStats.rows.length > 0) {
    llmStats.rows.forEach(row => {
      console.log(`  - ${row.status}: ${row.count} 条`);
    });
  } else {
    console.log('  - 无 LLM 解析记录');
  }

  // 11. 检查实体映射
  console.log('\n[11] 实体映射 (entity_mapping)');
  const entityStats = await query(`
    SELECT entity_type, COUNT(*) as count
    FROM entity_mapping
    GROUP BY entity_type
    ORDER BY count DESC
  `).catch(() => ({ rows: [] }));
  if (entityStats.rows.length > 0) {
    entityStats.rows.forEach(row => {
      console.log(`  - ${row.entity_type}: ${row.count}`);
    });
  } else {
    console.log('  - (无法获取或无数据)');
  }

  // 12. proto_events 中实体关联情况
  console.log('\n[12] proto_events 实体关联情况');
  const protoEntityStats = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(actor_entity_id) as with_actor_entity,
      COUNT(object_entity_id) as with_object_entity,
      COUNT(location_id) as with_location
    FROM proto_events
  `);
  console.log(`  - 总 proto_events: ${protoEntityStats.rows[0].total}`);
  console.log(`  - 有 actor_entity_id: ${protoEntityStats.rows[0].with_actor_entity}`);
  console.log(`  - 有 object_entity_id: ${protoEntityStats.rows[0].with_object_entity}`);
  console.log(`  - 有 location_id: ${protoEntityStats.rows[0].with_location}`);

  // 汇总
  console.log('\n' + '='.repeat(60));
  console.log('检查结果汇总');
  console.log('='.repeat(60));

  if (issues.length === 0) {
    console.log('✅ 所有外键关系正常');
  } else {
    console.log('❌ 发现以下问题:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  }

  // 关键指标
  console.log('\n关键指标:');
  console.log(`  - 新闻解析率: ${((newsWithProto.rows[0].count / totalNews.rows[0].count) * 100).toFixed(1)}%`);
  console.log(`  - 原子事件关联率: ${((2623 - protoWithNullNews.rows[0].count) / 2623 * 100).toFixed(1)}%`);
}

checkDatabaseRelations()
  .then(() => {
    console.log('\n检查完成');
    process.exit(0);
  })
  .catch(err => {
    console.error('检查失败:', err);
    process.exit(1);
  });
