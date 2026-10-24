import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateToolArguments } from '../../lib/agent/tool-definitions.mjs';
import { AgentToolExecutor } from '../../lib/agent/tool-executor.mjs';
import { buildEmbeddingText } from '../../lib/search/embedding-service.mjs';

describe('trusted agent tools', () => {
  it('enforces allowlists, limits and time ranges', () => {
    assert.equal(validateToolArguments('search_news', { q: 'x', limit: 999 }).limit, 50);
    assert.throws(() => validateToolArguments('search_news', { q: 'x', sql: 'DROP TABLE news' }), /not allowed/);
    assert.throws(() => validateToolArguments('search_news', { q: 'x', startDate: '2026-02-01', endDate: '2026-01-01' }), /before/);
  });

  it('returns evidence metadata and writes successful audits', async () => {
    const audits = [];
    const executor = new AgentToolExecutor({
      queryService: { searchNews: async () => ({ data: [{ id: 1 }], source_ids: ['n1'], data_version: '1.0.0', generated_at: 'now', lineage_id: 'q1' }) },
      audit: async entry => audits.push(entry)
    });
    const result = await executor.execute('search_news', { q: 'economy' }, { requestId: 'req-1' });
    assert.deepEqual(result.source_ids, ['n1']);
    assert.equal(audits[0].status, 'success');
    assert.equal(audits[0].tool_name, 'search_news');
  });

  it('audits rejected requests without executing a query', async () => {
    const audits = [];
    const executor = new AgentToolExecutor({ queryService: {}, audit: async entry => audits.push(entry) });
    await assert.rejects(executor.execute('search_news', { q: 'x', sql: 'select 1' }), /not allowed/);
    assert.equal(audits[0].status, 'rejected');
  });

  it('builds stable semantic text per object type', () => {
    assert.equal(buildEmbeddingText('proto_event', { actor: 'A', action: 'meet', object: 'B' }), 'A | meet | B');
    assert.throws(() => buildEmbeddingText('unknown', {}), /Unsupported/);
  });
});

