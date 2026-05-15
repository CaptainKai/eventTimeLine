import express from 'express';
import config from '../../config.mjs';
import {
  getEvents,
  getEventById,
  searchEvents,
  getEventsCount,
  getActiveEvents,
  getEventsByDateRange,
  getTimelineItems,
  getProtoEventsForCanonicalEvent,
  getEventsWithAggregation,
  getEventsWithAggregationCount,
  getProtoEventsForCanonicalEventGrouped,
  getFilteredProtoEvents,
  getCanonicalEventsGroupedByIds,
} from '../../lib/db/events-queries.mjs';
import {
  getEventAllRelationships,
  getRelationshipGraph,
  getAllRelationships,
  getAllRelationshipsCount,
  bulkCreateEventRelationships,
  deleteEventRelationships,
} from '../../lib/db/event-relationships-queries.mjs';
import { getEventMilestones } from '../../lib/db/event-milestones-queries.mjs';
import { getEventAttributeHistory } from '../../lib/db/event-history-queries.mjs';
import { getNewsForEvent } from '../../lib/db/event-news-queries.mjs';
import { getRawEvents, getRawEventById, searchRawEvents } from '../../lib/db/raw-queries.mjs';
import {
  getEntityByCanonicalName,
  getEntityByRawName,
  searchEntities,
} from '../../lib/db/entity-queries.mjs';
import { query } from '../../lib/db/connection.mjs';
import orchestrator from '../../apis/orchestrator.mjs';
import { extractProtoEventsTraditionally } from '../../apis/parsers/traditional-parser.mjs';
import { extractProtoEventsWithLLM } from '../../apis/parsers/llm-parser.mjs';
import { processProtoEvents } from '../../lib/pipeline/post-processing.mjs';
import { eventRelationshipAnalyzer } from '../../lib/analysis/event-relationship-analyzer.mjs';
import {
  buildEventDisplay,
  buildStoryBuckets,
  groupProtoEventsByCanonical,
} from '../../lib/presenters/dashboard-presenters.mjs';

const router = express.Router();

