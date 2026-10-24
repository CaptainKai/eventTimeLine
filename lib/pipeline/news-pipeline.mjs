/**
 * 统一数据处理 Pipeline
 * 所有数据源的数据都通过此 pipeline 处理
 *
 * 流程：入库 news → 获取 newsId → 解析 → 入库 L2-L6
 */

import { upsertNews, checkNewsExists, isNewsParsed } from '../db/news-queries.mjs';
import { saveRawEvent } from '../db/raw-queries.mjs';
import { releaseNewsLocks, tryAcquireNewsLocks } from '../db/normalization-rebuild-queries.mjs';
import { extractWithSelectedParser } from './parser-selector.mjs';
import { ingestExtractedNews } from './event-ingestion.mjs';
import { createNewsStableId } from '../data/stable-identifiers.mjs';
import { createProcessingContext, withProcessingMetadata } from '../data/processing-context.mjs';
import { createNewsRawEvent, createParserRequest } from '../events/envelopes.mjs';
import { TOPICS } from '../events/topics.mjs';
import { enqueueOutboxEvent } from '../db/event-outbox-queries.mjs';
import { withTransaction } from '../db/connection.mjs';
import { resolveAuthority } from '../data/authority.mjs';

/**
 * 处理单条新闻的完整流程
 *
 * @param {object} newsData - 新闻数据
 * @param {string} newsData.source - 数据源名称
 * @param {string} newsData.source_url - 来源 URL
 * @param {string} newsData.title - 标题
 * @param {string} newsData.content - 内容
 * @param {string} newsData.published_at - 发布时间
 * @param {number} newsData.importance - 重要性分数
 * @param {string} newsData.lang - 语言
 * @param {number} newsData.reliability_score - 可靠性分数
 * @param {object} newsData.normalized_data - 额外元数据
 * @param {object} newsData.raw_data - 原始数据（用于保存到 raw_events）
 * @param {string} newsData.source_event_id - 源事件 ID
 * @param {object} options - 可选配置
 * @param {boolean} options.skipIfParsed - 如果已解析则跳过，默认 true
 * @returns {object} 处理结果
 */
