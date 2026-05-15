#!/usr/bin/env node

/**
 * 从 news + proto_events 重建 L2-L6 全链路
 *
 * 两种模式：
 *   --full        清除 L3-L6 数据后全量重建（保留 news + proto_events）
 *   --incremental 仅处理尚未聚合的 proto_events（默认）
 *
 * 流程：
 *   L2 → L3: 原子事件聚合为标准事件（使用批次感知 CanonicalMerger）
 *   L3 → L4: 标准事件关系分析
 *   L4 → L5: 叙事子图构建
 *   L5 → L6: 预测假设生成（需要 LLM，可跳过）
 */

import 'dotenv/config';
import { query } from '../lib/db/connection.mjs';
import { canonicalMerger } from '../lib/analysis/canonical-merger.mjs';
import { eventRelationshipAnalyzer } from '../lib/analysis/event-relationship-analyzer.mjs';
import { storyManager } from '../lib/analysis/story-manager.mjs';
import { inferenceEngine } from '../lib/analysis/inference-engine.mjs';
import { getEventById, getEvents } from '../lib/db/events-queries.mjs';
import { getOrCreateEntity } from '../lib/db/entity-queries.mjs';
import { bulkCreateEventRelationships, deleteEventRelationships } from '../lib/db/event-relationships-queries.mjs';

// ============================================================
// 配置
// ============================================================

const BUILD_CONFIG = {
  mode: 'incremental', // 'incremental' | 'full'
  skipL6: false,       // 跳过 L6 假设生成（不需要 LLM）
  batchSize: 50,       // 关系分析批次大小
};

// ============================================================
// 工具函数
// ============================================================

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

/**
 * 从 proto_events 表记录还原为 canonicalMerger 需要的 proto 对象
 */
function reconstructProto(row) {
  const metadata = row.raw_extraction && typeof row.raw_extraction === 'object'
    ? row.raw_extraction
    : {};

  return {
    actor: row.actor_raw,
    action: row.action_raw,
    object: row.object_raw,
    location: row.location_raw,
    time: row.event_time,
    confidence: row.extraction_confidence,
    title: row.news_title,
    metadata,
  };
}

// ============================================================
// Step 1-2: L2 → L3 聚合（不产生新 proto_events，只做聚类+链接）
// ============================================================

async function aggregateL2ToL3() {
  console.log('\n[Step 1-2] L2 → L3: Aggregating proto-events to canonical events...');

  const whereClause = BUILD_CONFIG.mode === 'full'
    ? '1=1'
    : 'pe.canonical_event_id IS NULL';

  const { rows: protoEvents } = await query(`
    SELECT
      pe.*,
      n.title as news_title,
      n.content as news_content,
      n.published_at
    FROM proto_events pe
    JOIN news n ON pe.news_id = n.id
    WHERE ${whereClause}
    ORDER BY pe.news_id, pe.event_time
  `);

  console.log(`  Found ${protoEvents.length} proto-events to process`);
  if (protoEvents.length === 0) {
    console.log('  Nothing to do.');
    return { processed: 0, newEvents: 0, merged: 0 };
  }

  const grouped = groupBy(protoEvents, 'news_id');
  let totalProcessed = 0;
  let totalNew = 0;
  let totalMerged = 0;

  const newsIds = [...grouped.keys()];
  console.log(`  Across ${newsIds.length} news articles`);

  for (let i = 0; i < newsIds.length; i++) {
    const newsId = newsIds[i];
    const protos = grouped.get(newsId);

    // 维护批次中已创建的 canonical events，使后续 proto 能与同批次已创建的事件合并
    const batchCanonicals = [];

    for (const protoRow of protos) {
      const protoObj = reconstructProto(protoRow);

      // 使用 CanonicalMerger 的在线聚类（只跑评分逻辑，不 INSERT proto_events）
      const actorEntity = protoObj.actor ? await getOrCreateEntity(protoObj.actor, 'actor') : null;
      const objectEntity = protoObj.object ? await getOrCreateEntity(protoObj.object, 'actor') : null;
      const locationEntity = protoObj.location ? await getOrCreateEntity(protoObj.location, 'location') : null;

      const eventTime = canonicalMerger._sanitizeDate(protoObj.time);
      const dateStr = eventTime.split('T')[0];

      const clusterResult = await canonicalMerger.onlineClustering({
        actorEntity,
        objectEntity,
        locationEntity,
        action: protoObj.action,
        dateStr,
        newsTitle: protoObj.title || `${protoObj.actor} ${protoObj.action}`,
        batchCanonicals,
      });

      let canonicalEventId;

      if (clusterResult.bestMatch) {
        // 合并到已有标准事件
        canonicalEventId = clusterResult.bestMatch.id;
        await canonicalMerger.linkProtoToCanonical(protoRow.id, canonicalEventId, newsId);
        await canonicalMerger.updateEventStats(canonicalEventId);
        totalMerged++;
      } else {
        // 创建新的标准事件
        const result = await canonicalMerger.createCanonicalEvent({
          event_hash: clusterResult.eventHash,
          event_type: protoObj.action,
          start_time: eventTime,
          actor1_id: actorEntity?.id,
          actor2_id: objectEntity?.id,
          location_id: locationEntity?.id,
          status: 'active',
        });
        canonicalEventId = result.id;

        if (result.isNew) {
          totalNew++;
          // 注册到 TF-IDF 语料库
          const titleText = protoObj.title || `${protoObj.actor} ${protoObj.action}`;
          canonicalMerger.tfidf.addDocument(titleText);
          canonicalMerger.clusterCache.set(canonicalEventId, titleText);

          // 查询刚创建的 canonical event，加入批次候选池
          const canonical = await getEventById(canonicalEventId);
          if (canonical) batchCanonicals.push(canonical);
        }

        // 链接已存在的 proto_event 到标准事件
        await canonicalMerger.linkProtoToCanonical(protoRow.id, canonicalEventId, newsId);
      }

      totalProcessed++;
    }

    if ((i + 1) % 10 === 0 || i === newsIds.length - 1) {
      console.log(`  Progress: ${i + 1}/${newsIds.length} news articles processed`);
    }
  }

  console.log(`  Done: ${totalProcessed} proto-events → ${totalNew} new canonical events, ${totalMerged} merged into existing`);
  return { processed: totalProcessed, newEvents: totalNew, merged: totalMerged };
}