function parsePositiveLimit(value, fallback) {
  const parsed = parseInt(value || String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function latestTimeValue(group = {}) {
  const value = group.latest_news_at || group.latest_event_at || null;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function rankCanonicalGroups(groups = [], canonicalMap = new Map()) {
  return [...groups].sort((a, b) => {
    const eventA = canonicalMap.get(a.canonical_event_id) || {};
    const eventB = canonicalMap.get(b.canonical_event_id) || {};
    const relationshipA = Array.isArray(eventA.relationships_out) ? eventA.relationships_out.length : 0;
    const relationshipB = Array.isArray(eventB.relationships_out) ? eventB.relationships_out.length : 0;
    const protoDiff = Number(b.proto_event_count || 0) - Number(a.proto_event_count || 0);
    if (protoDiff !== 0) return protoDiff;
    const newsDiff = Number(b.source_news_count || 0) - Number(a.source_news_count || 0);
    if (newsDiff !== 0) return newsDiff;
    const relationshipDiff = relationshipB - relationshipA;
    if (relationshipDiff !== 0) return relationshipDiff;
    return latestTimeValue(b) - latestTimeValue(a);
  });
}

function relationshipComplexityScore(event = {}, relationship = {}) {
  const relationshipCount = Array.isArray(event.relationships_out) ? event.relationships_out.length : 0;
  const hypothesisCount = Array.isArray(event.hypotheses) ? event.hypotheses.length : 0;
  const confidence = Number(relationship.confidence || 0);
  const weight = Number(relationship.weight || 0);
  return (relationshipCount * 3) + hypothesisCount + confidence + weight;
}

async function resolveEntityId(value, entityTypes = []) {
  if (!value) {
    return null;
  }

  const numericId = parseInt(value, 10);
  if (!Number.isNaN(numericId) && `${numericId}` === `${value}`) {
    return numericId;
  }

  for (const entityType of entityTypes) {
    const raw = await getEntityByRawName(value, entityType);
    if (raw) {
      return raw.id;
    }

    const canonical = await getEntityByCanonicalName(value, entityType);
    if (canonical) {
      return canonical.id;
    }
  }

  const fuzzyMatches = await searchEntities(value);
  return fuzzyMatches[0]?.id || null;
}

async function buildFilters(queryParams) {
  const filters = {};

  if (queryParams.type) filters.event_type = queryParams.type;
  if (queryParams.status) filters.status = queryParams.status;
  if (queryParams.isOngoing === 'true') filters.is_ongoing = true;
  if (queryParams.isOngoing === 'false') filters.is_ongoing = false;
  if (queryParams.isFuture === 'true') filters.is_future = true;
  if (queryParams.isFuture === 'false') filters.is_future = false;
  if (queryParams.startDate) filters.start_date = queryParams.startDate;
  if (queryParams.endDate) filters.end_date = queryParams.endDate;

  const actorId = await resolveEntityId(queryParams.actor, ['actor', 'country', 'organization']);
  if (actorId) filters.actor_id = actorId;

  const locationId = await resolveEntityId(queryParams.location, ['location', 'country']);
  if (locationId) filters.location_id = locationId;

  return filters;
}

/**
 * 更新事件图（增量方式�? */
router.post('/:id/update-graph', async (req, res) => {
  try {
    const numericId = parseInt(req.params.id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    console.log(`[API] Updating graph for event: ${numericId}`);

    const relationships = await eventRelationshipAnalyzer.updateGraphForNewEvent(numericId);

    // 保存关系到数据库
    await bulkCreateEventRelationships(relationships);

    res.json({
      event_id: numericId,
      success: true,
      relationships_added: relationships.length,
      relationships: relationships
    });
  } catch (error) {
    console.error('[API] Update graph error:', error);
    res.status(500).json({ error: 'Failed to update event graph', message: error.message });
  }
});

/**
 * 图再平衡（清理弱边）
 */
router.post('/rebalance-graph', async (req, res) => {
  try {
    console.log('[API] Starting graph rebalance');

    const deletedCount = await eventRelationshipAnalyzer.rebalanceGraph();

    res.json({
      success: true,
      weak_edges_deleted: deletedCount
    });
  } catch (error) {
    console.error('[API] Graph rebalance error:', error);
    res.status(500).json({ error: 'Failed to rebalance graph', message: error.message });
  }
});

/**
 * 增强的全局关系图数据API
 */
router.get('/graph', async (req, res) => {
  try {
    const filters = await buildFilters(req.query);
    const events = await getEvents(1, 100, filters);
    const eventIds = events.map(event => event.id);

    console.log(`[API /graph] �?${eventIds.length} 个事件获取关系图`);

    const graph = await getRelationshipGraph(eventIds);

    if (graph.nodes && graph.nodes.length > 0) {
      console.log('[API /graph] Sample nodes', JSON.stringify(graph.nodes.slice(0, 3), null, 2));
    } else {
      console.log('[API /graph] No graph nodes found');
    }

    graph.nodes = graph.nodes.map(node => {
      const display = buildEventDisplay({
        ...node,
        title: node.title || node.name,
        total_news_count: node.total_news_count,
      });
      return {
        ...node,
        name: display.display_title,
        display_title: display.display_title,
        display_summary: display.display_summary,
        display_subtitle: display.display_subtitle,
      };
    });

    // 统计信息
    const stats = {
      nodes: graph.nodes.length,
      links: graph.links.length,
      types: {}
    };

    // 统计各关系类型的数量
    graph.links.forEach(link => {
      stats.types[link.type] = (stats.types[link.type] || 0) + 1;
    });

    // 计算平均权重和置信度
    if (graph.links.length > 0) {
      const totalWeight = graph.links.reduce((sum, link) => sum + (link.weight || 0), 0);
      const totalConfidence = graph.links.reduce((sum, link) => sum + (link.confidence || 0), 0);
      stats.average_weight = totalWeight / graph.links.length;
      stats.average_confidence = totalConfidence / graph.links.length;
    }

    res.json({
      data: graph,
      count: {
        nodes: graph.nodes.length,
        links: graph.links.length,
      },
      stats: stats,
    });
  } catch (error) {
    console.error('[API] Graph error:', error);
    res.status(500).json({ error: 'Failed to fetch event graph', message: error.message });
  }
});

/**
 * 获取标准事件聚合来源列表（分页）
 */
router.get('/aggregation', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const events = (await getEventsWithAggregation(parseInt(page), parseInt(limit))).map(event =>
      buildEventDisplay(event, {
        source_news_count: event.source_news_count,
        proto_event_count: event.proto_event_count,
      })
    );
    const total = await getEventsWithAggregationCount();

    res.json({
      data: events,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
      },
    });
  } catch (error) {
    console.error('[API] Event aggregation error:', error);
    res.status(500).json({ error: 'Failed to fetch event aggregation' });
  }
});

/**
 * 获取标准事件的原子事件（按新闻分组）
 */
router.get('/:id/aggregation', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    const protoEvents = await getProtoEventsForCanonicalEventGrouped(numericId);

    // �?news_id 分组
    const grouped = {};
    protoEvents.forEach(pe => {
      const newsId = pe.news_id || 'unknown';
      if (!grouped[newsId]) {
        grouped[newsId] = {
          news_id: newsId,
          news_title: pe.news_title || '未知',
          news_source: pe.news_source || '未知',
          news_published_at: pe.news_published_at,
          proto_events: [],
        };
      }
      grouped[newsId].proto_events.push(pe);
    });

    res.json({
      data: Object.values(grouped).sort((a, b) =>
        new Date(b.news_published_at || 0) - new Date(a.news_published_at || 0)
      ),
      total_proto_events: protoEvents.length,
      total_news: Object.keys(grouped).length,
    });
  } catch (error) {
    console.error('[API] Event aggregation detail error:', error);
    res.status(500).json({ error: 'Failed to fetch event aggregation detail' });
  }
});