export async function processNewsArticle(newsData, options = {}) {
  const {
    source,
    source_url,
    title,
    content,
    published_at,
    importance = 0.5,
    lang = 'en',
    reliability_score = 0.8,
    normalized_data = {},
    raw_data = null,
    source_event_id = null,
  } = newsData;

  const { skipIfParsed = true } = options;
  const processingContext = createProcessingContext({
    job_name: options.jobName || `news-pipeline:${source || 'unknown'}`,
    pipeline_run_id: options.pipelineRunId,
    parser_version: options.parserVersion,
    prompt_version: options.promptVersion,
    normalization_version: options.normalizationVersion,
    logic_version: options.logicVersion
  });
  const stableId = createNewsStableId({ source, sourceUrl: source_url, sourceEventId: source_event_id });
  const versionedNormalizedData = withProcessingMetadata(normalized_data, processingContext);

  // 1. 检查是否已存在且已解析
  const existingNewsId = await checkNewsExists(source, source_url);
  if (existingNewsId && skipIfParsed) {
    const alreadyParsed = await isNewsParsed(existingNewsId);
    if (alreadyParsed) {
      console.log(`[Pipeline] Skip: ${source} news ${existingNewsId} already parsed`);
      return {
        status: 'skipped',
        reason: 'already-parsed',
        news_id: existingNewsId,
      };
    }
  }

  // 2. 保存原始事件（如果有原始数据）
  let rawEventId = null;
  if (raw_data || source_event_id) {
    rawEventId = await saveRawEvent({
      source,
      source_event_id,
      event_time: published_at,
      raw_data: raw_data || {},
      source_url,
    });
  }

  // 3. 先入库 news，获取 newsId
  const newsWrite = {
    raw_event_id: rawEventId,
    title,
    content,
    source,
    source_url,
    published_at,
    lang,
    importance,
    reliability_score,
    normalized_data: versionedNormalizedData,
    stable_id: stableId,
    ...processingContext,
  };

  const parserAuthorityState = resolveAuthority('parser', options.parserAuthority || process.env.PARSER_AUTHORITY_MODE);
  const parserAuthority = parserAuthorityState.effective_mode;
  const eventBusEnabled = process.env.EVENT_BUS_ENABLED === 'true' || parserAuthority !== 'inline';
  const newsEvent = eventBusEnabled
    ? createNewsRawEvent({ ...newsData, stable_id: stableId, normalized_data: versionedNormalizedData }, processingContext)
    : null;
  const parserRequest = newsEvent ? createParserRequest(newsEvent, processingContext) : null;
  const newsResult = eventBusEnabled
    ? await withTransaction(async queryFn => {
      const result = await upsertNews(newsWrite, { queryFn });
      await enqueueOutboxEvent({ event_id: newsEvent.event_id, topic: TOPICS.newsRaw, key: newsEvent.event_id, payload: newsEvent }, { queryFn });
      await enqueueOutboxEvent({ event_id: parserRequest.event_id, topic: TOPICS.parserRequest, key: newsEvent.event_id, payload: parserRequest }, { queryFn });
      return result;
    })
    : await upsertNews(newsWrite);

  const newsId = newsResult.id;
  if (parserAuthority === 'worker') {
    return {
      status: 'queued',
      news_id: newsId,
      stable_id: stableId,
      parser_authority: parserAuthority,
      authority_guarded: parserAuthorityState.guarded,
      pipeline_run_id: processingContext.pipeline_run_id,
      data_version: processingContext.schema_version,
    };
  }
  const lockOwner = `pipeline:${newsId}:${process.pid}:${Date.now()}`;
  const lockInfo = await tryAcquireNewsLocks([newsId], {
    owner: lockOwner,
    reason: `process_news:${source || 'unknown'}`,
    ttlMs: Number(process.env.PIPELINE_NEWS_LOCK_TTL_MS || 30 * 60 * 1000)
  });

  if (!lockInfo.acquired) {
    console.log(`[Pipeline] Defer: news ${newsId} is locked by rebuild or another pipeline writer`);
    return {
      status: 'skipped',
      reason: 'news-lock-busy',
      news_id: newsId,
      deferred_news_ids: lockInfo.deferred_news_ids,
    };
  }

  try {
  /*

  // 再次检查是否已解析（可能在并发情况下被其他进程解析）
  */
  if (skipIfParsed && await isNewsParsed(newsId)) {
    console.log(`[Pipeline] Skip: news ${newsId} was parsed by another process`);
    return {
      status: 'skipped',
      reason: 'already-parsed',
      news_id: newsId,
    };
  }

  // 4. 解析
  console.log(`[Pipeline] Parsing ${source} news ${newsId}: ${title?.slice(0, 30)}...`);
  const extracted = await extractWithSelectedParser(title, content, {
    source,
    importance,
    newsId,
    lang,
  });

  // 5. 入库到事件模型 (L2-L6)
  const ingestionResult = await ingestExtractedNews(
    {
      ...extracted,
      title,
      description: content,
      event_time: published_at,
      mentions: 1,
      normalized_data: versionedNormalizedData,
      processing_context: processingContext,
      stable_id: stableId,
    },
    {
      news_id: newsId,
      raw_event_id: rawEventId,
      source,
      source_url,
      published_at,
      lang,
      title,
      content,
      reliability_score,
      normalized_data,
      locksAlreadyHeld: true,
    }
  );

  return {
    status: 'success',
    news_id: newsId,
    proto_event_count: ingestionResult.proto_event_count,
    affected_events: ingestionResult.affected_events,
    stable_id: stableId,
    pipeline_run_id: processingContext.pipeline_run_id,
    data_version: processingContext.schema_version,
    parser_authority: parserAuthority,
    authority_guarded: parserAuthorityState.guarded,
  };
  } finally {
    await releaseNewsLocks(lockInfo.lock_keys, lockOwner);
  }
}

/**
 * 批量处理新闻
 *
 * @param {Array} newsList - 新闻列表
 * @param {object} options - 处理选项
 * @returns {object} 处理统计
 */
export async function processNewsBatch(newsList, options = {}) {
  const stats = {
    total: newsList.length,
    success: 0,
    skipped: 0,
    queued: 0,
    failed: 0,
    results: [],
  };

  for (const newsData of newsList) {
    try {
      const result = await processNewsArticle(newsData, options);
      stats.results.push(result);

      if (result.status === 'success') {
        stats.success++;
      } else if (result.status === 'skipped') {
        stats.skipped++;
      } else if (result.status === 'queued') {
        stats.queued++;
      }
    } catch (error) {
      console.error(`[Pipeline] Failed to process news: ${error.message}`);
      stats.failed++;
      stats.results.push({ status: 'error', error: error.message });
    }
  }

  return stats;
}

export default {
  processNewsArticle,
  processNewsBatch,
};
