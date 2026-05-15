import assert from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { initDB, closeDB } from '../../lib/db/connection.mjs';
import { ingestExtractedNews } from '../../lib/pipeline/event-ingestion.mjs';
import { getEventById } from '../../lib/db/events-queries.mjs';
import { getNewsById } from '../../lib/db/news-queries.mjs';
import { getEventMilestones } from '../../lib/db/event-milestones-queries.mjs';

describe('Event Ingestion Pipeline', () => {
  before(() => {
    initDB();
  });

  after(async () => {
    await closeDB();
  });

  it('should persist evidence metadata and create temporal milestones', async () => {
    const suffix = Date.now();
    const result = await ingestExtractedNews(
      {
        event_type: 'Emergency tariff package',
        event_code: '171',
        actor1_name: 'Trade Ministry',
        actor2_name: 'Neighboring State',
        location: 'Harbor City',
        title: 'Emergency tariff package announced',
        description: 'Officials unveiled an emergency tariff package after overnight talks.',
        event_time: '2026-04-17T08:00:00Z',
        confidence: 0.72,
        trigger_keywords: ['tariff', 'talks'],
        evidence_snippets: ['Officials unveiled an emergency tariff package after overnight talks.'],
        time_expressions: ['overnight', 'next week'],
        extracted_evidence: {
          primary_sentence: 'Officials unveiled an emergency tariff package after overnight talks.',
          trigger_keywords: ['tariff', 'talks'],
          evidence_snippets: ['Officials unveiled an emergency tariff package after overnight talks.'],
          time_expressions: ['overnight', 'next week'],
          entities: ['Trade Ministry', 'Neighboring State', 'Harbor City'],
        },
        temporal_status: 'future',
        is_future: true,
        causal_suggestion: 'The package followed overnight talks with regional partners.',
      },
      {
        source: 'test-ingestion',
        source_url: `https://example.com/test-ingestion/${suffix}`,
        published_at: '2026-04-17T08:00:00Z',
        title: 'Emergency tariff package announced',
        content: 'Officials unveiled an emergency tariff package after overnight talks. Additional inspections will begin next week.',
        lang: 'en',
        reliability_score: 0.9,
        normalized_data: {
          test_run: suffix,
        },
      }
    );

    const event = await getEventById(result.event_id);
    const news = await getNewsById(result.news_id);
    const milestones = await getEventMilestones(result.event_id);

    assert.ok(event);
    assert.ok(news);
    assert.ok(Array.isArray(result.milestone_ids));
    assert.ok(result.milestone_ids.length >= 2);
    assert.deepStrictEqual(event.normalized_data.trigger_keywords.sort(), ['talks', 'tariff'].sort());
    assert.ok(event.normalized_data.evidence_snippets[0].includes('emergency tariff package'));
    assert.ok(event.normalized_data.time_expressions.includes('overnight'));
    assert.ok(event.normalized_data.time_expressions.includes('next week'));
    assert.strictEqual(event.normalized_data.temporal_status, 'future');
    assert.strictEqual(news.normalized_data.temporal_status, 'future');
    assert.ok(news.normalized_data.extracted_evidence.primary_sentence);
    assert.ok(milestones.some(item => item.milestone_type === 'forecast' && item.title.includes('next week')));
  });
});
