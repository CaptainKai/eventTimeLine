import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AtomicRelationshipAnalyzer } from '../../lib/analysis/atomic-relationship-analyzer.mjs';

const analyzer = new AtomicRelationshipAnalyzer();

function proto(overrides = {}) {
  return {
    id: overrides.id || 1,
    actor_entity_id: overrides.actor_entity_id ?? 10,
    object_entity_id: overrides.object_entity_id ?? 20,
    location_id: overrides.location_id ?? 30,
    actor_raw: overrides.actor_raw || 'Government A',
    action_raw: overrides.action_raw || 'announce',
    object_raw: overrides.object_raw || 'policy',
    location_raw: overrides.location_raw || 'Capital',
    event_time: overrides.event_time || '2026-01-01T00:00:00Z',
    news_title: overrides.news_title || null,
    raw_extraction: overrides.raw_extraction || {},
    ...overrides
  };
}

describe('AtomicRelationshipAnalyzer', () => {
  it('detects temporal relationships between related proto events', () => {
    const relationships = analyzer.analyzeProtoRelationship(
      proto({ id: 1, event_time: '2026-01-01T00:00:00Z' }),
      proto({ id: 2, event_time: '2026-01-02T00:00:00Z' })
    );

    assert.ok(relationships.some(item => item.relationship_type === 'temporal'));
  });

  it('detects cause/effect relationships from known action patterns', () => {
    const relationships = analyzer.analyzeProtoRelationship(
      proto({ id: 1, action_raw: 'sanction', event_time: '2026-01-01T00:00:00Z' }),
      proto({ id: 2, action_raw: 'price_increase', event_time: '2026-01-05T00:00:00Z' })
    );

    assert.ok(relationships.some(item => item.relationship_type === 'cause_effect'));
  });

  it('detects trigger relationships from response language', () => {
    const relationships = analyzer.analyzeProtoRelationship(
      proto({ id: 1, action_raw: 'attack', event_time: '2026-01-01T00:00:00Z' }),
      proto({
        id: 2,
        action_raw: 'retaliation',
        event_time: '2026-01-03T00:00:00Z',
        news_title: 'Government A launched retaliation in response to the attack'
      })
    );

    assert.ok(relationships.some(item => item.relationship_type === 'trigger'));
  });

  it('detects evolution relationships for same participants over time', () => {
    const relationships = analyzer.analyzeProtoRelationship(
      proto({ id: 1, action_raw: 'negotiate', event_time: '2026-01-01T00:00:00Z' }),
      proto({ id: 2, action_raw: 'negotiate', event_time: '2026-01-10T00:00:00Z' })
    );

    assert.ok(relationships.some(item => item.relationship_type === 'evolution'));
  });

  it('falls back to related relationships for strong shared context', () => {
    const relationships = analyzer.analyzeProtoRelationship(
      proto({ id: 1, action_raw: 'warn', event_time: '2026-01-01T00:00:00Z' }),
      proto({ id: 2, action_raw: 'announce', event_time: '2026-01-01T12:00:00Z' })
    );

    assert.ok(relationships.length > 0);
    assert.ok(relationships.some(item => ['related', 'temporal'].includes(item.relationship_type)));
  });
});
