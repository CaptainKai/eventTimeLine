import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthority, getAuthorityStatus } from '../../lib/data/authority.mjs';
import { processParserResult, startParserResultIngestor } from '../../services/parser-result-ingestor/ingestor.mjs';
import { processParserRequest } from '../../services/parser-worker/worker.mjs';
import { backfillNewsEmbeddings } from '../../scripts/backfill-embeddings.mjs';
import { backfillNewsStableIds } from '../../scripts/backfill-news-stable-ids.mjs';

describe('authority cutover controls', () => {
  it('guards worker and Iceberg authority until runtime validation', () => {
    assert.deepEqual(resolveAuthority('parser', 'worker', {}).effective_mode, 'shadow');
    assert.deepEqual(resolveAuthority('dwd', 'iceberg', {}).effective_mode, 'iceberg-shadow');
    assert.equal(resolveAuthority('parser', 'worker', { DATA_PLATFORM_RUNTIME_VALIDATED: 'true' }).effective_mode, 'worker');
    assert.equal(getAuthorityStatus({ QUERY_AUTHORITY_MODE: 'ads' }).query.effective_mode, 'ads');
  });

  it('rejects unknown authority modes', () => {
    assert.throws(() => resolveAuthority('query', 'random'), /Unsupported/);
  });

  it('ingests successful parser results by stable news id', async () => {
    const request = {
      schema_version: '1.0.0', event_id: 'a'.repeat(64), event_time: '2026-01-01T00:00:00.000Z', ingested_at: '2026-01-01T00:00:01.000Z',
      pipeline_run_id: 'run-0001', news_id: 'b'.repeat(64), title: 'A meets B', content: 'A met B.', lang: 'en', parser_version: 'p1', prompt_version: 'v1', metadata: { source: 'test' },
    };
    const parsed = await processParserRequest(request, { extract: async () => ({ proto_events: [{ actor: 'A', action: 'meet', object: 'B' }] }) });
    const result = await processParserResult(parsed, {
      findNews: async stableId => ({ id: 7, stable_id: stableId, source: 'test', source_url: 'https://test', title: 'A meets B' }),
      ingest: async extraction => ({ proto_event_count: extraction.proto_events.length }),
    });
    assert.deepEqual(result, { status: 'success', news_id: 7, stable_id: request.news_id, proto_event_count: 1 });
  });

  it('connects parser-result consumers to the result topic', async () => {
    const calls = []; const consumer = { subscribe: async value => calls.push(value), run: async value => calls.push(value) };
    await startParserResultIngestor({ consumer, processResult: async () => null });
    assert.equal(calls[0].topic, 'parser.result.v1');
    assert.equal(typeof calls[1].eachMessage, 'function');
  });

  it('backfills embeddings in resumable batches', async () => {
    const rows = [1, 2, 3].map(id => ({ id, stable_id: `news-${id}`, title: `Title ${id}`, content: 'Body', source: 'test' }));
    const writes = [];
    const result = await backfillNewsEmbeddings({
      batchSize: 2,
      listMissing: async ({ afterId, limit }) => rows.filter(row => row.id > afterId).slice(0, limit),
      embed: async texts => ({ model: 'fake', embeddings: texts.map((_, index) => [index, 1]) }),
      upsert: async record => writes.push(record),
    });
    assert.equal(result.processed, 3);
    assert.equal(result.batches, 2);
    assert.equal(result.failed, 0);
    assert.equal(writes.length, 3);
  });

  it('backfills deterministic news stable ids in batches', async () => {
    const source = [
      { id: 1, source: 'rss', source_url: 'https://example.com/a' },
      { id: 2, source: 'rss', source_url: 'https://example.com/b' },
    ];
    const writes = [];
    const result = await backfillNewsStableIds({
      batchSize: 1,
      readBatch: async afterId => source.filter(row => row.id > afterId).slice(0, 1),
      writeBatch: async records => { writes.push(...records); return { rowCount: records.length }; },
    });
    assert.equal(result.updated, 2);
    assert.equal(result.batches, 2);
    assert.equal(new Set(writes.map(row => row.stable_id)).size, 2);
  });
});