// ============================================================
// Step 3: L3 → L4 关系分析
// ============================================================

async function analyzeL4Relationships() {
  console.log('\n[Step 3] L3 → L4: Analyzing event relationships...');

  const recentEvents = await getEvents(1, 2000, {});
  console.log(`  Analyzing ${recentEvents.length} canonical events...`);

  // 先清理旧关系
  for (const event of recentEvents) {
    await deleteEventRelationships(event.id);
  }

  let totalRelationships = 0;
  const allRelationships = [];

  for (let i = 0; i < recentEvents.length; i++) {
    const event = recentEvents[i];
    const relationships = await eventRelationshipAnalyzer.analyzeNewEventRelationships(event.id);
    if (relationships.length > 0) {
      allRelationships.push(...relationships);
      totalRelationships += relationships.length;
    }

    if ((i + 1) % 50 === 0 || i === recentEvents.length - 1) {
      console.log(`  Progress: ${i + 1}/${recentEvents.length} events analyzed (${totalRelationships} relationships so far)`);
    }
  }

  if (allRelationships.length > 0) {
    await bulkCreateEventRelationships(allRelationships);
  }

  console.log(`  Done: ${totalRelationships} relationships detected across ${recentEvents.length} events`);
  return { eventsAnalyzed: recentEvents.length, relationshipsDetected: totalRelationships };
}

// ============================================================
// Step 4: L4 → L5 叙事同步
// ============================================================

async function syncL5Stories() {
  console.log('\n[Step 4] L4 → L5: Syncing narrative stories...');

  const storyCount = await storyManager.syncStories();
  console.log(`  Done: ${storyCount} story relationships processed`);
  return { storiesProcessed: storyCount };
}

// ============================================================
// Step 5: L5 → L6 假设生成
// ============================================================

async function generateL6Hypotheses() {
  if (BUILD_CONFIG.skipL6) {
    console.log('\n[Step 5] L5 → L6: Skipped (--skip-l6)');
    return { hypothesesGenerated: 0, skipped: true };
  }

  console.log('\n[Step 5] L5 → L6: Generating prediction hypotheses...');

  try {
    await inferenceEngine.generateHypotheses();
    console.log('  Done: Hypotheses generated');
    return { hypothesesGenerated: 'see_db', skipped: false };
  } catch (error) {
    console.error(`  L6 generation failed: ${error.message}`);
    return { hypothesesGenerated: 0, skipped: false, error: error.message };
  }
}

// ============================================================
// Full 模式: 清除 L3-L6 数据
// ============================================================

