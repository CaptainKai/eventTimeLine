import express from 'express';
import {
  getEntityById,
  getEntityByRawName,
  getEntityByCanonicalName,
  getEntitiesByType,
  getEntityTypes,
  searchEntities,
  getOrCreateEntity,
  updateEntity,
  deleteEntityMapping,
} from '../../lib/db/entity-queries.mjs';

const router = express.Router();

/**
 * 获取所有实体类型
 */
router.get('/types', async (req, res) => {
  try {
    const types = await getEntityTypes();
    res.json({
      data: types,
      count: types.length,
    });
  } catch (error) {
    console.error('[API] Entity types error:', error);
    res.status(500).json({ error: 'Failed to fetch entity types' });
  }
});

/**
 * 获取某种类型的实体（分页）
 */
router.get('/type/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { page = 1, limit = 100 } = req.query;

    const entities = await getEntitiesByType(type, parseInt(page), parseInt(limit));

    res.json({
      data: entities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: entities.length, // 实际应从count查询获取
      },
    });
  } catch (error) {
    console.error('[API] Entities by type error:', error);
    res.status(500).json({ error: 'Failed to fetch entities by type' });
  }
});

/**
 * 搜索实体
 */
router.get('/search', async (req, res) => {
  try {
    const { q, type } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const entities = await searchEntities(q, type);

    res.json({
      data: entities,
      count: entities.length,
    });
  } catch (error) {
    console.error('[API] Entity search error:', error);
    res.status(500).json({ error: 'Failed to search entities' });
  }
});

/**
 * 获取单个实体
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const entity = await getEntityById(parseInt(id));

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json(entity);
  } catch (error) {
    console.error('[API] Entity detail error:', error);
    res.status(500).json({ error: 'Failed to fetch entity' });
  }
});

/**
 * 创建或获取实体
 */
router.post('/get-or-create', async (req, res) => {
  try {
    const { rawName, entityType, canonicalName, confidence } = req.body;

    if (!rawName || !entityType) {
      return res.status(400).json({ error: 'rawName and entityType are required' });
    }

    const entity = await getOrCreateEntity(rawName, entityType, canonicalName, confidence);

    res.status(201).json(entity);
  } catch (error) {
    console.error('[API] Get or create entity error:', error);
    res.status(500).json({ error: 'Failed to get or create entity' });
  }
});

/**
 * 更新实体
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const entity = await updateEntity(parseInt(id), updates);

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json(entity);
  } catch (error) {
    console.error('[API] Update entity error:', error);
    res.status(500).json({ error: 'Failed to update entity' });
  }
});

/**
 * 删除实体映射
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const entity = await deleteEntityMapping(parseInt(id));

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json({ message: 'Entity deleted successfully' });
  } catch (error) {
    console.error('[API] Delete entity error:', error);
    res.status(500).json({ error: 'Failed to delete entity' });
  }
});

export default router;
