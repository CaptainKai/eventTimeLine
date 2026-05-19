import express from 'express';
import config from '../../config.mjs';
import {
  getDashboardCanonicalCardsByIds,
  getDashboardActiveStories,
  getDashboardHotEvents,
  getDashboardNewsParsePage,
  getDashboardParserBreakdown,
  getDashboardPendingHypotheses,
  getDashboardCanonicalEventsPage,
  getDashboardStoriesPage,
  getDashboardPendingHypothesesPage,
  getDashboardRelationshipClusters,
  getDashboardRelationshipNeighbors,
  getDashboardRelationshipsPage,
  getDashboardRelationshipSubgraph,
  getDashboardRelationshipBreakdown,
  getDashboardSummary,
} from '../../lib/db/events-queries.mjs';
import {
  getPendingNormalizationSummary,
  listNormalizationAuditLogs,
  listPendingNormalizations,
} from '../../lib/db/pending-normalization-queries.mjs';
import {
  getGlobalRelationshipSummaryGraph,
  getRelationshipSummaryGraph as getRelationshipSummaryInternalGraph
} from '../../lib/db/relationship-summary-queries.mjs';
import {
  buildNormalizationAuditLogDisplay,
  buildEventDisplay,
  buildHypothesisDisplay,
  buildNewsParseItem,
  buildPendingNormalizationDisplay,
  buildStoryDisplay,
  humanizeEventType,
  humanizeRelationshipType,
} from '../../lib/presenters/dashboard-presenters.mjs';

const router = express.Router();

function parseFilters(query = {}) {
  return {
    lang: query.lang || '',
    source: query.source || '',
    parserMethod: query.parserMethod || '',
    eventType: query.eventType || '',
    startDate: query.startDate || '',
    endDate: query.endDate || '',
  };
}