async function clearL3ToL6() {
  console.log('\n[Full Mode] Clearing L3-L6 data (keeping news + proto_events + entities + raw_events)...');

  const stats = {};

  // 关闭外键约束检查，按正确顺序删除所有依赖数据
  // FK 链: hypotheses → stories → events ← event_relationships
  //                              events ← event_attribute_history
  //                              events ← event_milestones
  //                              events ← event_news
  //                  events → proto_events (proto_events 引用 events，不反过)
  // 注意: proto_events 有 canonical_event_id → events.id 的引用
  // 所以必须先清 proto_events.canonical_event_id，再删 events
  await query('SET session_replication_role = replica');

  // 1. 断开 proto_events → events 的链接
  await query('UPDATE proto_events SET canonical_event_id = NULL WHERE canonical_event_id IS NOT NULL');

  // 2. 删除 hypotheses (L6)
  const { rows: hypResult } = await query('DELETE FROM hypotheses RETURNING id');
  stats.hypothesesDeleted = hypResult.length;

  // 3. 删除 event_relationships (L4)
  const { rows: relResult } = await query('DELETE FROM event_relationships RETURNING id');
  stats.relationshipsDeleted = relResult.length;

  // 4. 删除 event_attribute_history / event_milestones / event_news
  const { rows: attrResult } = await query('DELETE FROM event_attribute_history RETURNING id');
  stats.attributeHistoryDeleted = attrResult.length;

  const { rows: milestoneResult } = await query('DELETE FROM event_milestones RETURNING id');
  stats.milestonesDeleted = milestoneResult.length;

  const { rows: eventNewsResult } = await query('DELETE FROM event_news RETURNING id');
  stats.eventNewsDeleted = eventNewsResult.length;

  // 5. 删除 stories (L5)
  const { rows: storyResult } = await query('DELETE FROM stories RETURNING id');
  stats.storiesDeleted = storyResult.length;

  // 6. 删除 events (L3) — 此时 proto_events 已断开引用，CASCADE 不会触发
  const { rows: eventResult } = await query('DELETE FROM events RETURNING id');
  stats.eventsDeleted = eventResult.length;

  // 7. 恢复外键约束检查
  await query('SET session_replication_role = DEFAULT');

  // 8. 重置序列
  await query("SELECT setval('events_id_seq', 1, false)");
  await query("SELECT setval('stories_id_seq', 1, false)");
  await query("SELECT setval('hypotheses_id_seq', 1, false)");
  await query("SELECT setval('event_relationships_id_seq', 1, false)");
  await query("SELECT setval('event_attribute_history_id_seq', 1, false)");
  await query("SELECT setval('event_milestones_id_seq', 1, false)");
  await query("SELECT setval('event_news_id_seq', 1, false)");

  console.log(`  Deleted: ${stats.eventsDeleted} events, ${stats.storiesDeleted} stories, ${stats.relationshipsDeleted} relationships, ${stats.hypothesesDeleted} hypotheses`);
  return stats;
}

// ============================================================
// 统计
// ============================================================

async function printFinalStats() {
  console.log('\n=== Final Statistics ===');

  const tables = ['news', 'proto_events', 'events', 'stories', 'event_relationships', 'hypotheses'];
  const results = await Promise.allSettled(
    tables.map(t => query(`SELECT COUNT(*) FROM ${t}`))
  );

  const counts = results.map((r, i) => {
    if (r.status === 'fulfilled' && r.value?.rows?.[0]) {
      return parseInt(r.value.rows[0].count);
    }
    console.warn(`  Warning: failed to count ${tables[i]}`);
    return 0;
  });

  const [newsCount, protoCount, eventsCount, storiesCount, relsCount, hypsCount] = counts;

  // 已聚合的 proto_events
  const linkedResult = await query(
    'SELECT COUNT(*) FROM proto_events WHERE canonical_event_id IS NOT NULL'
  );
  const linkedCount = linkedResult?.rows?.[0] ? parseInt(linkedResult.rows[0].count) : 0;

  console.log(`  L1 News:          ${newsCount}`);
  console.log(`  L2 Proto Events:  ${protoCount} (${linkedCount} linked to canonical events)`);
  console.log(`  L3 Canonical:     ${eventsCount}`);
  console.log(`  L4 Relationships: ${relsCount}`);
  console.log(`  L5 Stories:       ${storiesCount}`);
  console.log(`  L6 Hypotheses:    ${hypsCount}`);
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  if (args.includes('--full')) BUILD_CONFIG.mode = 'full';
  if (args.includes('--incremental')) BUILD_CONFIG.mode = 'incremental';
  if (args.includes('--skip-l6')) BUILD_CONFIG.skipL6 = true;

  console.log('='.repeat(60));
  console.log('L2-L6 Rebuild Script');
  console.log('='.repeat(60));
  console.log(`Mode:     ${BUILD_CONFIG.mode}`);
  console.log(`Skip L6:  ${BUILD_CONFIG.skipL6}`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    // Full 模式: 先清除 L3-L6
    if (BUILD_CONFIG.mode === 'full') {
      await clearL3ToL6();
    }

    // L2 → L3
    const l2l3 = await aggregateL2ToL3();

    // L3 → L4
    const l3l4 = await analyzeL4Relationships();

    // L4 → L5
    const l4l5 = await syncL5Stories();

    // L5 → L6
    const l5l6 = await generateL6Hypotheses();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCompleted in ${duration}s`);

    // 最终统计
    await printFinalStats();

  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }
}

main();
