import express from 'express';
import { resetParsedResults } from '../../scripts/reset-parsed-results.mjs';
import { parseChineseNews, parseEnglishNews, extractProtoEventsEnhanced } from '../../apis/parsers/enhanced-parser.mjs';
import { extractProtoEventsWithLLM } from '../../apis/parsers/llm-parser.mjs';
import { processLlmProtoEvents, processProtoEvents } from '../../lib/pipeline/post-processing.mjs';
import { canonicalMerger } from '../../lib/analysis/canonical-merger.mjs';
import { inferenceEngine } from '../../lib/analysis/inference-engine.mjs';
import { calculateEventAttributes } from '../../lib/analysis/event-deduplication.mjs';
import { eventRelationshipAnalyzer } from '../../lib/analysis/event-relationship-analyzer.mjs';
import { getNews, getNewsById } from '../../lib/db/news-queries.mjs';
import { getNewsForEvent } from '../../lib/db/event-news-queries.mjs';
import { updateEventSnapshot } from '../../lib/db/events-queries.mjs';
import { recordAttributeHistory } from '../../lib/db/event-history-queries.mjs';
import { bulkCreateEventRelationships } from '../../lib/db/event-relationships-queries.mjs';
import { query } from '../../lib/db/connection.mjs';
import { resolveEntitiesForProtoEvents } from '../../lib/pipeline/entity-resolution.mjs';
import { resolveActionsForProtoEvents } from '../../lib/pipeline/action-resolution.mjs';
import {
  deleteEntityChains,
  findMeaninglessEntityCandidates,
  runMeaninglessEntityCleanup
} from '../../lib/pipeline/entity-cleanup.mjs';
import {
  listProvisionalNormalizations,
  getNormalizationRebuildJobRecord,
  listNormalizationRebuildJobRecords,
  promotePendingNormalization,
  rejectPendingNormalization,
  reviewSinglePendingNormalization,
  runNormalizationAudit
} from '../../lib/pipeline/normalization-audit.mjs';

const router = express.Router();

async function postProcessParsedResult(parseResult, method, context = {}) {
  const processed = method === 'llm'
    ? await processLlmProtoEvents(parseResult, context)
    : await processProtoEvents(parseResult, context);

  if (!processed?.proto_events?.length || context.resolveEntities === false) {
    return processed;
  }

  const entityResolved = await resolveEntitiesForProtoEvents(processed.proto_events, context);
  const actionResolved = await resolveActionsForProtoEvents(entityResolved, context);

  return {
    ...processed,
    proto_events: actionResolved
  };
}

/**
 * 解析结果重置 API
 * 警告：此接口会删除所有解析结果，但保留原始新闻数据
 */
router.post('/reset-parsed', async (req, res) => {
  try {
    console.log('[API] Starting parsed results reset');

    // 执行重置
    await resetParsedResults(true); // 跳过确认，直接执行

    res.json({
      success: true,
      message: '解析结果重置成功。请调用 /api/v1/admin/reparse-all 重新解析所有新闻。',
      reset_time: new Date().toISOString(),
      instructions: [
        '重置成功后，需要重新解析所有新闻以生成新的事件数据',
        '调用 /api/v1/admin/reparse-all 接口进行批量重新解析',
        '或在前端使用解析功能逐个解析新闻'
      ]
    });

  } catch (error) {
    console.error('[API] Reset failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: '重置失败，请检查服务器日志'
    });
  }
});

/**
 * 批量重新解析所有新闻
 */