/**
 * 获取全量事件关系列表（分页）
 */
router.get('/relationships', async (req, res) => {
  try {
    const { page = 1, limit = 50, type } = req.query;
    const options = {};
    if (type) options.relationship_type = type;

    const relationships = await getAllRelationships(parseInt(page), parseInt(limit), options);
    const total = await getAllRelationshipsCount();

    res.json({
      data: relationships,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
      },
    });
  } catch (error) {
    console.error('[API] Relationships error:', error);
    res.status(500).json({ error: 'Failed to fetch relationships' });
  }
});

/**
 * 模拟聚合（不写入 DB�? * 根据筛选条件过滤原子事件，然后构建 L2-L6 完整链路
 */
router.post('/simulate-aggregation', async (req, res) => {
  try {
    const {
      lang,
      source,
      parserMethod,
      eventType,
      startDate,
      endDate,
      view = 'all',
      limit,
    } = req.body;

    const defaultLimit = view === 'relationships'
      ? config.dashboard.limits.relationshipItems
      : view === 'canonical'
        ? config.dashboard.limits.canonicalEvents
        : 500;
    const resolvedLimit = parsePositiveLimit(limit, defaultLimit);

    console.log('[API] Simulate aggregation with filters:', { lang, source, parserMethod, eventType, startDate, endDate, view, limit: resolvedLimit });

    const filteredProtoEvents = await getFilteredProtoEvents({
      lang,
      source,
      parserMethod,
      eventType,
      startDate,
      endDate,
    });
    const allCanonicalGroups = groupProtoEventsByCanonical(filteredProtoEvents);
    const allCanonicalIds = allCanonicalGroups.map(group => group.canonical_event_id);
    const allCanonicalEvents = await getCanonicalEventsGroupedByIds(allCanonicalIds);
    const allCanonicalMap = new Map(allCanonicalEvents.map(event => [event.id, event]));

    let canonicalGroups = allCanonicalGroups;
    if (view === 'canonical') {
      canonicalGroups = rankCanonicalGroups(allCanonicalGroups, allCanonicalMap).slice(0, resolvedLimit);
    } else if (view === 'relationships') {
      const rankedRelationshipEventIds = allCanonicalEvents
        .filter(event => (event.relationships_out || []).length > 0)
        .sort((a, b) => {
          const relationshipDiff = (b.relationships_out || []).length - (a.relationships_out || []).length;
          if (relationshipDiff !== 0) return relationshipDiff;
          const hypothesisDiff = (b.hypotheses || []).length - (a.hypotheses || []).length;
          if (hypothesisDiff !== 0) return hypothesisDiff;
          return new Date(b.start_time || 0) - new Date(a.start_time || 0);
        })
        .slice(0, resolvedLimit)
        .map(event => event.id);
      const rankedIdSet = new Set(rankedRelationshipEventIds);
      canonicalGroups = allCanonicalGroups.filter(group => rankedIdSet.has(group.canonical_event_id));
    }

    const canonicalIds = canonicalGroups.map(group => group.canonical_event_id);
    const canonicalEvents = canonicalIds.map(id => allCanonicalMap.get(id)).filter(Boolean);
    const canonicalMap = new Map(canonicalEvents.map(event => [event.id, event]));
    const storyBuckets = buildStoryBuckets(canonicalEvents);
    const layer4 = canonicalEvents.flatMap(e =>
      (e.relationships_out || []).map(r => ({
        source_id: e.id,
        source_title: buildEventDisplay({
          id: e.id,
          event_type: e.event_type,
          title: e.title,
          description: e.description,
          actor1_name: e.actor1_name,
          actor2_name: e.actor2_name,
          location_name: e.location_name,
        }).display_title,
        target_id: r.target_id,
        target_title: r.target_title,
        target_actor: r.target_actor,
        description: r.description,
        relationship_type: r.type,
        confidence: r.confidence,
        weight: r.weight,
        source_start_time: e.start_time,
        complexity_score: relationshipComplexityScore(e, r),
      }))
    );
    const limitedLayer4 = view === 'relationships'
      ? layer4
        .sort((a, b) => {
          const complexityDiff = Number(b.complexity_score || 0) - Number(a.complexity_score || 0);
          if (complexityDiff !== 0) return complexityDiff;
          return new Date(b.source_start_time || 0) - new Date(a.source_start_time || 0);
        })
        .slice(0, resolvedLimit)
      : layer4;

    const result = {
      summary: {
        total_proto_events: filteredProtoEvents.length,
        total_canonical_events: allCanonicalIds.length,
        returned_canonical_events: canonicalIds.length,
        total_stories: new Set(allCanonicalEvents.filter(e => e.story_id).map(e => e.story_id)).size,
        returned_stories: new Set(canonicalEvents.filter(e => e.story_id).map(e => e.story_id)).size,
        total_hypotheses: allCanonicalEvents.reduce((sum, e) => sum + (e.hypotheses?.length || 0), 0),
        returned_hypotheses: canonicalEvents.reduce((sum, e) => sum + (e.hypotheses?.length || 0), 0),
        total_relationships: allCanonicalEvents.reduce((sum, e) => sum + (e.relationships_out?.length || 0), 0),
        returned_relationships: limitedLayer4.length,
        view,
        limit: resolvedLimit,
        applied_filters: { lang, source, parserMethod, eventType, startDate, endDate }
      },
      layer2: canonicalGroups.map(group => ({
        canonical_event_id: group.canonical_event_id,
        proto_event_count: group.proto_event_count,
        source_news_count: group.source_news_count,
        latest_news_at: group.latest_news_at,
        latest_news_title: group.latest_news_title,
        proto_events: group.proto_events.map(pe => ({
          id: pe.id,
          news_id: pe.news_id,
          news_title: pe.news_title,
          news_source: pe.news_source,
          news_published_at: pe.news_published_at,
          actor_raw: pe.actor_raw,
          action_raw: pe.action_raw,
          object_raw: pe.object_raw,
          event_time: pe.event_time,
          canonical_event_id: pe.canonical_event_id,
          actor_name: pe.actor_name,
          object_name: pe.object_name,
          location_name: pe.location_name,
          is_llm_parsed: !!pe.llm_parse_id
        }))
      })),
      layer3: canonicalGroups
        .map(group => {
          const event = canonicalMap.get(group.canonical_event_id);
          if (!event) return null;
          return buildEventDisplay({
            id: event.id,
            event_type: event.event_type,
            title: event.title,
            description: event.description,
            start_time: event.start_time,
            actor1_name: event.actor1_name,
            actor2_name: event.actor2_name,
            location_name: event.location_name,
            importance: event.current_importance,
            total_news_count: event.total_news_count,
            story_id: event.story_id,
            story_name: event.story_name,
            story_summary: event.story_summary,
            hypotheses: event.hypotheses,
            relationships_out: event.relationships_out,
          }, {
            source_news_count: group.source_news_count,
            proto_event_count: group.proto_event_count,
            latest_news_at: group.latest_news_at,
            latest_news_title: group.latest_news_title,
          });
        })
        .filter(Boolean),
      layer4: limitedLayer4,
      layer5_6: storyBuckets
    };

    res.json({ data: result });
  } catch (error) {
    console.error('[API] Simulate aggregation error:', error);
    res.status(500).json({ error: 'Failed to simulate aggregation', message: error.message });
  }
});

