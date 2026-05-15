/**
 * 重新解析脚本 - 按日期范围重新解析新闻（非LLM方法）
 *
 * 流程：
 * 1. 查询截止日期之前的新闻，筛选出需要重新解析的（排除jin10且已有LLM解析结果的）
 * 2. 一次性删除这些新闻关联的 L2-L6 数据
 * 3. 使用 enhanced parser（非LLM）批量重新解析
 * 4. 重新走 L2-L6 流程
 */

import 'dotenv/config';
import { query } from '../lib/db/connection.mjs';
import { getLlmRawResponse } from '../lib/db/llm-parse-queries.mjs';
import { parseChineseNews, parseEnglishNews } from '../apis/parsers/enhanced-parser.mjs';
import { processProtoEvents } from '../lib/pipeline/post-processing.mjs';
import { ingestExtractedNews } from '../lib/pipeline/event-ingestion.mjs';
import { deleteOrphanedStories } from './cleanup-news-cascade.mjs';

// 配置
const REPARSE_CONFIG = {
  // 截止时间：2026-04-27 17:00:00
  cutoffTime: '2026-04-27 17:00:00',
  // 最大处理数量
  maxProcessCount: 5000,
  // 批次大小
  batchSize: 100,
  // 干跑模式
  dryRun: false,
};

/**
 * 语言检测
 */
function detectLanguage(title, content, lang) {
  if (lang) {
    if (lang.startsWith('zh') || lang === 'cn' || lang === 'zho' || lang === 'chi') return 'zh';
    if (lang.startsWith('en')) return 'en';
  }

  const text = `${title} ${content || ''}`;
  let chineseChars = 0;
  let latinChars = 0;

  for (const ch of text) {
    if (/[一-鿿]/.test(ch)) chineseChars++;
    else if (/[a-zA-Z]/.test(ch)) latinChars++;
  }

  const totalChars = chineseChars + latinChars;
  if (totalChars === 0) return 'en';
  return (chineseChars / totalChars > 0.3) ? 'zh' : 'en';
}

/**
 * 批量检查新闻是否需要重新解析
 * 返回 [newsId, ...] 列表
 */
async function filterNewsNeedingReparse(newsList) {
  // 先过滤出 jin10 源新闻
  const jin10News = newsList.filter(n => n.source === 'jin10');

  // 批量检查 jin10 新闻的 LLM 解析结果
  const skipIds = new Set();
  for (const news of jin10News) {
    const llmResult = await getLlmRawResponse(news.id);
    if (llmResult) {
      skipIds.add(news.id);
      console.log(`[Skip] jin10 news ${news.id} has LLM result (model: ${llmResult.model_used}), preserving`);
    }
  }

  return newsList.filter(n => !skipIds.has(n.id));
}

/**
 * 批量获取需要重新解析的新闻
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
      n.lang,
      n.normalized_data
    FROM news n
    WHERE n.published_at < $1
    ORDER BY n.published_at DESC
    LIMIT $2
  `;

  const result = await query(sql, [REPARSE_CONFIG.cutoffTime, REPARSE_CONFIG.maxProcessCount]);
  return result.rows;
}

/**
 * 批量删除新闻关联的 L2-L6 数据
 *
 * 删除原则：只有当事件没有任何 proto_events 引用时，才删除该事件
 *
 * FK 链：
 *   news.event_id → events.id (CASCADE) - 删除事件会级联删除新闻
 *   event_attribute_history.triggering_news_id → news.id (NO ACTION) - 阻断新闻删除
 *
 * 所以必须先断开所有指向孤立事件的 news.event_id，再删除事件
 */
async function batchDeleteCascade(newsIds) {
  if (newsIds.length === 0) return { eventsDeleted: 0 };

  console.log(`[BatchDelete] Deleting L2-L6 for ${newsIds.length} news items...`);

  // 1. 先删除这些新闻的 proto_events（L2）
  await query(`DELETE FROM proto_events WHERE news_id = ANY($1)`, [newsIds]);

  // 2. 获取所有孤立事件（没有任何 proto_events 引用）
  const orphanedResult = await query(`
    SELECT id FROM events
    WHERE NOT EXISTS (
      SELECT 1 FROM proto_events pe WHERE pe.canonical_event_id = events.id
    )
  `);
  const orphanedEventIds = orphanedResult.rows.map(r => r.id);

  console.log(`[BatchDelete] Found ${orphanedEventIds.length} orphaned events to delete`);

  if (orphanedEventIds.length === 0) {
    return { eventsDeleted: 0, newsDeleted: newsIds.length };
  }

  // 3. 断开所有指向孤立事件的 news.event_id
  //    这是关键步骤：news.event_id 有 CASCADE，删除事件时会级联删除新闻
  //    但新闻被 event_attribute_history.triggering_news_id (NO ACTION) 引用
  //    所以必须先断开，否则级联会失败
  const unlinkedNews = await query(`
    UPDATE news SET event_id = null WHERE event_id = ANY($1::int[])
  `, [orphanedEventIds]);
  console.log(`[BatchDelete] Unlinked ${unlinkedNews.rowCount} news records from orphaned events`);

  // 4. 删除 hypotheses（L6，依赖 stories）
  await query(`
    DELETE FROM hypotheses
    WHERE story_id IN (SELECT story_id FROM events WHERE id = ANY($1::int[]) AND story_id IS NOT NULL)
  `, [orphanedEventIds]);

  // 5. 删除 event_relationships（L4）
  await query(`
    DELETE FROM event_relationships
    WHERE source_event_id = ANY($1::int[])
       OR target_event_id = ANY($1::int[])
  `, [orphanedEventIds]);

  // 6. 删除 event_news 关联
  await query(`DELETE FROM event_news WHERE event_id = ANY($1::int[])`, [orphanedEventIds]);

  // 7. 删除 event_attribute_history
  //    event_id 有 CASCADE 会随事件自动删除
  //    但手动删除可以避免与 triggering_news_id FK 冲突
  await query(`
    DELETE FROM event_attribute_history WHERE event_id = ANY($1::int[])
  `, [orphanedEventIds]);

  // 8. 删除 event_milestones（同上）
  await query(`
    DELETE FROM event_milestones WHERE event_id = ANY($1::int[])
  `, [orphanedEventIds]);

  // 9. 删除孤立事件（L3）
  //    此时所有 news.event_id 已断开，CASCADE 不会触发
  await query(`DELETE FROM events WHERE id = ANY($1::int[])`, [orphanedEventIds]);

  // 10. 清理孤立 stories
  await deleteOrphanedStories();

  return {
    eventsDeleted: orphanedEventIds.length,
    newsDeleted: newsIds.length
  };
}

