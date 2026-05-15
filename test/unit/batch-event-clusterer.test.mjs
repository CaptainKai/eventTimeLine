import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BatchEventClusterer,
  buildProtoClusterSignature
} from '../../lib/analysis/batch-event-clusterer.mjs';

function proto(overrides = {}) {
  return {
    id: overrides.id || 1,
    actor_entity_id: overrides.actor_entity_id ?? 10,
    object_entity_id: overrides.object_entity_id ?? 20,
    location_id: overrides.location_id ?? 30,
    action_id: overrides.action_id ?? 40,
    actor_raw: overrides.actor_raw || 'Actor A',
    action_raw: overrides.action_raw || 'sanction',
    object_raw: overrides.object_raw || 'Actor B',
    location_raw: overrides.location_raw || 'Capital',
    event_time: overrides.event_time || '2026-01-01T00:00:00Z',
    news_published_at: overrides.news_published_at || null,
    created_at: overrides.created_at || '2026-01-01T00:00:00Z',
    ...overrides
  };
}

describe('BatchEventClusterer', () => {
  it('builds stable cluster signatures for same entity/action/location/month', () => {
    const first = buildProtoClusterSignature(proto({ id: 1, event_time: '2026-01-01T00:00:00Z' }));
    const second = buildProtoClusterSignature(proto({ id: 2, event_time: '2026-01-20T00:00:00Z' }));

    assert.strictEqual(first.cluster_key, second.cluster_key);
    assert.strictEqual(first.time_bucket, '2026-01');
  });

  it('clusters near duplicate proto events in the same batch', () => {
    const clusterer = new BatchEventClusterer();
    const clusters = clusterer.clusterProtoEvents([
      proto({ id: 1 }),
      proto({ id: 2, event_time: '2026-01-02T00:00:00Z' }),
      proto({ id: 3, actor_entity_id: 99, object_entity_id: 100, location_id: 101, action_id: 102 })
    ]);

    assert.strictEqual(clusters.length, 2);
    assert.deepStrictEqual(clusters[0].proto_event_ids, [1, 2]);
    assert.deepStrictEqual(clusters[1].proto_event_ids, [3]);
  });

  it('does not cluster across monthly buckets', () => {
    const clusterer = new BatchEventClusterer();
    const clusters = clusterer.clusterProtoEvents([
      proto({ id: 1, event_time: '2026-01-31T00:00:00Z' }),
      proto({ id: 2, event_time: '2026-02-01T00:00:00Z' })
    ]);

    assert.strictEqual(clusters.length, 2);
  });

  it('assigns each proto to exactly one cluster', () => {
    const clusterer = new BatchEventClusterer();
    const protos = [proto({ id: 1 }), proto({ id: 2 }), proto({ id: 3, actor_entity_id: 99 })];
    const clusters = clusterer.clusterProtoEvents(protos);
    const assigned = clusters.flatMap(cluster => cluster.proto_event_ids);

    assert.deepStrictEqual([...assigned].sort((a, b) => a - b), [1, 2, 3]);
    assert.strictEqual(new Set(assigned).size, 3);
  });
});