/**
 * Manual aggregation trigger
 */router.post('/aggregate', async (req, res) => {
  try {
    console.log('[API] Manual aggregation triggered');
    const result = await orchestrator.aggregateEvents();
    res.json(result);
  } catch (error) {
    console.error('[API] Manual aggregation error:', error);
    res.status(500).json({ error: 'Failed to run aggregation', message: error.message });
  }
});

/**
 * 搜索事件
 */
router.get('/search', async (req, res) => {
  try {
    const { q = '', page = 1, limit = 20 } = req.query;
    const events = await searchEvents({
      q,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });

    res.json({
      data: events,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        query: q,
      },
    });
  } catch (error) {
    console.error('[API] Event search error:', error);
    res.status(500).json({ error: 'Failed to search events' });
  }
});

/**
 * 获取活跃事件
 */
router.get('/active', async (req, res) => {
  try {
    const events = await getActiveEvents();
    res.json({ data: events });
  } catch (error) {
    console.error('[API] Active events error:', error);
    res.status(500).json({ error: 'Failed to fetch active events' });
  }
});

/**
 * 获取时间线统计数�? */
router.get('/timeline', async (req, res) => {
  try {
    const { startDate, endDate, granularity = 'day' } = req.query;
    const options = await buildFilters(req.query);
    const events = await getEventsByDateRange(startDate, endDate, granularity, options);

    res.json({
      data: events,
      query: {
        startDate,
        endDate,
        granularity,
        filters: options,
      },
    });
  } catch (error) {
    console.error('[API] Timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch timeline data' });
  }
});

