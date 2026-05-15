/**
 * 重新解析脚本：对 jin10 重要新闻使用 LLM 重新解析
 *
 * 流程：
 * 1. 查询 jin10 来源且 importance >= threshold 的新闻
 * 2. 删除该新闻关联的 L2-L6 数据
 * 3. 用 LLM 重新解析
 * 4. 重新走 L2-L6 流程
 */

import 'dotenv/config';
import { query } from '../lib/db/connection.mjs';
import { getNewsById } from '../lib/db/news-queries.mjs';
import { getLlmRawResponse } from '../lib/db/llm-parse-queries.mjs';
import { extractProtoEventsWithLLM } from '../apis/parsers/llm-parser.mjs';
import { processProtoEvents } from '../lib/pipeline/post-processing.mjs';
import { ingestExtractedNews } from '../lib/pipeline/event-ingestion.mjs';
import config from '../config.mjs';

// 配置
const REPARSE_CONFIG = {
  source: 'jin10',
  importanceThreshold: config.parser?.sourceConfig?.jin10?.preferLLMWhenImportanceAbove || 0.4,
  minDelay: 5000, // LLM 调用最小间隔 (ms)
  maxDelay: 10000, // LLM 调用最大间隔 (ms)
  maxProcessCount: 100, // 最大处理数量
  dryRun: false, // 设为 true 只预览不执行
};

/**
 * 获取需要重新解析的新闻列表
 */
async function getNewsForReparse() {
  const sql = `
    SELECT
      n.id,
      n.title,
      n.content,
      n.source,
      n.source_url,
      n.published_at,
      n.importance,
      n.normalized_data,
      COUNT(pe.id) as proto_event_count
    FROM news n
    LEFT JOIN proto_events pe ON pe.news_id = n.id
    WHERE n.source = $1
      AND n.importance >= $2
    GROUP BY n.id
    ORDER BY n.importance DESC, n.published_at DESC
  `;

  const result = await query(sql, [REPARSE_CONFIG.source, REPARSE_CONFIG.importanceThreshold]);
  return result.rows;
}

/**
 * 删除新闻关联的所有 L2-L6 数据
 *
 * 删除顺序（考虑外键约束）：
 * 1. hypotheses (L6) - 依赖 stories, events
 * 2. stories (L5) - 可能依赖 events
 * 3. event_relationships (L4) - 依赖 events
 * 4. event_news (关联表) - 依赖 events, news
 * 5. proto_events (L2) - 依赖 news, events, entities
 * 6. events (L3) - 需要检查是否只被当前新闻引用
 *
 * 注意：只删除只被当前新闻引用的 events，避免误删其他新闻共享的事件
 */
async function deleteNewsCascade(newsId) {
  // 获取该新闻关联的所有 canonical_event_id
  const canonicalEventsResult = await query(`
    SELECT DISTINCT canonical_event_id
    FROM proto_events
    WHERE news_id = $1 AND canonical_event_id IS NOT NULL
  `, [newsId]);

  const canonicalEventIds = canonicalEventsResult.rows.map(r => r.canonical_event_id);

  // 检查哪些事件只被当前新闻引用
  let eventsToDelete = [];
  if (canonicalEventIds.length > 0) {
    const exclusiveEventsResult = await query(`
      SELECT e.id
      FROM events e
      WHERE e.id = ANY($1::int[])
        AND (
          SELECT COUNT(DISTINCT pe.news_id)
          FROM proto_events pe
          WHERE pe.canonical_event_id = e.id
        ) = 1
    `, [canonicalEventIds]);

    eventsToDelete = exclusiveEventsResult.rows.map(r => r.id);
  }

  // 1. 删除 hypotheses（如果事件属于某个 story）
  if (eventsToDelete.length > 0) {
    await query(`
      DELETE FROM hypotheses
      WHERE story_id IN (SELECT story_id FROM events WHERE id = ANY($1::int[]) AND story_id IS NOT NULL)
    `, [eventsToDelete]);
  }

  // 2. 删除 event_relationships
  if (eventsToDelete.length > 0) {
    await query(`
      DELETE FROM event_relationships
      WHERE source_event_id = ANY($1::int[])
         OR target_event_id = ANY($1::int[])
    `, [eventsToDelete]);
  }

  // 3. 删除 event_news 关联
  if (eventsToDelete.length > 0) {
    await query(`DELETE FROM event_news WHERE event_id = ANY($1::int[])`, [eventsToDelete]);
  }

  // 4. 删除 proto_events（L2）
  await query(`DELETE FROM proto_events WHERE news_id = $1`, [newsId]);

  // 5. 删除孤立的事件（L3）
  if (eventsToDelete.length > 0) {
    await query(`DELETE FROM events WHERE id = ANY($1::int[])`, [eventsToDelete]);
    console.log(`[Reparse] Deleted ${eventsToDelete.length} exclusive events`);
  }

  // 6. 清理孤立的 stories（没有关联任何事件的）
  await query(`
    DELETE FROM stories
    WHERE id NOT IN (SELECT DISTINCT story_id FROM events WHERE story_id IS NOT NULL)
  `);

  return {
    eventsDeleted: eventsToDelete.length
  };
}

