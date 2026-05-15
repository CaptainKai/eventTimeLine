import express from 'express';
import { getNews, getNewsById, searchNews, getNewsCount, getNewsStats, getNewsByEventId, getNewsWithProtoEvents, getNewsWithProtoEventsCount, getNewsProtoEvents } from '../../lib/db/news-queries.mjs';
import { extractProtoEventsTraditionally } from '../../apis/parsers/traditional-parser.mjs';
import { parseChineseNews, parseEnglishNews } from '../../apis/parsers/enhanced-parser.mjs';
import { extractProtoEventsWithLLM } from '../../apis/parsers/llm-parser.mjs';
import { processLlmProtoEvents, processProtoEvents } from '../../lib/pipeline/post-processing.mjs';
import { resolveEntitiesForProtoEvents } from '../../lib/pipeline/entity-resolution.mjs';
import { resolveActionsForProtoEvents } from '../../lib/pipeline/action-resolution.mjs';
import { ingestExtractedNews } from '../../lib/pipeline/event-ingestion.mjs';

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
 * 获取新闻列表（分页）
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, source, lang, startDate, endDate } = req.query;

    const filters = {};
    if (source) filters.source = source;
    if (lang) filters.lang = lang;
    if (startDate) filters.start_date = startDate;
    if (endDate) filters.end_date = endDate;

    const news = await getNews(parseInt(page), parseInt(limit), filters);
    const total = await getNewsCount(filters);

    res.json({
      data: news,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
      },
    });
  } catch (error) {
    console.error('[API] News list error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

/**
 * 搜索新闻
 */
router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const news = await searchNews({ q, page: parseInt(page), limit: parseInt(limit) });

    res.json({
      data: news,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        query: q,
      },
    });
  } catch (error) {
    console.error('[API] News search error:', error);
    res.status(500).json({ error: 'Failed to search news' });
  }
});

/**
 * 获取事件的新闻关联
 */
router.get('/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const numericEventId = parseInt(eventId);
    if (isNaN(numericEventId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    const news = await getNewsByEventId(numericEventId, parseInt(page), parseInt(limit));

    res.json({
      event_id: numericEventId,
      data: news,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('[API] Event news error:', error);
    res.status(500).json({ error: 'Failed to fetch event news' });
  }
});

/**
 * 获取新闻统计信息
 */
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const options = {};
    if (startDate) options.start_date = startDate;
    if (endDate) options.end_date = endDate;

    const stats = await getNewsStats(options);

    res.json({
      data: stats,
      query: {
        startDate,
        endDate,
      },
    });
  } catch (error) {
    console.error('[API] News stats error:', error);
    res.status(500).json({ error: 'Failed to fetch news stats' });
  }
});

/**
 * 获取已提取原子事件的新闻列表（分页）
 */
router.get('/with-proto-events', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const news = await getNewsWithProtoEvents(parseInt(page), parseInt(limit));
    const total = await getNewsWithProtoEventsCount();

    res.json({
      data: news,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
      },
    });
  } catch (error) {
    console.error('[API] News with proto events error:', error);
    res.status(500).json({ error: 'Failed to fetch news with proto events' });
  }
});

/**
 * 获取某条新闻的原子事件
 */
router.get('/:id/proto-events', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid News ID format' });
    }

    const protoEvents = await getNewsProtoEvents(numericId);
    res.json({
      data: protoEvents,
      count: protoEvents.length,
    });
  } catch (error) {
    console.error('[API] News proto events error:', error);
    res.status(500).json({ error: 'Failed to fetch proto events for news' });
  }
});

/**
 * 获取单个新闻详情
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      console.warn(`[API] Invalid numeric ID received: ${id}`);
      return res.status(400).json({ error: 'Invalid News ID format' });
    }

    const news = await getNewsById(numericId);

    if (!news) {
      return res.status(404).json({ error: 'News not found' });
    }

    res.json({ data: news });
  } catch (error) {
    console.error('[API] News detail error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

/**
 * 解析新闻并返回解析结果
 */
