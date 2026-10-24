import assert from 'node:assert';
import { describe, it } from 'node:test';
import { extractProtoEventsTraditionally } from '../../apis/parsers/traditional-parser.mjs';

describe('Traditional Parser', () => {
  it('should preserve evidence snippets, trigger keywords and temporal metadata', async () => {
    const result = await extractProtoEventsTraditionally(
      'Government announces retaliatory tariffs after emergency meeting',
      'Officials said on April 17, 2026 that retaliatory tariffs will begin next week after an overnight emergency meeting with trade advisers.'
    );

    assert.strictEqual(result.proto_events.length, 1);

    const protoEvent = result.proto_events[0];
    assert.strictEqual(protoEvent.metadata.event_code, '171');
    assert.ok(protoEvent.metadata.trigger_keywords.includes('tariff'));
    assert.ok(protoEvent.metadata.trigger_keywords.includes('meeting'));
    assert.strictEqual(protoEvent.metadata.temporal_status, 'future');
    assert.ok(protoEvent.time);
    assert.ok(protoEvent.metadata.evidence_snippets.length > 0);
    assert.ok(protoEvent.confidence > 0.5);
  });

  it('should extract causal suggestion from response language', async () => {
    const result = await extractProtoEventsTraditionally(
      'Border closures announced after missile attack',
      'Ministers announced temporary border closures after a missile attack late Tuesday, saying the move was in response to the escalation.'
    );

    assert.strictEqual(result.proto_events.length, 1);

    const protoEvent = result.proto_events[0];
    assert.ok(protoEvent.metadata.causal_suggestion);
    assert.match(protoEvent.metadata.causal_suggestion.toLowerCase(), /after a missile attack|in response to/);
    assert.ok(protoEvent.metadata.evidence_snippets.some(snippet => snippet.toLowerCase().includes('border closures')));
  });
});