/**
 * 重新解析单条新闻
 */
async function reparseNews(newsItem) {
  const { id, title, content, source_url, published_at, importance, normalized_data } = newsItem;

  console.log(`\n[Reparse] Processing news ${id}: ${title?.slice(0, 50)}...`);
  console.log(`[Reparse] Importance: ${importance}, URL: ${source_url}`);

  // 检查是否已有成功的 LLM 解析记录
  const existingLlmResult = await getLlmRawResponse(id);
  if (existingLlmResult) {
    console.log(`[Reparse] Skipping: already has LLM parse result (model: ${existingLlmResult.model_used}, proto_events: ${existingLlmResult.proto_event_count})`);
    return { status: 'already_parsed', protoEventCount: existingLlmResult.proto_event_count };
  }

  if (REPARSE_CONFIG.dryRun) {
    console.log(`[Reparse] DRY RUN - skipping`);
    return { status: 'dry_run' };
  }

  try {
    // 1. 删除级联数据
    console.log(`[Reparse] Step 1: Deleting cascade data...`);
    const deleteResult = await deleteNewsCascade(id);

    // 2. LLM 解析
    console.log(`[Reparse] Step 2: LLM parsing...`);
    const extractionResult = await extractProtoEventsWithLLM(title, content, {
      newsId: id,
      saveResult: true
    });

    // 3. 后处理
    console.log(`[Reparse] Step 3: Post-processing...`);
    const processedResult = await processProtoEvents(extractionResult);

    // 4. 重新入库 (L2-L6)
    console.log(`[Reparse] Step 4: Ingesting (${processedResult.proto_events?.length || 0} proto-events)...`);

    const sourceNews = {
      source: 'jin10',
      source_url,
      published_at,
      title,
      content,
      lang: 'zh',
      importance,
      reliability_score: 0.9,
      normalized_data
    };

    const ingestionResult = await ingestExtractedNews(
      {
        ...processedResult,
        title,
        description: content,
        event_time: published_at,
        mentions: 1,
        normalized_data
      },
      sourceNews
    );

    console.log(`[Reparse] Success! Affected events: ${ingestionResult.affected_events?.length || 0}`);

    return {
      status: 'success',
      protoEventCount: processedResult.proto_events?.length || 0,
      affectedEvents: ingestionResult.affected_events,
      eventsDeleted: deleteResult.eventsDeleted
    };

  } catch (error) {
    console.error(`[Reparse] Failed for news ${id}:`, error.message);
    return { status: 'error', error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Jin10 Important News LLM Reparse Script');
  console.log('='.repeat(60));
  console.log(`Source: ${REPARSE_CONFIG.source}`);
  console.log(`Importance threshold: ${REPARSE_CONFIG.importanceThreshold}`);
  console.log(`Delay between calls: ${REPARSE_CONFIG.minDelay}-${REPARSE_CONFIG.maxDelay}ms (random)`);
  console.log(`Max process count: ${REPARSE_CONFIG.maxProcessCount}`);
  console.log(`Dry run: ${REPARSE_CONFIG.dryRun}`);
  console.log('='.repeat(60));

  // 获取新闻列表
  const newsList = await getNewsForReparse();
  console.log(`\nFound ${newsList.length} news items to process\n`);

  if (newsList.length === 0) {
    console.log('No news items match the criteria. Exiting.');
    return;
  }

  // 统计
  const stats = {
    total: newsList.length,
    success: 0,
    error: 0,
    skipped: 0,
    already_parsed: 0
  };

  // 串行处理
  let processedCount = 0; // 已实际处理（非跳过）的数量
  for (let i = 0; i < newsList.length; i++) {
    const newsItem = newsList[i];
    console.log(`\n[${i + 1}/${newsList.length}] Processing...`);

    const result = await reparseNews(newsItem);

    if (result.status === 'success') {
      stats.success++;
      processedCount++;
    } else if (result.status === 'error') {
      stats.error++;
      processedCount++;
    } else if (result.status === 'dry_run') {
      stats.skipped++;
    } else if (result.status === 'already_parsed') {
      stats.already_parsed++;
    }

    // 达到最大处理数量则停止
    if (processedCount >= REPARSE_CONFIG.maxProcessCount) {
      console.log(`\n[Reparse] Reached max process count (${REPARSE_CONFIG.maxProcessCount}), stopping.`);
      break;
    }

    // 随机延迟，避免快速调用 LLM
    if (i < newsList.length - 1 && !REPARSE_CONFIG.dryRun) {
      const delay = REPARSE_CONFIG.minDelay + Math.random() * (REPARSE_CONFIG.maxDelay - REPARSE_CONFIG.minDelay);
      console.log(`[Reparse] Waiting ${Math.round(delay / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 输出统计
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total: ${stats.total}`);
  console.log(`Success: ${stats.success}`);
  console.log(`Already parsed (skipped): ${stats.already_parsed}`);
  console.log(`Error: ${stats.error}`);
  console.log(`Skipped (dry run): ${stats.skipped}`);
  console.log('='.repeat(60));
}

// 运行
main().catch(console.error);
