import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { fetchGDELTEvents, generateMockGDELTEvents } from '../../apis/sources/gdelt.mjs';
import { parseGDELTRaw, normalizeGDELTEvent, parseGDELTEvent } from '../../apis/parsers/gdelt-parser.mjs';

describe('GDELT Source', () => {
  describe('Mock Data Generation', () => {
    it('should generate mock events', () => {
      const events = generateMockGDELTEvents(10);

      assert.ok(events);
      assert.strictEqual(events.length, 10);
      events.forEach(event => {
        assert.ok(event);
        assert.ok(event.length > 0);
      });
    });

    it('should generate events with realistic properties', () => {
      const events = generateMockGDELTEvents(1);
      const event = events[0];

      assert.ok(event[0]); // ID
      assert.ok(event[37]); // AvgTone should exist
      assert.ok(event[57]); // Source URL should exist
    });
  });

  describe('Event Parsing', () => {
    it('should parse raw GDELT events', () => {
      const rawEvents = generateMockGDELTEvents(1);
      const parsed = parseGDELTRaw(rawEvents[0]);

      assert.ok(parsed);
      assert.ok(parsed.source_event_id);
      assert.ok(parsed.event_time);
      assert.ok(parsed.avg_tone);
      assert.ok(parsed.num_mentions);
    });

    it('should handle missing fields in parsing', () => {
      const badEvent = [];
      const parsed = parseGDELTRaw(badEvent);
      assert.strictEqual(parsed, null);
    });
  });

  describe('Event Normalization', () => {
    it('should normalize parsed events', async () => {
      const rawEvents = generateMockGDELTEvents(1);
      const parsed = parseGDELTRaw(rawEvents[0]);
      const normalized = await normalizeGDELTEvent(parsed);

      assert.ok(normalized);
      assert.ok(normalized.title);
      assert.ok(normalized.event_type);
      assert.ok(typeof normalized.importance === 'number');
      assert.ok(typeof normalized.tone === 'number');
    });

    it('should generate proper titles', async () => {
      const rawEvents = generateMockGDELTEvents(1);
      const parsed = parseGDELTRaw(rawEvents[0]);
      const normalized = await normalizeGDELTEvent(parsed);

      assert.ok(normalized.title);
      assert.strictEqual(typeof normalized.title, 'string');
      assert.ok(normalized.title.length > 0);
    });
  });

  describe('Complete Parsing Pipeline', () => {
    it('should parse and normalize events in one step', async () => {
      const rawEvents = generateMockGDELTEvents(1);
      const result = await parseGDELTEvent(rawEvents[0]);

      assert.ok(result);
      assert.ok(result.raw);
      assert.ok(result.normalized);
      assert.strictEqual(typeof result.raw, 'object');
      assert.strictEqual(typeof result.normalized, 'object');
    });
  });
});