/**
 * 获取时间线中的真实事件项
 */
router.get('/timeline-items', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const options = await buildFilters(req.query);
    const items = (await getTimelineItems(startDate, endDate, options)).map(item => buildEventDisplay(item));

    res.json({
      data: items,
      count: items.length,
    });
  } catch (error) {
    console.error('[API] Timeline items error:', error);
    res.status(500).json({ error: 'Failed to fetch timeline items' });
  }
});

/**
 * 获取全局关系图数�? */

/**
 * 获取原始事件搜索
 */
router.get('/raw/search', async (req, res) => {
  try {
    const { q, source, startDate, endDate, page = 1, limit = 50 } = req.query;
    const searchQuery = {
      q,
      source,
      startDate: startDate || null,
      endDate: endDate || null,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    const events = await searchRawEvents(searchQuery);

    res.json({
      data: events,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: events.length,
      },
    });
  } catch (error) {
    console.error('[API] Raw event search error:', error);
    res.status(500).json({ error: 'Failed to search raw events' });
  }
});

/**
 * 获取单个原始事件
 */
router.get('/raw/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);

    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Raw Event ID format' });
    }

    const event = await getRawEventById(numericId);

    if (!event) {
      return res.status(404).json({ error: 'Raw event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('[API] Raw event detail error:', error);
    res.status(500).json({ error: 'Failed to fetch raw event' });
  }
});

/**
 * 获取原始事件列表
 */
router.get('/raw', async (req, res) => {
  try {
    const { page = 1, limit = 50, sort = 'date_desc' } = req.query;
    const events = await getRawEvents(parseInt(page, 10), parseInt(limit, 10), sort);

    res.json({
      data: events,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: events.length,
      },
    });
  } catch (error) {
    console.error('[API] Raw events list error:', error);
    res.status(500).json({ error: 'Failed to fetch raw events' });
  }
});

/**
 * 获取孤立标准事件（没有任何关系的事件�? */
router.get('/orphan', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const sql = `
      SELECT
        e.*,
        a1.canonical_name as actor1_name,
        a2.canonical_name as actor2_name,
        loc.canonical_name as location_name,
        (e.normalized_data->>'title') as title,
        (e.normalized_data->>'description') as description,
        e.start_time as event_time,
        e.current_importance as importance,
        e.current_tone as tone,
        e.current_sentiment as sentiment,
        e.total_mentions as mentions
      FROM events e
      LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
      LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
      LEFT JOIN entity_mapping loc ON e.location_id = loc.id
      WHERE e.id NOT IN (
        SELECT source_event_id FROM event_relationships
        UNION
        SELECT target_event_id FROM event_relationships
      )
      ORDER BY e.start_time DESC
      LIMIT $1 OFFSET $2;
    `;

    const result = await query(sql, [parseInt(limit), offset]);

    const countSql = `
      SELECT COUNT(*) FROM events e
      WHERE e.id NOT IN (
        SELECT source_event_id FROM event_relationships
        UNION
        SELECT target_event_id FROM event_relationships
      );
    `;
    const countResult = await query(countSql);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
      },
    });
  } catch (error) {
    console.error('[API] Orphan events error:', error);
    res.status(500).json({ error: 'Failed to fetch orphan events' });
  }
});

