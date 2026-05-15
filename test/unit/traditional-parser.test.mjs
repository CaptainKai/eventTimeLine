import assert from 'node:assert';
import { describe, it } from 'node:test';
import { extractEventTraditionally } from '../../apis/parsers/traditional-parser.mjs';

describe('Traditional Parser', () => {
  it('should preserve evidence snippets, trigger keywords and time expressions', async () => {
    const result = await extractEventTraditionally(
      'Government announces retaliatory tariffs after emergency meeting',
      'Officials said on April 17, 2026 that retaliatory tariffs will begin next week after an overnight emergency meeting with trade advisers.'
    );

    assert.strictEqual(result.event_code, '171');
    assert.ok(result.trigger_keywords.includes('tariff'));
    assert.ok(result.trigger_keywords.includes('meeting'));
    assert.ok(result.time_expressions.includes('april 17, 2026'));
    assert.ok(result.time_expressions.includes('next week'));
    assert.ok(result.time_expressions.includes('overnight'));
    assert.ok(result.evidence_snippets.length > 0);
    assert.ok(result.extracted_evidence.primary_sentence);
    assert.strictEqual(result.is_future, true);
    assert.ok(result.confidence > 0.5);
  });

  it('should extract causal suggestion from response language', async () => {
    const result = await extractEventTraditionally(
      'Border closures announced after missile attack',
      'Ministers announced temporary border closures after a missile attack late Tuesday, saying the move was in response to the escalation.'
    );

    assert.ok(result.causal_suggestion);
    assert.match(result.causal_suggestion.toLowerCase(), /after a missile attack|in response to/);
    assert.ok(result.evidence_snippets.some(snippet => snippet.toLowerCase().includes('border closures')));
  });
});
