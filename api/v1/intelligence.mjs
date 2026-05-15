import express from 'express';
import { 
  getStories, getStoryById, getStoryEvents, getStoryHypotheses, getPendingHypotheses 
} from '../../lib/db/intelligence-queries.mjs';
import { getNewsById, getNewsProtoEvents } from '../../lib/db/news-queries.mjs';
import { getCanonicalEventsGroupedByIds } from '../../lib/db/events-queries.mjs';
import { buildEventDisplay, buildHypothesisDisplay, buildStoryDisplay } from '../../lib/presenters/dashboard-presenters.mjs';

const router = express.Router();

/**
 * 获取故事列表 (L5)
 */
router.get('/stories', async (req, res) => {
  try {
    const stories = await getStories();
    res.json({
      data: stories.map(story => buildStoryDisplay(story, {
        lead_actors: story.lead_actors,
        event_types: story.event_types,
        hypothesis_count: story.hypothesis_count,
        pending_hypothesis_count: story.pending_hypothesis_count,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取单个故事详情及下属事件/假设
 */
router.get('/stories/:id', async (req, res) => {
  try {
    const storyId = parseInt(req.params.id);
    const story = await getStoryById(storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });

    const events = (await getStoryEvents(storyId)).map(event => buildEventDisplay(event));
    const hypotheses = (await getStoryHypotheses(storyId)).map(hypothesis => buildHypothesisDisplay(hypothesis, {
      story_title: story.title,
    }));
    const storyWithDisplay = buildStoryDisplay({
      ...story,
      hypotheses,
    }, {
      events,
      hypothesis_count: hypotheses.length,
      pending_hypothesis_count: hypotheses.filter(item => item.status === 'pending').length,
    });

    res.json({
      data: {
        ...storyWithDisplay,
        events,
        hypotheses
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取新闻血统 (L1 -> L2 -> L3)
 */
router.get('/news/:id/lineage', async (req, res) => {
  try {
    const newsId = parseInt(req.params.id);
    const news = await getNewsById(newsId);
    if (!news) return res.status(404).json({ error: 'News not found' });

    const protoEvents = await getNewsProtoEvents(newsId);
    const canonicalIds = [...new Set(protoEvents.map(pe => pe.canonical_event_id).filter(Boolean))];
    const canonicalEvents = await getCanonicalEventsGroupedByIds(canonicalIds);
    const canonicalSummaries = canonicalEvents.map(event => buildEventDisplay(event, {
      relationship_count: Array.isArray(event.relationships_out) ? event.relationships_out.length : 0,
      hypothesis_count: Array.isArray(event.hypotheses) ? event.hypotheses.length : 0,
    }));
    
    res.json({
      data: {
        article: news,
        proto_events: protoEvents,
        canonical_event_id: canonicalIds[0] || null,
        canonical_events: canonicalSummaries,
        primary_canonical_event: canonicalSummaries[0] || null,
        story_summaries: canonicalSummaries
          .filter(event => event.story_id)
          .map(event => ({
            story_id: event.story_id,
            display_title: event.story_name,
            display_summary: event.story_summary || event.display_summary,
            hypothesis_count: event.hypothesis_count,
          })),
        lineage_summary: {
          canonical_event_count: canonicalSummaries.length,
          hypothesis_count: canonicalSummaries.reduce((sum, event) => sum + (event.hypothesis_count || 0), 0),
          story_count: new Set(canonicalSummaries.map(event => event.story_id).filter(Boolean)).size,
        },
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取所有待验证预测
 */
router.get('/hypotheses/pending', async (req, res) => {
  try {
    const pending = await getPendingHypotheses();
    res.json({ data: pending.map(item => buildHypothesisDisplay(item, { story_title: item.story_title })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