function parsePage(value) {
  const parsed = parseInt(value || '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value, fallback, max) {
  const parsed = parseInt(value || String(fallback), 10);
  const safeValue = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(safeValue, max);
}

function parseOptionalPositiveInt(value) {
  const parsed = parseInt(value || '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function logDashboardApiPerf(routeName, startedAt, payload, extras = {}) {
  let payloadBytes = 0;
  try {
    payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch {
    payloadBytes = 0;
  }

  console.info('[API][Dashboard]', {
    route: routeName,
    duration_ms: Date.now() - startedAt,
    payload_bytes: payloadBytes,
    ...extras,
  });
}

function buildCanonicalMap(canonicalEvents = []) {
  return new Map(canonicalEvents.map(event => [event.id, buildEventDisplay(event)]));
}

async function buildNewsItems(newsGroups = []) {
  const canonicalIds = [
    ...new Set(newsGroups.flatMap(item => item.canonical_ids || []).filter(Boolean)),
  ];
  const canonicalEvents = await getDashboardCanonicalCardsByIds(canonicalIds);
  const canonicalMap = buildCanonicalMap(canonicalEvents);
  return newsGroups.map(group => buildNewsParseItem(group, canonicalMap));
}

router.get('/overview', async (req, res) => {
  const startedAt = Date.now();
  try {
    const filters = parseFilters(req.query);
    const limits = config.dashboard.limits;

    const [
      summary,
      parserBreakdown,
      relationshipRows,
      hotEventsRows,
      activeStoryRows,
      pendingHypothesisRows,
      recentNewsPage,
      watchlistPage,
      pendingNormalizationSummary,
    ] = await Promise.all([
      getDashboardSummary(filters),
      getDashboardParserBreakdown(filters),
      getDashboardRelationshipBreakdown(filters),
      getDashboardHotEvents(filters, limits.hotEvents),
      getDashboardActiveStories(filters, limits.activeStories),
      getDashboardPendingHypotheses(filters, limits.pendingHypotheses),
      getDashboardNewsParsePage({ filters, page: 1, limit: limits.recentNews }),
      getDashboardNewsParsePage({ filters, page: 1, limit: limits.parseWatchlist, watchlistOnly: true }),
      getPendingNormalizationSummary({ status: 'pending' }),
    ]);

    const relationshipBreakdown = relationshipRows.map(item => ({
      key: item.key,
      label: humanizeRelationshipType(item.key),
      count: toNumber(item.count),
    }));
    const hotEvents = hotEventsRows.map(row => buildEventDisplay(row));
    const activeStories = activeStoryRows.map(row => buildStoryDisplay(row, {
      lead_actors: row.lead_actors || [],
      event_types: (row.event_types || []).map(type => humanizeEventType(type)),
      hypothesis_count: row.hypothesis_count,
      pending_hypothesis_count: row.pending_hypothesis_count,
    }));
    const pendingHypotheses = pendingHypothesisRows.map(row => buildHypothesisDisplay(row));
    const [recentNews, parseWatchlist] = await Promise.all([
      buildNewsItems(recentNewsPage.items),
      buildNewsItems(watchlistPage.items),
    ]);

    const payload = {
      data: {
        filters,
        summary: {
          total_news: toNumber(summary.total_news),
          parsed_news: toNumber(summary.parsed_news),
          total_proto_events: toNumber(summary.total_proto_events),
          total_canonical_events: toNumber(summary.total_canonical_events),
          total_relationships: toNumber(summary.total_relationships),
          active_stories: toNumber(summary.active_stories),
          pending_hypotheses: toNumber(summary.pending_hypotheses),
          pending_normalizations: toNumber(pendingNormalizationSummary.total),
          pending_entities: toNumber(pendingNormalizationSummary.entity_count),
          pending_actions: toNumber(pendingNormalizationSummary.action_count),
          parser_breakdown: parserBreakdown,
          relationship_breakdown: relationshipBreakdown,
        },
        hot_events: hotEvents,
        active_stories: activeStories,
        pending_hypotheses: pendingHypotheses,
        recent_news: recentNews,
        parse_watchlist: parseWatchlist,
      },
    };

    logDashboardApiPerf('/overview', startedAt, payload, {
      hot_events: hotEvents.length,
      active_stories: activeStories.length,
      pending_hypotheses: pendingHypotheses.length,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard overview error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

router.get('/pending-normalizations', async (req, res) => {
  const startedAt = Date.now();
  try {
    const limits = config.dashboard.limits;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, limits.pendingNormalizationsDefault, limits.pendingNormalizationsMax);
    const itemKind = req.query.itemKind || null;
    const status = req.query.status || 'pending';
    const offset = (page - 1) * limit;

    const rows = await listPendingNormalizations({
      itemKind,
      status,
      limit,
      offset,
      includeReferenceCounts: true,
    });
    const items = rows.map(row => buildPendingNormalizationDisplay(row));
    const total = rows[0]?.total_count ? toNumber(rows[0].total_count) : items.length;

    const payload = {
      data: items,
      pagination: {
        page,
        limit,
        total,
      },
      meta: {
        itemKind,
        status,
      },
    };
    logDashboardApiPerf('/pending-normalizations', startedAt, payload, {
      returned_items: items.length,
      total,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard pending normalizations error:', error);
    res.status(500).json({ error: 'Failed to fetch pending normalizations' });
  }
});

router.get('/normalization-audit-logs', async (req, res) => {
  const startedAt = Date.now();
  try {
    const limits = config.dashboard.limits;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, limits.pendingNormalizationsDefault, limits.pendingNormalizationsMax);
    const itemKind = req.query.itemKind || null;
    const decision = req.query.decision || null;
    const offset = (page - 1) * limit;

    const rows = await listNormalizationAuditLogs({
      itemKind,
      decision,
      limit,
      offset,
    });
    const items = rows.map(row => buildNormalizationAuditLogDisplay(row));
    const total = rows[0]?.total_count ? toNumber(rows[0].total_count) : items.length;

    const payload = {
      data: items,
      pagination: {
        page,
        limit,
        total,
      },
      meta: {
        itemKind,
        decision,
      },
    };
    logDashboardApiPerf('/normalization-audit-logs', startedAt, payload, {
      returned_items: items.length,
      total,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard normalization audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch normalization audit logs' });
  }
});

router.get('/canonical-events', async (req, res) => {
  const startedAt = Date.now();
  try {
    const filters = parseFilters(req.query);
    const limits = config.dashboard.limits;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, limits.canonicalEvents, limits.canonicalEventsMax || 100);
    const eventId = parseOptionalPositiveInt(req.query.eventId || req.query.event_id);
    const result = await getDashboardCanonicalEventsPage({ filters, page, limit, eventId });
    const items = result.items.map(row => buildEventDisplay(row, {
      source_news_count: row.source_news_count,
      proto_event_count: row.proto_event_count,
      relationship_count: row.relationship_count,
      hypothesis_count: row.hypothesis_count,
      latest_news_at: row.latest_news_at,
      latest_news_title: row.latest_news_title,
    }));

    const payload = {
      data: items,
      pagination: { page, limit, total: result.total },
      meta: {
        filters,
        focus_event_id: result.focusEventId || null,
        focus_in_filter: result.focusInFilter || false,
        focus_included: result.focusIncluded || false,
      },
    };
    logDashboardApiPerf('/canonical-events', startedAt, payload, {
      returned_items: items.length,
      total: result.total,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard canonical events error:', error);
    res.status(500).json({ error: 'Failed to fetch canonical events' });
  }
});

router.get('/stories', async (req, res) => {
  const startedAt = Date.now();
  try {
    const filters = parseFilters(req.query);
    const limits = config.dashboard.limits;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, limits.storiesDefault || 50, limits.storiesMax || 200);
    const withHypothesisOnly = req.query.withHypothesisOnly === 'true';
    const result = await getDashboardStoriesPage({ filters, page, limit, withHypothesisOnly });
    const items = result.items.map(row => buildStoryDisplay(row, {
      lead_actors: row.lead_actors || [],
      event_types: row.event_types || [],
      hypothesis_count: row.hypothesis_count,
      pending_hypothesis_count: row.pending_hypothesis_count,
    }));

    const payload = {
      data: items,
      pagination: { page, limit, total: result.total },
      meta: { filters, withHypothesisOnly },
    };
    logDashboardApiPerf('/stories', startedAt, payload, {
      returned_items: items.length,
      total: result.total,
      with_hypothesis_only: withHypothesisOnly,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard stories error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stories' });
  }
});

router.get('/hypotheses/pending', async (req, res) => {
  const startedAt = Date.now();
  try {
    const filters = parseFilters(req.query);
    const limits = config.dashboard.limits;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, limits.hypothesesDefault || 50, limits.hypothesesMax || 200);
    const status = req.query.status || 'pending';
    const result = await getDashboardPendingHypothesesPage({ filters, page, limit, status });
    const items = result.items.map(row => buildHypothesisDisplay(row, {
      story_title: row.story_title,
    }));

    const payload = {
      data: items,
      pagination: { page, limit, total: result.total },
      meta: { filters, status },
    };
    logDashboardApiPerf('/hypotheses/pending', startedAt, payload, {
      returned_items: items.length,
      total: result.total,
      status,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard pending hypotheses page error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard pending hypotheses page' });
  }
});

router.get('/relationships', async (req, res) => {
  const startedAt = Date.now();
  try {
    const filters = parseFilters(req.query);
    const limits = config.dashboard.limits;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, limits.relationshipItems, limits.relationshipItemsMax || 100);
    const result = await getDashboardRelationshipsPage({
      filters,
      page,
      limit,
      relationshipType: req.query.relationshipType || req.query.type || null,
    });
    const eventIds = [...new Set(result.items.flatMap(item => [item.source_id, item.target_id]).filter(Boolean))];
    const canonicalRows = await getDashboardCanonicalCardsByIds(eventIds);
    const canonicalMap = buildCanonicalMap(canonicalRows);
    const canonicalEvents = [...canonicalMap.values()];

    const payload = {
      data: {
        layer3: canonicalEvents,
        layer4: result.items,
        summary: {
          returned_relationships: result.items.length,
          total_relationships: result.total,
          returned_canonical_events: canonicalEvents.length,
          view: 'relationships',
          limit,
          applied_filters: filters,
        },
      },
      pagination: { page, limit, total: result.total },
      meta: { filters },
    };
    logDashboardApiPerf('/relationships', startedAt, payload, {
      returned_relationships: result.items.length,
      returned_events: canonicalEvents.length,
      total: result.total,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard relationships error:', error);
    res.status(500).json({ error: 'Failed to fetch relationships' });
  }
});

router.get('/relationships/subgraph', async (req, res) => {
  const startedAt = Date.now();
  try {
    const filters = parseFilters(req.query);
    const result = await getDashboardRelationshipSubgraph({
      centerEventId: req.query.center_event_id || req.query.centerEventId,
      mode: req.query.mode || 'event',
      radius: req.query.radius || 1,
      storyFirst: req.query.story_first !== 'false',
      limitNodes: req.query.limit_nodes || req.query.limitNodes || 80,
      limitEdges: req.query.limit_edges || req.query.limitEdges || 120,
      cursor: req.query.cursor || 0,
      relationshipType: req.query.relationshipType || req.query.type || null,
      filters,
    });
    const payload = { data: result, meta: { filters } };
    logDashboardApiPerf('/relationships/subgraph', startedAt, payload, {
      returned_nodes: Array.isArray(result.nodes) ? result.nodes.length : 0,
      returned_edges: Array.isArray(result.edges) ? result.edges.length : 0,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard relationship subgraph error:', error);
    res.status(500).json({ error: 'Failed to fetch relationship subgraph' });
  }
});

router.get('/relationships/neighbors', async (req, res) => {
  const startedAt = Date.now();
  try {
    const filters = parseFilters(req.query);
    const result = await getDashboardRelationshipNeighbors({
      centerEventId: req.query.center_event_id || req.query.centerEventId,
      mode: req.query.mode || 'event',
      radius: req.query.radius || 1,
      storyFirst: req.query.story_first !== 'false',
      limitNodes: req.query.limit_nodes || req.query.limitNodes || 80,
      limitEdges: req.query.limit_edges || req.query.limitEdges || 120,
      cursor: req.query.cursor || 0,
      relationshipType: req.query.relationshipType || req.query.type || null,
      filters,
    });
    const payload = { data: result, meta: { filters } };
    logDashboardApiPerf('/relationships/neighbors', startedAt, payload, {
      returned_nodes: Array.isArray(result.nodes) ? result.nodes.length : 0,
      returned_edges: Array.isArray(result.edges) ? result.edges.length : 0,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard relationship neighbors error:', error);
    res.status(500).json({ error: 'Failed to fetch relationship neighbors' });
  }
});

router.get('/relationships/clusters', async (req, res) => {
  const startedAt = Date.now();
  try {
    const filters = parseFilters(req.query);
    const result = await getDashboardRelationshipClusters({
      mode: req.query.mode || 'cluster',
      limitNodes: req.query.limit_nodes || req.query.limitNodes || 60,
      limitEdges: req.query.limit_edges || req.query.limitEdges || 120,
      filters,
    });
    const payload = { data: result, meta: { filters } };
    logDashboardApiPerf('/relationships/clusters', startedAt, payload, {
      returned_nodes: Array.isArray(result.nodes) ? result.nodes.length : 0,
      returned_edges: Array.isArray(result.edges) ? result.edges.length : 0,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard relationship clusters error:', error);
    res.status(500).json({ error: 'Failed to fetch relationship clusters' });
  }
});

router.get('/news-parse', async (req, res) => {
  const startedAt = Date.now();
  try {
    const filters = parseFilters(req.query);
    const limits = config.dashboard.limits;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit, limits.newsParseDefault, limits.newsParseMax);
    const multiProtoOnly = req.query.multiProtoOnly === 'true';
    const unmappedOnly = req.query.unmappedOnly === 'true';
    const llmOnly = req.query.llmOnly === 'true';

    const result = await getDashboardNewsParsePage({
      filters,
      page,
      limit,
      multiProtoOnly,
      unmappedOnly,
      llmOnly,
    });
    const items = await buildNewsItems(result.items);

    const payload = {
      data: items,
      pagination: {
        page,
        limit,
        total: result.total,
      },
      meta: {
        filters,
        multiProtoOnly,
        unmappedOnly,
        llmOnly,
      },
    };
    logDashboardApiPerf('/news-parse', startedAt, payload, {
      returned_items: items.length,
      total: result.total,
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Dashboard news parse error:', error);
  }
});

// 全局关系图谱内存缓存，缓存失效时间 5 分钟
const GLOBAL_GRAPH_CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

function clearExpiredGlobalGraphCache() {
  const now = Date.now();
  for (const [key, item] of GLOBAL_GRAPH_CACHE.entries()) {
    if (now - item.cachedAt > CACHE_TTL) {
      GLOBAL_GRAPH_CACHE.delete(key);
    }
  }
}

router.get('/graph/summaries/global', async (req, res) => {
  const startedAt = Date.now();
  try {
    const minMemberCount = parseInt(req.query.minMemberCount || '0', 10);
    const limit = parseInt(req.query.limit || '100', 10);
    
    // 自动清理过期缓存
    clearExpiredGlobalGraphCache();
    
    const cacheKey = `${minMemberCount}_${limit}`;
    const cachedItem = GLOBAL_GRAPH_CACHE.get(cacheKey);
    const now = Date.now();
    
    if (cachedItem && (now - cachedItem.cachedAt < CACHE_TTL)) {
      console.info(`[API][Dashboard][Cache Hit] /graph/summaries/global key=${cacheKey} age=${Math.floor((now - cachedItem.cachedAt) / 1000)}s`);
      const payload = cachedItem.payload;
      logDashboardApiPerf('/graph/summaries/global (Cache Hit)', startedAt, payload, {
        nodes: payload.data.nodes.length,
        links: payload.data.links.length,
        cache: 'hit'
      });
      return res.json(payload);
    }
    
    console.info(`[API][Dashboard][Cache Miss] /graph/summaries/global key=${cacheKey} starting cold query...`);
    const result = await getGlobalRelationshipSummaryGraph({ minMemberCount, limit });
    const payload = { data: result };
    
    // 写入缓存
    GLOBAL_GRAPH_CACHE.set(cacheKey, {
      cachedAt: now,
      payload: payload
    });
    
    logDashboardApiPerf('/graph/summaries/global (Cache Miss)', startedAt, payload, {
      nodes: result.nodes.length,
      links: result.links.length,
      cache: 'miss'
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Global summary graph error:', error);
    res.status(500).json({ error: 'Failed to fetch global summary graph' });
  }
});

router.get('/graph/summaries/:id/detail', async (req, res) => {
  const startedAt = Date.now();
  try {
    const summaryId = parseInt(req.params.id, 10);
    const result = await getRelationshipSummaryInternalGraph(summaryId);
    if (!result) return res.status(404).json({ error: 'Summary not found' });
    
    const payload = { data: result };
    logDashboardApiPerf('/graph/summaries/detail', startedAt, payload, {
      summary_id: summaryId,
      nodes: result.nodes.length,
      edges: result.edges.length
    });
    res.json(payload);
  } catch (error) {
    console.error('[API] Summary internal graph error:', error);
    res.status(500).json({ error: 'Failed to fetch summary internal graph' });
  }
});

export default router;