/**
 * 使用 enhanced parser（非LLM）解析新闻
 */
async function parseWithEnhancedParser(newsItem) {
  const { title, content, lang } = newsItem;
  const detectedLang = detectLanguage(title, content, lang);

  let extractionResult;
  if (detectedLang === 'zh') {
    extractionResult = await parseChineseNews(title, content);
  } else {
    extractionResult = await parseEnglishNews(title, content);
  }

  return extractionResult;
}

/**
 * 重新解析单条新闻
 */
async function reparseNews(newsItem) {
  const { id, title, content, source, source_url, published_at, importance, lang, normalized_data } = newsItem;

  try {
    // 1. Enhanced parser 解析（非LLM）
    const extractionResult = await parseWithEnhancedParser(newsItem);

    // 2. 后处理
    const processedResult = await processProtoEvents(extractionResult);

    // 3. 重新入库 (L2-L6)
    const sourceNews = {
      source,
      source_url,
      published_at,
      title,
      content,
      lang: lang || 'en',
      importance: importance || 0.5,
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

    return {
      status: 'success',
      newsId: id,
      protoEventCount: processedResult.proto_events?.length || 0,
      affectedEvents: ingestionResult.affected_events?.length || 0
    };

  } catch (error) {
    console.error(`[Reparse] Failed for news ${id}:`, error.message);
    return { status: 'error', newsId: id, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('News Reparse Script (Enhanced Parser - Non-LLM)');
  console.log('='.repeat(60));
  console.log(`Cutoff time: ${REPARSE_CONFIG.cutoffTime}`);
  console.log(`Max process count: ${REPARSE_CONFIG.maxProcessCount}`);
  console.log(`Batch size: ${REPARSE_CONFIG.batchSize}`);
  console.log(`Dry run: ${REPARSE_CONFIG.dryRun}`);
  console.log('='.repeat(60));

  if (REPARSE_CONFIG.dryRun) {
    console.log('\n[DRY RUN MODE - No actual changes will be made]\n');
  }

  // 1. 获取新闻列表
  console.log('\n[Step 1] Fetching news list...');
  const allNews = await getNewsForReparse();
  console.log(`Found ${allNews.length} candidate news items`);

  if (allNews.length === 0) {
    console.log('No news items found. Exiting.');
    return;
  }

  // 2. 过滤需要重新解析的新闻（排除 jin10 LLM 结果）
  console.log('\n[Step 2] Filtering news needing reparse (preserving jin10 LLM results)...');
  const newsToReparse = await filterNewsNeedingReparse(allNews);
  console.log(`Will reparse ${newsToReparse.length} news items`);

  if (newsToReparse.length === 0) {
    console.log('No news items need reparse. Exiting.');
    return;
  }

  if (REPARSE_CONFIG.dryRun) {
    console.log('\n[DRY RUN] News to reparse:');
    newsToReparse.slice(0, 10).forEach(n => {
      console.log(`  - [${n.id}] ${n.source} | ${n.title?.slice(0, 40)}`);
    });
    if (newsToReparse.length > 10) {
      console.log(`  ... and ${newsToReparse.length - 10} more`);
    }
    return;
  }

  // 3. 批量删除 L2-L6 数据
  console.log('\n[Step 3] Batch deleting L2-L6 data...');
  const newsIds = newsToReparse.map(n => n.id);
  const deleteResult = await batchDeleteCascade(newsIds);
  console.log(`Deleted ${deleteResult.eventsDeleted} events for ${deleteResult.newsDeleted} news items`);

  // 4. 批量重新解析
  console.log('\n[Step 4] Batch re-parsing news...');
  const stats = {
    total: newsToReparse.length,
    success: 0,
    error: 0,
    zeroProtoEvents: 0
  };

  for (let i = 0; i < newsToReparse.length; i++) {
    const newsItem = newsToReparse[i];

    if (i > 0 && i % REPARSE_CONFIG.batchSize === 0) {
      console.log(`[Progress] ${i}/${newsToReparse.length} processed...`);
      await new Promise(resolve => setTimeout(resolve, 500)); // 批次间短暂延迟
    }

    const result = await reparseNews(newsItem);

    if (result.status === 'success') {
      stats.success++;
      if (result.protoEventCount === 0) {
        stats.zeroProtoEvents++;
        console.log(`[ZeroProto] news ${newsItem.id}: ${newsItem.title?.slice(0, 30)}...`);
      }
    } else {
      stats.error++;
    }
  }

  // 输出统计
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total news to reparse: ${stats.total}`);
  console.log(`Success: ${stats.success}`);
  console.log(`Zero proto-events: ${stats.zeroProtoEvents}`);
  console.log(`Errors: ${stats.error}`);
  console.log('='.repeat(60));
}

// 运行
main().catch(console.error);