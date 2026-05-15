import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { generateEventHash, calculateEventAttributes } from '../../lib/analysis/event-deduplication.mjs';

// Note: findOrCreateEvent is not tested due to mocking complexity

describe('Event Deduplication and Attribute Calculation', () => {
  describe('generateEventHash', () => {
    it('should generate consistent hash for identical event data', () => {
      const eventData = {
        actor1: { id: 1 },
        actor2: { id: 2 },
        event_type: 'Negotiation',
        start_time: '2024-01-15T00:00:00Z',
        location: { id: 3 }
      };

      const hash1 = generateEventHash(eventData);
      const hash2 = generateEventHash(eventData);

      assert.strictEqual(hash1, hash2);
    });

    it('should generate different hashes for different event data', () => {
      const event1 = {
        actor1: { id: 1 },
        actor2: { id: 2 },
        event_type: 'Negotiation',
        start_time: '2024-01-15T00:00:00Z',
        location: { id: 3 }
      };

      const event2 = {
        actor1: { id: 1 },
        actor2: { id: 2 },
        event_type: 'Agreement',
        start_time: '2024-01-15T00:00:00Z',
        location: { id: 3 }
      };

      const hash1 = generateEventHash(event1);
      const hash2 = generateEventHash(event2);

      assert.notStrictEqual(hash1, hash2);
    });

    it('should ignore minor differences in formatting', () => {
      const event1 = {
        actor1: { id: 1 },
        actor2: { id: 2 },
        event_type: 'Trade Negotiation',
        start_time: '2024-01-15T00:00:00Z',
        location: { id: 3 }
      };

      const event2 = {
        actor1: { id: 1 },
        actor2: { id: 2 },
        event_type: 'trade negotiation',
        start_time: '2024-01-15T00:00:00Z',
        location: { id: 3 }
      };

      const hash1 = generateEventHash(event1);
      const hash2 = generateEventHash(event2);

      assert.strictEqual(hash1, hash2);
    });
  });

  describe('calculateEventAttributes', () => {
    it('should calculate attributes correctly for multiple news items', () => {
      const newsItems = [
        {
          sentiment: 0.8,
          tone: 0.7,
          importance: 0.9,
          mentions: 10,
          published_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
          reliability_score: 0.9,
          association_confidence: 1.0
        },
        {
          sentiment: 0.2,
          tone: 0.3,
          importance: 0.5,
          mentions: 5,
          published_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          reliability_score: 0.8,
          association_confidence: 0.9
        },
        {
          sentiment: -0.4,
          tone: -0.3,
          importance: 0.7,
          mentions: 8,
          published_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          reliability_score: 0.95,
          association_confidence: 0.8
        }
      ];

      const result = calculateEventAttributes(newsItems);

      assert.strictEqual(typeof result.sentiment, 'number');
      assert.strictEqual(typeof result.tone, 'number');
      assert.strictEqual(typeof result.importance, 'number');
      assert.strictEqual(typeof result.mentions, 'number');
      assert.strictEqual(typeof result.news_count, 'number');

      // Check sentiment is between min and max values (-0.4 and 0.8)
      assert.ok(result.sentiment > -0.4 && result.sentiment < 0.8);

      // Check mentions sum to 23
      assert.strictEqual(result.mentions, 23);

      // Check news count is 3
      assert.strictEqual(result.news_count, 3);
    });

    it('should handle news items without some attributes', () => {
      const newsItems = [
        {
          published_at: new Date(),
          reliability_score: 0.8,
          association_confidence: 0.9
        },
        {
          sentiment: 0.5,
          published_at: new Date(),
          reliability_score: 0.9,
          association_confidence: 1.0
        }
      ];

      const result = calculateEventAttributes(newsItems);

      assert.strictEqual(typeof result.sentiment, 'number');
      assert.strictEqual(typeof result.tone, 'number');
      assert.strictEqual(typeof result.importance, 'number');
      assert.strictEqual(result.mentions, 0);
    });

    it('should apply time decay correctly', () => {
      const newsItems = [
        {
          sentiment: 0.8,
          tone: 0.7,
          importance: 0.9,
          published_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
          reliability_score: 1.0,
          association_confidence: 1.0
        },
        {
          sentiment: 0.2,
          tone: 0.3,
          importance: 0.5,
          published_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
          reliability_score: 1.0,
          association_confidence: 1.0
        }
      ];

      const result = calculateEventAttributes(newsItems);

      // The result should be closer to the more recent news (0.8 sentiment)
      assert.ok(result.sentiment > 0.5);
    });
  });
});
