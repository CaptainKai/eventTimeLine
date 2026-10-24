import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../dashboard/public/scripts/utils/api-test-client.mjs';
import {
  buildWorkbenchUrlState,
  normalizeApiError,
  normalizeQueryEnvelope,
  readWorkbenchUrlState,
} from '../../dashboard/public/scripts/utils/response-adapter.mjs';
import { buildEvidenceViewModel } from '../../dashboard/public/scripts/components/evidence-panel.mjs';
import { createRequestId, resolveWorkbenchTab } from '../../dashboard/public/scripts/data-ai-workbench.js';
import { buildSearchParams } from '../../dashboard/public/scripts/components/semantic-search.mjs';
import { topicStrength } from '../../dashboard/public/scripts/components/topic-trend.mjs';
import { buildGraphLayout } from '../../dashboard/public/scripts/components/lineage-viewer.mjs';
import { buildToolArguments } from '../../dashboard/public/scripts/components/agent-tool-console.mjs';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Data AI frontend foundation', () => {
  it('normalizes query envelope and evidence metadata', () => {
    const payload = {
      data: [{ id: 1 }],
      data_version: '2.0.0',
      generated_at: new Date().toISOString(),
      source_ids: ['news-1'],
      lineage_id: 'query-1',
    };
    const normalized = normalizeQueryEnvelope(payload);
    const evidence = buildEvidenceViewModel(payload);

    assert.equal(normalized.empty, false);
    assert.equal(normalized.meta.dataVersion, '2.0.0');
    assert.deepEqual(normalized.meta.sourceIds, ['news-1']);
    assert.equal(evidence.sourceCount, 1);
    assert.equal(evidence.statusLabel, '证据完整');
  });

  it('supplies safe defaults and identifies fallback results', () => {
    const normalized = normalizeQueryEnvelope({ retrieval_mode: 'keyword_fallback' });
    assert.deepEqual(normalized.data, []);
    assert.equal(normalized.empty, true);
    assert.equal(normalized.meta.degraded, true);
    assert.equal(normalized.meta.dataVersion, 'unknown');
  });

  it('maps API errors to stable UI states', () => {
    assert.equal(normalizeApiError({ code: 'REQUEST_TIMEOUT' }).type, 'timeout');
    assert.equal(normalizeApiError({ code: 'REQUEST_CANCELLED' }).retryable, false);
    assert.equal(normalizeApiError({ status: 400, message: 'bad limit' }).type, 'invalid');
    assert.equal(normalizeApiError({ status: 503 }).type, 'service');
  });

  it('round trips workbench URL state and rejects unknown tabs', () => {
    const query = buildWorkbenchUrlState({ tab: 'lineage', q: '红海 航运', newsId: 42 });
    assert.deepEqual(readWorkbenchUrlState(`?${query}`), { tab: 'lineage', q: '红海 航运', newsId: '42' });
    assert.equal(resolveWorkbenchTab('agent'), 'agent');
    assert.equal(resolveWorkbenchTab('invalid'), 'search');
    assert.equal(createRequestId(100, 0.5), 'workbench-100-7a120');
  });

  it('builds semantic query and Agent Tool requests', async () => {
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = new ApiClient('http://localhost/api/v1');

    await client.searchSemanticNews({ q: 'test', semantic: true, limit: 5 });
    await client.executeAgentTool('search_news', { q: 'test' }, { requestId: 'request-1' });

    assert.equal(requests[0].url, 'http://localhost/api/v1/query/news?q=test&semantic=true&limit=5');
    assert.equal(requests[1].url, 'http://localhost/api/v1/agent/tools/search_news');
    assert.equal(requests[1].options.headers['x-request-id'], 'request-1');
    assert.deepEqual(JSON.parse(requests[1].options.body), { q: 'test' });
  });

  it('distinguishes caller cancellation from timeout', async () => {
    globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const client = new ApiClient('http://localhost/api/v1');
    const controller = new AbortController();
    const request = client.getWithOptions('/query/topics', {}, { signal: controller.signal });
    controller.abort();

    await assert.rejects(request, error => error.code === 'REQUEST_CANCELLED');
  });

  it('builds bounded search parameters without false semantic flags', () => {
    assert.deepEqual(buildSearchParams({ q: '  test  ', mode: 'keyword', limit: 500 }), {
      q: 'test', semantic: undefined, source: undefined, startDate: undefined, endDate: undefined, limit: 50,
    });
    assert.equal(buildSearchParams({ q: 'test', mode: 'semantic' }).semantic, true);
  });

  it('calculates topic strength and deterministic graph positions', () => {
    assert.equal(topicStrength({ member_count: 3, edge_count: 4 }), 11);
    const layout = buildGraphLayout([{ id: 1 }, { id: 2 }], 680, 340);
    assert.equal(layout.length, 2);
    assert.equal(layout[0].x, 340);
    assert.ok(layout.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  });

  it('maps dynamic Agent fields into typed allowlisted arguments', () => {
    const definition = { allowed: ['q', 'limit', 'semantic'], required: ['q'] };
    assert.deepEqual(buildToolArguments(definition, { q: '航运', limit: '5', semantic: true, ignored: 'x' }), {
      q: '航运', limit: 5, semantic: true,
    });
  });
});
