import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RelationshipSummaryManager } from '../../lib/analysis/relationship-summary-manager.mjs';
import { chooseCanonicalSummary } from '../../lib/db/relationship-summary-queries.mjs';

function proto(overrides = {}) {
  return {
    id: overrides.id || 1,
    actor_entity_id: overrides.actor_entity_id ?? 10,
    object_entity_id: overrides.object_entity_id ?? 20,
    location_id: overrides.location_id ?? 30,
    actor_raw: overrides.actor_raw || 'Actor A',
    action_raw: overrides.action_raw || 'sanction',
    object_raw: overrides.object_raw || 'Actor B',
    location_raw: overrides.location_raw || 'Capital',
    action_id: overrides.action_id || null,
    action_pending_id: overrides.action_pending_id || null,
    event_time: overrides.event_time || '2026-01-01T00:00:00Z',
    effective_time: overrides.effective_time || overrides.event_time || '2026-01-01T00:00:00Z',
    ...overrides
  };
}

describe('RelationshipSummaryManager summary-first helpers', () => {
  it('generates stable relationship summary keys within the same weekly bucket', () => {
    const manager = new RelationshipSummaryManager();
    const first = proto({ id: 1, event_time: '2026-01-01T00:00:00Z', effective_time: '2026-01-01T00:00:00Z' });
    const second = proto({ id: 2, event_time: '2026-01-02T00:00:00Z', effective_time: '2026-01-02T00:00:00Z' });

    const firstKey = manager.buildAssignmentSummaryKey(first, { summaryKind: 'relationship', relationshipType: 'related' });
    const secondKey = manager.buildAssignmentSummaryKey(second, { summaryKind: 'relationship', relationshipType: 'related' });

    assert.strictEqual(firstKey, secondKey);
    assert.ok(firstKey.includes('kind:relationship'));
    assert.ok(firstKey.includes('bucket:2026-w01'));
  });

  it('changes assignment keys across weekly buckets', () => {
    const manager = new RelationshipSummaryManager();
    const week1 = proto({ id: 1, event_time: '2026-01-01T00:00:00Z', effective_time: '2026-01-01T00:00:00Z' });
    const week2 = proto({ id: 2, event_time: '2026-01-08T00:00:00Z', effective_time: '2026-01-08T00:00:00Z' });

    assert.notStrictEqual(
      manager.buildAssignmentSummaryKey(week1, { summaryKind: 'relationship', relationshipType: 'related' }),
      manager.buildAssignmentSummaryKey(week2, { summaryKind: 'relationship', relationshipType: 'related' })
    );
  });

  it('creates isolated payloads for unmatched proto events', () => {
    const manager = new RelationshipSummaryManager();
    const payload = manager.buildAssignmentSummaryPayload(proto({ id: 42 }), {
      summaryKind: 'isolated',
      relationshipType: 'isolated'
    });

    assert.strictEqual(payload.summary_kind, 'isolated');
    assert.strictEqual(payload.relationship_type, 'isolated');
    assert.ok(payload.summary_key.includes('proto:42'));
    assert.strictEqual(payload.time_bucket, '2026-w01');
    assert.strictEqual(payload.metadata.rule_version, 'atomic-summary-first-v2');
  });



  it('chooses canonical summary by members, edges, then age', () => {
    const canonical = chooseCanonicalSummary([
      { id: 1, summary_status: 'active', member_count: 2, edge_count: 10, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, summary_status: 'active', member_count: 5, edge_count: 1, created_at: '2026-01-02T00:00:00Z' },
      { id: 3, summary_status: 'merged', member_count: 10, edge_count: 20, created_at: '2026-01-01T00:00:00Z' }
    ]);

    assert.strictEqual(canonical.id, 2);
  });

  it('chooses deterministic canonical summary ids for merge jobs', () => {
    const manager = new RelationshipSummaryManager();
    const id = manager.chooseCanonicalSummaryId([
      { id: 9, summary_status: 'active', member_count: 2, edge_count: 3, created_at: '2026-01-02T00:00:00Z' },
      { id: 8, summary_status: 'active', member_count: 2, edge_count: 3, created_at: '2026-01-01T00:00:00Z' },
      { id: 7, summary_status: 'merged', member_count: 20, edge_count: 30, created_at: '2026-01-01T00:00:00Z' }
    ]);

    assert.strictEqual(id, 8);
  });

  it('builds incremental detail pairs only against the changed proto', () => {
    const manager = new RelationshipSummaryManager();
    const members = [
      proto({ id: 1, event_time: '2026-01-01T00:00:00Z', effective_time: '2026-01-01T00:00:00Z' }),
      proto({ id: 2, event_time: '2026-01-02T00:00:00Z', effective_time: '2026-01-02T00:00:00Z' }),
      proto({ id: 3, event_time: '2026-01-03T00:00:00Z', effective_time: '2026-01-03T00:00:00Z' })
    ];

    const pairs = manager.buildDetailPairs(members, { mode: 'incremental', changedProtoEventId: 3 });

    assert.strictEqual(pairs.length, 2);
    assert.deepStrictEqual(pairs.map(pair => pair.map(item => item.id)), [[1, 3], [2, 3]]);
  });

  it('processes proto batches through clusters in dry-run mode', async () => {
    const manager = new RelationshipSummaryManager();
    const result = await manager.processProtoEventBatch([
      proto({ id: 1 }),
      proto({ id: 2, event_time: '2026-01-02T00:00:00Z' })
    ], {
      dryRun: true,
      skipSummaryLookup: true,
      enqueueDetail: false
    });

    assert.strictEqual(result.processed_proto_count, 2);
    assert.strictEqual(result.cluster_count, 1);
    assert.strictEqual(result.planned_new_summary_count, 1);
  });

});