router.post('/:id/parse', async (req, res) => {
  try {
    const { id } = req.params;
    const { method = 'enhanced', save = false } = req.body;

    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      console.warn(`[API] Invalid numeric ID received: ${id}`);
      return res.status(400).json({ error: 'Invalid News ID format' });
    }

    const news = await getNewsById(numericId);
    if (!news) {
      return res.status(404).json({ error: 'News not found' });
    }

    let parseResult;
    const startTime = Date.now();

    console.log(`[API] Starting news parse (id=${numericId}, method=${method}, save=${save})`);

    if (method === 'llm') {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(400).json({
          error: 'LLM parser is not configured',
          message: 'OPENAI_API_KEY 未设置，无法使用 LLM 解析。请检查服务端启动目录与 eventTimeLine/.env 加载情况。'
        });
      }
      console.log(`[API] Using LLM parser for news ${numericId}`);
      parseResult = await extractProtoEventsWithLLM(news.title || '', news.content || '', { newsId: numericId });
    } else if (method === 'enhanced') {
      console.log(`[API] Using enhanced parser for news ${numericId}`);
      try {
        const isChinese = news.lang && (news.lang.startsWith('zh') || news.lang === 'cn');
        parseResult = isChinese
          ? await parseChineseNews(news.title || '', news.content || '')
          : await parseEnglishNews(news.title || '', news.content || '');
        if (!parseResult?.proto_events?.length) {
          console.log(`[API] Enhanced parser found no proto-events, falling back to traditional parser`);
          parseResult = await extractProtoEventsTraditionally(news.title || '', news.content || '');
        }
      } catch (error) {
        console.log(`[API] Enhanced parser failed, falling back to traditional parser:`, error.message);
        parseResult = await extractProtoEventsTraditionally(news.title || '', news.content || '');
      }
    } else {
      console.log(`[API] Using traditional parser for news ${numericId}`);
      parseResult = await extractProtoEventsTraditionally(news.title || '', news.content || '');
    }
      parseResult = await postProcessParsedResult(parseResult, method, {
        source: 'news-api',
        method,
        title: news.title || '',
        newsId: numericId,
        resolveEntities: save === true
      });

    const duration = Date.now() - startTime;
    console.log(`[API] News parse completed in ${duration}ms, extracted ${parseResult.proto_events?.length || 0} proto events`);

    let ingestionResult = null;
    if (save && parseResult.proto_events && parseResult.proto_events.length > 0) {
      console.log(`[API] Saving parse results to database for news ${numericId}`);
      ingestionResult = await ingestExtractedNews(parseResult, {
        news_id: numericId,
        title: news.title,
        content: news.content,
        source: news.source,
        source_url: news.source_url,
        published_at: news.published_at,
        lang: news.lang,
        importance: news.importance,
        reliability_score: news.reliability_score,
        preResolvedProtoEvents: true
      });

      console.log(`[API] Parse results saved successfully. Atomic relationships=${ingestionResult.relationship_count || 0}`);
    }

    res.json({
      data: {
        news_id: numericId,
        parse_result: parseResult,
        parse_method: method,
        parse_duration_ms: duration,
        saved: save,
        affected_event_count: 0,
        affected_proto_event_count: ingestionResult?.affected_proto_events?.length || 0,
        relationship_count: ingestionResult?.relationship_count || 0,
        summary_ids: ingestionResult?.summary_ids || [],
        detail_job_ids: ingestionResult?.detail_job_ids || [],
        merge_job_ids: ingestionResult?.merge_job_ids || [],
        batch_assignment_status: ingestionResult?.batch_assignment_status || null,
        batch_assignment_queue_ids: ingestionResult?.batch_assignment_queue_ids || [],
        detail_status: ingestionResult?.detail_status || null
      }
    });
  } catch (error) {
    console.error('[API] News parse error:', error);
    res.status(500).json({ error: 'Failed to parse news', message: error.message });
  }
});

/**
 * 测试解析器（不保存到数据库）
 */
router.post('/parse-test', async (req, res) => {
  try {
    const { title, content, method = 'traditional' } = req.body;

    if (!title && !content) {
      return res.status(400).json({ error: 'Either title or content is required' });
    }

    let parseResult;
    const startTime = Date.now();

    if (method === 'llm') {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(400).json({
          error: 'LLM parser is not configured',
          message: 'OPENAI_API_KEY 未设置，无法使用 LLM 解析。请检查服务端启动目录与 eventTimeLine/.env 加载情况。'
        });
      }
      parseResult = await extractProtoEventsWithLLM(title || '', content || '');
    } else if (method === 'enhanced') {
      const { lang } = req.body;
      const isChinese = lang && (lang.startsWith('zh') || lang === 'cn');
      parseResult = isChinese
        ? await parseChineseNews(title || '', content || '')
        : await parseEnglishNews(title || '', content || '');
    } else {
      parseResult = await extractProtoEventsTraditionally(title || '', content || '');
    }
      parseResult = await postProcessParsedResult(parseResult, method, {
        source: 'news-api-parse-test',
        method,
        title: title || '',
        resolveEntities: false
      });

    const duration = Date.now() - startTime;

    res.json({
      data: {
        parse_result: parseResult,
        parse_method: method,
        parse_duration_ms: duration
      }
    });
  } catch (error) {
    console.error('[API] Parse test error:', error);
    res.status(500).json({ error: 'Failed to parse text', message: error.message });
  }
});

export default router;