/**
 * 获取标准事件下的所有原子事件（已去重）
 */
router.get('/:id/proto-events', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);

    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    const protoEvents = await getProtoEventsForCanonicalEvent(numericId);

    res.json({
      data: protoEvents,
      pagination: {
        count: protoEvents.length,
      },
    });
  } catch (error) {
    console.error('[API] Proto events error:', error);
    res.status(500).json({ error: 'Failed to fetch proto events' });
  }
});

/**
 * 获取事件列表（分页）
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const filters = await buildFilters(req.query);

    const events = (await getEvents(parseInt(page, 10), parseInt(limit, 10), filters)).map(event => buildEventDisplay(event));
    const total = await getEventsCount(filters);

    res.json({
      data: events,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
      },
    });
  } catch (error) {
    console.error('[API] Events list error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * 获取事件关系
 */
router.get('/:id/relationships', async (req, res) => {
  try {
    const numericId = parseInt(req.params.id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    const relationships = await getEventAllRelationships(numericId, {
      relationshipType: req.query.relationshipType,
    });

    res.json({
      event_id: numericId,
      relationships,
    });
  } catch (error) {
    console.error('[API] Event relationships error:', error);
    res.status(500).json({ error: 'Failed to fetch event relationships' });
  }
});

/**
 * 获取事件时间�? */
router.get('/:id/timeline', async (req, res) => {
  try {
    const numericId = parseInt(req.params.id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    const milestones = await getEventMilestones(numericId);
    res.json({
      event_id: numericId,
      timeline: milestones,
    });
  } catch (error) {
    console.error('[API] Event timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch event timeline' });
  }
});

/**
 * 获取事件属性历�? */
router.get('/:id/history', async (req, res) => {
  try {
    const numericId = parseInt(req.params.id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    const history = await getEventAttributeHistory(numericId, {
      aggregationWindow: req.query.window || 'day',
    });

    res.json({
      event_id: numericId,
      aggregation_window: req.query.window || 'day',
      data: history,
    });
  } catch (error) {
    console.error('[API] Event history error:', error);
    res.status(500).json({ error: 'Failed to fetch event history' });
  }
});

/**
 * 获取事件关联新闻
 */
router.get('/:id/news', async (req, res) => {
  try {
    const numericId = parseInt(req.params.id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 20, 10);
    const news = await getNewsForEvent(numericId, page, limit);

    res.json({
      event_id: numericId,
      data: news,
      pagination: {
        page,
        limit,
      },
    });
  } catch (error) {
    console.error('[API] Event news error:', error);
    res.status(500).json({ error: 'Failed to fetch event news' });
  }
});

/**
 * 获取单个事件详情
 */
router.get('/:id', async (req, res) => {
  try {
    const numericId = parseInt(req.params.id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    const event = await getEventById(numericId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const response = { data: event };
    if (req.query.includeRelationships === 'true') {
      response.relationships = await getEventAllRelationships(numericId);
    }

    res.json(response);
  } catch (error) {
    console.error('[API] Event detail error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

/**
 * 重新解析事件并返回详细解析结�? */
router.post('/:id/parse', async (req, res) => {
  try {
    const numericId = parseInt(req.params.id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid Event ID format' });
    }

    const event = await getEventById(numericId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { method = 'traditional' } = req.body;
    const startTime = Date.now();

    let parseResult;
    if (method === 'llm') {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(400).json({
          error: 'LLM parser is not configured',
          message: 'OPENAI_API_KEY is not set. Please check eventTimeLine/.env loading.'
        });
      }
      parseResult = await extractProtoEventsWithLLM(event.title || '', event.description || '');
    } else {
      parseResult = await extractProtoEventsTraditionally(event.title || '', event.description || '');
    }
    parseResult = await processProtoEvents(parseResult, { source: 'events-api', method });

    const duration = Date.now() - startTime;

    res.json({
      data: {
        event_id: numericId,
        original_event: event,
        parse_result: parseResult,
        parse_method: method,
        parse_duration_ms: duration
      }
    });
  } catch (error) {
    console.error('[API] Event parse error:', error);
    res.status(500).json({ error: 'Failed to parse event', message: error.message });
  }
});

export default router;
