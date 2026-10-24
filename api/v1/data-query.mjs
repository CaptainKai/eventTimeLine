import express from 'express';
import { QueryService } from '../../lib/query/query-service.mjs';
import { AgentToolExecutor } from '../../lib/agent/tool-executor.mjs';
import { TOOL_DEFINITIONS } from '../../lib/agent/tool-definitions.mjs';
import { getAuthorityStatus } from '../../lib/data/authority.mjs';

const router = express.Router(); const queryService = new QueryService(); const tools = new AgentToolExecutor({ queryService });

router.get('/query/news', async (req, res, next) => { try { res.json(await queryService.searchNews(req.query)); } catch (error) { next(error); } });
router.get('/query/news/:id/lineage', async (req, res, next) => { try { res.json(await queryService.getLineage(Number(req.params.id))); } catch (error) { next(error); } });
router.get('/query/topics', async (req, res, next) => { try { res.json(await queryService.listTopics(Number(req.query.limit || 20))); } catch (error) { next(error); } });
router.get('/query/graph/:id', async (req, res, next) => { try { res.json(await queryService.getGraph(Number(req.params.id))); } catch (error) { next(error); } });
router.get('/agent/tools', (_req, res) => res.json({ data: TOOL_DEFINITIONS }));
router.get('/data-platform/authority', (_req, res) => res.json({ data: getAuthorityStatus(), generated_at: new Date().toISOString() }));
router.post('/agent/tools/:name', async (req, res) => { try { res.json(await tools.execute(req.params.name, req.body || {}, { requestId: req.get('x-request-id') })); } catch (error) { res.status(error.code?.includes('INVALID') || error.code === 'UNKNOWN_TOOL' ? 400 : 500).json({ error: error.code || 'TOOL_FAILED', message: error.message }); } });

export default router;
