import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadContractSchema, validateSchema } from '../../lib/contracts/schema-validator.mjs';
import { createNewsStableId } from '../../lib/data/stable-identifiers.mjs';

describe('data contract validator', () => {
  const eventId = createNewsStableId({ source: 'test', sourceUrl: 'https://example.com/1' });
  const validNews = {
    schema_version: '1.0.0', event_id: eventId,
    event_time: '2026-10-23T00:00:00.000Z', ingested_at: '2026-10-23T00:00:01.000Z',
    pipeline_run_id: 'run-12345678', source: 'test', source_url: 'https://example.com/1',
    title: 'Example', content: null, lang: 'en', raw_payload: null, metadata: {}
  };

  it('accepts a valid NewsRaw message', () => {
    assert.deepEqual(validateSchema(validNews, loadContractSchema('news-raw')), { valid: true, errors: [] });
  });

  it('rejects missing required fields, bad confidence and unknown fields', () => {
    const newsResult = validateSchema({ ...validNews, title: undefined, unknown: true }, loadContractSchema('news-raw'));
    assert.equal(newsResult.valid, false);
    const protoResult = validateSchema({
      ...validNews, news_id: eventId, actor: 'A', action: 'meet', confidence: 2,
      parser_version: 'v1', normalization_version: 'v1'
    }, loadContractSchema('proto-event'));
    assert.equal(protoResult.valid, false);
    assert.ok(protoResult.errors.some(error => error.includes('<= 1')));
  });
});

