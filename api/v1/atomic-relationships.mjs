import express from 'express';
import { getAtomicRelationshipsPage } from '../../lib/db/atomic-relationship-queries.mjs';
import {
  getRelationshipSummariesPage,
  getRelationshipSummaryGraph
} from '../../lib/db/relationship-summary-queries.mjs';

const router = express.Router();

function parsePage(value) {
  const parsed = parseInt(value || '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value, fallback = 50, max = 500) {
  const parsed = parseInt(value || `${fallback}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

router.get('/atomic-relationships', async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const result = await getAtomicRelationshipsPage({
      page,
      limit,
      relationshipType: req.query.relationshipType || req.query.type || null,
      protoEventId: req.query.protoEventId || null,
      summaryId: req.query.summaryId || null
    });

    res.json({
      data: result.items,
      pagination: {
        page,
        limit,
        total: result.total
      }
    });
  } catch (error) {
    console.error('[API] Atomic relationships error:', error);
    res.status(500).json({ error: 'Failed to fetch atomic relationships', message: error.message });
  }
});

router.get('/relationship-summaries', async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const result = await getRelationshipSummariesPage({
      page,
      limit,
      relationshipType: req.query.relationshipType || req.query.type || null,
      q: req.query.q || null
    });

    res.json({
      data: result.items,
      pagination: {
        page,
        limit,
        total: result.total
      }
    });
  } catch (error) {
    console.error('[API] Relationship summaries error:', error);
    res.status(500).json({ error: 'Failed to fetch relationship summaries', message: error.message });
  }
});

router.get('/relationship-summaries/:id/graph', async (req, res) => {
  try {
    const summaryId = parseInt(req.params.id, 10);
    if (!Number.isFinite(summaryId) || summaryId <= 0) {
      return res.status(400).json({ error: 'Invalid relationship summary id' });
    }

    const graph = await getRelationshipSummaryGraph(summaryId);
    if (!graph) {
      return res.status(404).json({ error: 'Relationship summary not found' });
    }

    res.json({
      data: graph,
      count: {
        nodes: graph.nodes.length,
        edges: graph.edges.length
      }
    });
  } catch (error) {
    console.error('[API] Relationship summary graph error:', error);
    res.status(500).json({ error: 'Failed to fetch relationship summary graph', message: error.message });
  }
});

export default router;