router.post('/reparse-all', async (req, res) => {
  try {
    const { page = 1, limit = 50, method = 'enhanced' } = { ...req.body, ...req.query };

    console.log(`[API] Starting batch reparsing - page: ${page}, limit: ${limit}, method: ${method}`);

    const newsItems = await getNews(page, limit);

    if (newsItems.length === 0) {
      return res.json({
        success: true,
        message: '没有更多新闻需要解析',
        completed: true,
        total_parsed: 0
      });
    }

    const results = [];

    for (const news of newsItems) {
      try {
        console.log(`[API] Parsing news ${news.id}: ${news.title.substring(0, 50)}...`);

        let parseResult;
        if (method === 'llm' && process.env.OPENAI_API_KEY) {
          parseResult = await extractProtoEventsWithLLM(news.title || '', news.content || '', { newsId: news.id });
        } else {
          const isChinese = news.lang && (news.lang.startsWith('zh') || news.lang === 'cn');
          parseResult = isChinese
            ? await parseChineseNews(news.title || '', news.content || '')
            : await parseEnglishNews(news.title || '', news.content || '');
        }
        parseResult = await postProcessParsedResult(parseResult, method, {
          source: 'admin-reparse-all',
          method,
          title: news.title || '',
          newsId: news.id
        });

        if (parseResult.proto_events && parseResult.proto_events.length > 0) {
          const mergeResults = [];
          for (const proto of parseResult.proto_events) {
            const res = await canonicalMerger.mergeSingleProtoEvent(proto, news.id);
            mergeResults.push(res);
            await inferenceEngine.verifyHypotheses(proto);
          }

          const affectedEventIds = [...new Set(mergeResults.map(r => r.canonicalEventId))];
          for (const eventId of affectedEventIds) {
            const newsForEvent = await getNewsForEvent(eventId, 1, 500);
            const attributes = calculateEventAttributes(newsForEvent);
            if (attributes) {
              await updateEventSnapshot(eventId, attributes);
              await recordAttributeHistory(eventId, attributes, {
                triggeringNewsId: news.id,
                aggregationWindow: 'hour',
                calculationMethod: 'multi-layered-aggregation'
              });
            }

            const relationships = await eventRelationshipAnalyzer.analyzeNewEventRelationships(eventId);
            if (relationships.length > 0) {
              await bulkCreateEventRelationships(relationships);
            }
          }

          results.push({
            newsId: news.id,
            success: true,
            protoEventCount: parseResult.proto_events.length,
            affectedEventCount: affectedEventIds.length
          });
        } else {
          results.push({
            newsId: news.id,
            success: true,
            protoEventCount: 0,
            message: '未提取到原子事件'
          });
        }

      } catch (error) {
        console.error(`[API] Failed to parse news ${news.id}:`, error.message);
        results.push({
          newsId: news.id,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    const totalProtoEvents = results.reduce((sum, r) => sum + (r.protoEventCount || 0), 0);
    const totalEvents = [...new Set(results.flatMap(r => r.affectedEventIds || []))].length;

    res.json({
      success: true,
      message: `重新解析完成 - 成功: ${successCount}, 失败: ${failCount}`,
      completed: newsItems.length < limit,
      results,
      statistics: {
        successCount,
        failCount,
        totalNewsCount: results.length,
        totalProtoEvents,
        totalEvents
      },
      nextPage: newsItems.length >= limit ? page + 1 : null,
      instructions: page < 20
        ? `继续解析下一页：POST /api/v1/admin/reparse-all?page=${page + 1}&limit=${limit}`
        : '解析已完成'
    });

  } catch (error) {
    console.error('[API] Reparse all failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 重新解析单个新闻
 */
router.post('/reparse/:id', async (req, res) => {
  try {
    const numericId = parseInt(req.params.id);

    if (isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid News ID format' });
    }

    const news = await getNewsById(numericId);
    if (!news) {
      return res.status(404).json({ error: 'News not found' });
    }

    const isChinese = news.lang && (news.lang.startsWith('zh') || news.lang === 'cn');
    let parseResult = isChinese
      ? await parseChineseNews(news.title || '', news.content || '')
      : await parseEnglishNews(news.title || '', news.content || '');
    parseResult = await postProcessParsedResult(parseResult, 'enhanced', {
      source: 'admin-reparse-single',
      method: 'enhanced',
      title: news.title || '',
      newsId: numericId
    });
    const mergeResults = [];

    for (const proto of parseResult.proto_events) {
      const res = await canonicalMerger.mergeSingleProtoEvent(proto, numericId);
      mergeResults.push(res);
      await inferenceEngine.verifyHypotheses(proto);
    }

    res.json({
      success: true,
      newsId: numericId,
      protoEventCount: parseResult.proto_events.length,
      affectedEventIds: [...new Set(mergeResults.map(r => r.canonicalEventId))],
      parseResult
    });

  } catch (error) {
    console.error('[API] Reparse failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 检查解析状态
 */
router.get('/parse-status', async (req, res) => {
  try {
    const { rows: newsStats } = await query(`
      SELECT
        COUNT(*) as total_news,
        COUNT(e.id) as linked_news,
        COALESCE(AVG(pe.extraction_confidence), 0) as avg_confidence
      FROM news n
      LEFT JOIN event_news en ON n.id = en.news_id
      LEFT JOIN events e ON en.event_id = e.id
      LEFT JOIN proto_events pe ON n.id = pe.news_id
    `);

    const { rows: eventsStats } = await query(`
      SELECT
        COUNT(*) as total_events,
        COUNT(ea.event_id) as events_with_attributes,
        COALESCE(AVG(e.current_importance), 0) as avg_importance
      FROM events e
      LEFT JOIN event_attribute_history ea ON e.id = ea.event_id
    `);

    const { rows: protoEventsStats } = await query(`
      SELECT
        COUNT(*) as total_proto_events,
        COUNT(e.id) as linked_proto_events
      FROM proto_events pe
      LEFT JOIN event_news en ON pe.news_id = en.news_id
      LEFT JOIN events e ON en.event_id = e.id
    `);

    res.json({
      success: true,
      statistics: {
        news: {
          total: parseInt(newsStats[0].total_news),
          linked: parseInt(newsStats[0].linked_news),
          unlinked: parseInt(newsStats[0].total_news) - parseInt(newsStats[0].linked_news),
          avgConfidence: parseFloat(newsStats[0].avg_confidence)
        },
        events: {
          total: parseInt(eventsStats[0].total_events),
          withAttributes: parseInt(eventsStats[0].events_with_attributes),
          avgImportance: parseFloat(eventsStats[0].avg_importance)
        },
        protoEvents: {
          total: parseInt(protoEventsStats[0].total_proto_events),
          linked: parseInt(protoEventsStats[0].linked_proto_events),
          unlinked: parseInt(protoEventsStats[0].total_proto_events) - parseInt(protoEventsStats[0].linked_proto_events)
        }
      }
    });

  } catch (error) {
    console.error('[API] Parse status check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 巡检并清理明显无意义实体
 */
router.post('/entities/cleanup', async (req, res) => {
  try {
    const {
      entityIds = null,
      apply = false,
      limit = 20,
      deleteEntityRows = true
    } = req.body || {};

    const explicitEntityIds = Array.isArray(entityIds)
      ? entityIds.map(Number).filter(Number.isInteger)
      : [];

    if (explicitEntityIds.length > 0) {
      if (!apply) {
        const candidates = await findMeaninglessEntityCandidates({ entityIds: explicitEntityIds, limit });
        return res.json({
          success: true,
          mode: 'preview_explicit_entities',
          count: candidates.length,
          candidates
        });
      }

      const result = await deleteEntityChains(explicitEntityIds, { deleteEntityRows });
      return res.json({
        success: true,
        mode: 'explicit_delete',
        apply: true,
        ...result
      });
    }

    if (!apply) {
      const candidates = await findMeaninglessEntityCandidates({ limit });
      return res.json({
        success: true,
        mode: 'preview',
        count: candidates.length,
        candidates
      });
    }

    const result = await runMeaninglessEntityCleanup({ limit, deleteEntityRows });
    res.json({
      success: true,
      mode: 'audit_and_cleanup',
      ...result
    });
  } catch (error) {
    console.error('[API] Entity cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/normalizations/pending', async (req, res) => {
  try {
    const rows = await listProvisionalNormalizations({
      itemKind: req.query.itemKind || req.query.item_kind || null,
      status: req.query.status || 'pending',
      limit: Number(req.query.limit || 50),
      offset: Number(req.query.offset || 0)
    });
    res.json({ success: true, count: rows.length, pending: rows });
  } catch (error) {
    console.error('[API] Pending normalizations failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/normalizations/rebuild-jobs', async (req, res) => {
  try {
    const rows = await listNormalizationRebuildJobRecords({
      status: req.query.status || null,
      limit: Number(req.query.limit || 50),
      offset: Number(req.query.offset || 0)
    });
    res.json({ success: true, count: rows.length, jobs: rows });
  } catch (error) {
    console.error('[API] Normalization rebuild jobs failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/normalizations/rebuild-jobs/:id', async (req, res) => {
  try {
    const job = await getNormalizationRebuildJobRecord(Number(req.params.id));
    if (!job) return res.status(404).json({ success: false, error: 'rebuild job not found' });
    res.json({ success: true, job });
  } catch (error) {
    console.error('[API] Normalization rebuild job failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/normalizations/audit', async (req, res) => {
  try {
    const result = await runNormalizationAudit({
      apply: req.body?.apply === true,
      rebuild: req.body?.rebuild !== false,
      limit: Number(req.body?.limit || 20),
      itemKind: req.body?.itemKind || req.body?.item_kind || null,
      status: req.body?.status || 'pending'
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Normalization audit failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/normalizations/promote', async (req, res) => {
  try {
    const pendingId = Number(req.body?.pendingId || req.body?.pending_id);
    if (!Number.isInteger(pendingId)) {
      return res.status(400).json({ success: false, error: 'pendingId is required' });
    }

    const result = await promotePendingNormalization(pendingId, {
      targetEntityId: req.body?.targetEntityId || req.body?.target_entity_id || null,
      targetActionId: req.body?.targetActionId || req.body?.target_action_id || null,
      canonicalName: req.body?.canonicalName || req.body?.canonical_name || null,
      entityType: req.body?.entityType || req.body?.entity_type || null,
      parentEntity: req.body?.parentEntity || req.body?.parent_entity || null,
      parentEntityId: req.body?.parentEntityId || req.body?.parent_entity_id || null,
      entitySubtype: req.body?.entitySubtype || req.body?.entity_subtype || null,
      hierarchyConfidence: req.body?.hierarchyConfidence || req.body?.hierarchy_confidence || null,
      actionKey: req.body?.actionKey || req.body?.action_key || null,
      actionCategory: req.body?.actionCategory || req.body?.action_category || null,
      confidence: req.body?.confidence || null,
      reason: req.body?.reason || null,
      rebuild: req.body?.rebuild !== false,
      asyncRebuild: req.body?.asyncRebuild !== false
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Normalization promote failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/normalizations/reject', async (req, res) => {
  try {
    const pendingId = Number(req.body?.pendingId || req.body?.pending_id);
    if (!Number.isInteger(pendingId)) {
      return res.status(400).json({ success: false, error: 'pendingId is required' });
    }

    const result = await rejectPendingNormalization(pendingId, {
      reason: req.body?.reason || null,
      confidence: req.body?.confidence || null,
      rebuild: req.body?.rebuild !== false,
      asyncRebuild: req.body?.asyncRebuild !== false
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Normalization reject failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/normalizations/review', async (req, res) => {
  try {
    const pendingId = Number(req.body?.pendingId || req.body?.pending_id);
    if (!Number.isInteger(pendingId)) {
      return res.status(400).json({ success: false, error: 'pendingId is required' });
    }

    const result = await reviewSinglePendingNormalization(pendingId, {
      apply: req.body?.apply === true,
      rebuild: req.body?.rebuild !== false,
      asyncRebuild: req.body?.asyncRebuild !== false,
      contextLimit: Number(req.body?.contextLimit || req.body?.context_limit || 5),
      manual: true
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Normalization review failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
