import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNewsRawEvent, createParserRequest } from '../../lib/events/envelopes.mjs';
import { processParserRequest, startParserWorker } from '../../services/parser-worker/worker.mjs';

const context = { schema_version: '1.0.0', pipeline_run_id: 'run-12345678', parser_version: 'parser-v1', prompt_version: 'prompt-v1' };

describe('event bus and parser worker', () => {
  const news = suffix => createNewsRawEvent({ source: 'rss', source_url: `https://example.com/${suffix}`, title: 'A met B', content: 'A met B.', published_at: '2026-10-23T00:00:00Z' }, context);
  it('builds contract-valid news and parser messages', () => { const item = news(1); assert.equal(createParserRequest(item, context).news_id, item.event_id); });
  it('returns deterministic successful parser results', async () => {
    const result = await processParserRequest(createParserRequest(news(2), context), { extract: async () => ({ proto_events: [{ actor: 'A', action: 'meet', object: 'B' }] }) });
    assert.equal(result.status, 'success'); assert.equal(result.proto_events[0].stable_id.length, 64);
  });
  it('turns parser exceptions into failed events', async () => {
    const result = await processParserRequest(createParserRequest(news(3), context), { extract: async () => { throw new Error('boom'); } });
    assert.equal(result.status, 'failed'); assert.equal(result.error.message, 'boom');
  });
  it('connects injectable transports', async () => {
    let handler; const sent = [];
    const consumer = { subscribe: async options => assert.equal(options.topic, 'parser.request.v1'), run: async options => { handler = options.eachMessage; } };
    const producer = { send: async event => sent.push(event) };
    await startParserWorker({ consumer, producer, processRequest: async request => ({ news_id: request.news_id, status: 'success' }) });
    await handler({ message: { value: Buffer.from(JSON.stringify(createParserRequest(news(4), context))) } });
    assert.equal(sent[0].topic, 'parser.result.v1');
  });
});
