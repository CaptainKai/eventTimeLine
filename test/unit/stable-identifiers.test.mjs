import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalJson, createNewsStableId, createProtoEventStableId, createRelationshipStableId, normalizeUrl } from '../../lib/data/stable-identifiers.mjs';

describe('stable identifiers', () => {
  it('canonicalizes object keys recursively while preserving array order', () => {
    assert.equal(canonicalJson({ z: 1, nested: { b: 2, a: 1 }, list: [2, 1] }), '{"list":[2,1],"nested":{"a":1,"b":2},"z":1}');
  });

  it('normalizes URL host, query order, fragments and default ports', () => {
    assert.equal(normalizeUrl('HTTPS://Example.COM:443/a/?z=2&a=1#part'), 'https://example.com/a?a=1&z=2');
  });

  it('generates stable news IDs and prefers native source IDs', () => {
    const first = createNewsStableId({ source: 'RSS', sourceUrl: 'https://example.com/a?b=2&a=1' });
    const second = createNewsStableId({ source: ' rss ', sourceUrl: 'https://EXAMPLE.com/a?a=1&b=2#x' });
    assert.equal(first, second);
    assert.equal(createNewsStableId({ source: 'rss', sourceUrl: 'https://x', sourceEventId: '42' }), createNewsStableId({ source: 'RSS', sourceEventId: '42' }));
  });

  it('generates deterministic proto and relationship IDs', () => {
    const protoA = createProtoEventStableId({ newsId: 'n1', parserVersion: 'p1', eventIndex: 0, payload: { action: 'meet', actor: 'A' } });
    const protoB = createProtoEventStableId({ newsId: 'n1', parserVersion: 'p1', eventIndex: 0, payload: { actor: 'A', action: 'meet' } });
    assert.equal(protoA, protoB);
    assert.equal(protoA.length, 64);
    assert.equal(createRelationshipStableId({ sourceProtoId: protoA, targetProtoId: protoB, relationshipType: 'related', logicVersion: 'v1' }).length, 64);
  });

  it('rejects incomplete identities', () => {
    assert.throws(() => createNewsStableId({ source: 'rss' }), /required/);
    assert.throws(() => createProtoEventStableId({ newsId: 'n', parserVersion: 'p', eventIndex: -1, payload: {} }), /non-negative/);
  });

  it('matches shared cross-language vectors', () => {
    const vectors = JSON.parse(fs.readFileSync('contracts/fixtures/stable-id-vectors.json', 'utf8'));
    for (const vector of vectors) {
      const actual = vector.kind === 'news'
        ? createNewsStableId({ source: vector.input.source, sourceUrl: vector.input.source_url })
        : createProtoEventStableId({ newsId: vector.input.news_id, parserVersion: vector.input.parser_version, eventIndex: vector.input.event_index, payload: vector.input.payload });
      assert.equal(actual, vector.expected, vector.name);
    }
  });
});
