import { relationshipSummaryManager } from '../analysis/relationship-summary-manager.mjs';
import { enqueueAtomicBatchAssignment } from '../db/atomic-batch-assignment-queries.mjs';
import { upsertNews, checkNewsExists, isNewsParsed } from '../db/news-queries.mjs';
import { withNewsLocks } from '../db/normalization-rebuild-queries.mjs';
import { resolveEntitiesForProtoEvents } from './entity-resolution.mjs';
import { resolveActionsForProtoEvents } from './action-resolution.mjs';

/**
 * 6层模型摄入入口: 接收已解析的文章及其原子事件 (L1 + L2)
 * @param {object} extractionResult - 解析结果，包含 proto_events
 * @param {object} sourceNews - 新闻元数据
 * @param {number} sourceNews.news_id - 已有的新闻ID（可选，若提供则跳过新闻入库）
 */
export async function ingestExtractedNews(extractionResult, sourceNews) {
  const { proto_events = [], topic, sentiment } = extractionResult;

  // 如果已提供 news_id，直接使用；否则检查是否已存在
  let newsId = sourceNews.news_id || null;

  if (!newsId) {
    // 检查新闻是否已被解析过
    const existingNewsId = await checkNewsExists(sourceNews.source, sourceNews.source_url);
    if (existingNewsId) {
      const alreadyParsed = await isNewsParsed(existingNewsId);
      if (alreadyParsed) {
        console.log(`[Ingestion] Skip: News ${existingNewsId} already parsed with proto_events`);
        return {
          news_id: existingNewsId,
          proto_event_count: 0,
          affected_events: [],
          status: 'skipped_already_parsed'
        };
      }
      console.log(`[Ingestion] News ${existingNewsId} exists but no proto_events, will re-parse`);
    }
  } else {
    // 检查已有的 news 是否已被解析
    const alreadyParsed = await isNewsParsed(newsId);
    if (alreadyParsed) {
      console.log(`[Ingestion] Skip: News ${newsId} already parsed with proto_events`);
      return {
        news_id: newsId,
        proto_event_count: 0,
        affected_events: [],
        status: 'skipped_already_parsed'
      };
    }
  }

  console.log(`[Ingestion] Processing article with ${proto_events.length} proto-events...`);

  // 对原子事实进行去重（基于 actor + action + object 组合）
  const uniqueProtoEvents = deduplicateProtoEvents(proto_events);
  if (uniqueProtoEvents.length < proto_events.length) {
    console.log(`[Ingestion] Dedup: 从 ${proto_events.length} 条原子事实去重为 ${uniqueProtoEvents.length} 条`);
  }

  const resolvedProtoEvents = sourceNews.preResolvedProtoEvents === true
    ? uniqueProtoEvents
    : await resolveActionsForProtoEvents(
      await resolveEntitiesForProtoEvents(uniqueProtoEvents, {
        title: sourceNews.title,
        newsId
      }),
      {
        title: sourceNews.title,
        newsId
      }
    );

  // 1. [L1: Article] 保存新闻记录（如果还没有 newsId）
  let newsResult;
  if (newsId) {
    // 使用已有的 newsId，更新 normalized_data
    newsResult = { id: newsId };
  } else {
    // 入库新新闻
    newsResult = await upsertNews({
      raw_event_id: sourceNews.raw_event_id || null,
      title: sourceNews.title,
      content: sourceNews.content,
      source: sourceNews.source,
      source_url: sourceNews.source_url,
      published_at: sourceNews.published_at,
      lang: sourceNews.lang || 'en',
      sentiment: sentiment ?? null,
      importance: sourceNews.importance ?? 0.5,
      reliability_score: sourceNews.reliability_score ?? 0.8,
      normalized_data: {
        ...(sourceNews.normalized_data || {}),
        topic: topic || 'general',
        proto_event_count: uniqueProtoEvents.length
      },
    });
  }

  const finalNewsId = newsResult.id;

  if (sourceNews.locksAlreadyHeld !== true) {
    const owner = `ingestion:${finalNewsId}:${process.pid}:${Date.now()}`;
    const { result } = await withNewsLocks([finalNewsId], {
      owner,
      reason: sourceNews.lock_reason || `ingestion:${sourceNews.source || 'unknown'}`,
      ttlMs: Number(process.env.PIPELINE_NEWS_LOCK_TTL_MS || 30 * 60 * 1000)
    }, async () => ingestResolvedProtoEvents(resolvedProtoEvents, finalNewsId, sourceNews));
    return result;
  }

  return ingestResolvedProtoEvents(resolvedProtoEvents, finalNewsId, sourceNews);
}

async function ingestResolvedProtoEvents(resolvedProtoEvents, finalNewsId, sourceNews) {
  const atomicResults = [];
  for (const [eventIndex, proto] of resolvedProtoEvents.entries()) {
    const result = await relationshipSummaryManager.ingestProtoEvent(proto, finalNewsId, {
      publishedAt: sourceNews.published_at,
      historyOnly: false,
      asyncAssignment: sourceNews.asyncAtomicAssignment !== false,
      eventIndex,
      newsStableId: sourceNews.stable_id,
      processingContext: sourceNews.processing_context
    });
    if (sourceNews.asyncAtomicAssignment !== false && result.proto_id) {
      const queueRow = await enqueueAtomicBatchAssignment(result.proto_id, {
        payload: {
          news_id: finalNewsId,
          source: sourceNews.source || null,
          requested_at: new Date().toISOString()
        }
      });
      result.batch_assignment_queue_id = queueRow?.id || null;
    }
    atomicResults.push(result);
  }

  const affectedProtoIds = atomicResults.map(result => result.proto_id).filter(Boolean);
  const summaryIds = [...new Set(atomicResults.flatMap(result => result.summary_ids || []))];
  const detailJobIds = [...new Set(atomicResults.flatMap(result => result.detail_job_ids || []))];
  const mergeJobIds = [...new Set(atomicResults.flatMap(result => result.merge_job_ids || []))];
  const assignmentQueueIds = [...new Set(atomicResults.map(result => result.batch_assignment_queue_id).filter(Boolean))];
  const relationshipCount = atomicResults.reduce((sum, result) => sum + Number(result.relationship_count || 0), 0);

  return {
    news_id: finalNewsId,
    proto_event_count: resolvedProtoEvents.length,
    affected_events: [],
    affected_proto_events: affectedProtoIds,
    relationship_count: relationshipCount,
    summary_ids: summaryIds,
    detail_job_ids: detailJobIds,
    merge_job_ids: mergeJobIds,
    detail_status: detailJobIds.length > 0 || mergeJobIds.length > 0 || assignmentQueueIds.length > 0 ? 'pending' : 'completed',
    batch_assignment_status: assignmentQueueIds.length > 0 ? 'pending' : 'completed',
    batch_assignment_queue_ids: assignmentQueueIds,
    status: 'success'
  };
}

/**
 * 对原子事实数组进行去重
 * 基于 actor、action、object 的组合进行去重
 */
function deduplicateProtoEvents(protoEvents) {
  if (!protoEvents || protoEvents.length <= 1) {
    return protoEvents;
  }

  const seen = new Map();
  const result = [];

  for (const proto of protoEvents) {
    const key = `${String(proto.actor || 'null').toLowerCase()}__${String(proto.action || 'null').toLowerCase()}__${String(proto.object || 'null').toLowerCase()}`;

    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(proto);
    } else {
      console.log(`[Ingestion] Dedup: 移除重复原子事实 "${proto.actor} ${proto.action} ${proto.object}"`);
    }
  }

  return result;
}
