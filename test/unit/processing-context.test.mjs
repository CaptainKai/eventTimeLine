import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProcessingContext, withProcessingMetadata } from '../../lib/data/processing-context.mjs';
import { createPipelineMetrics, finishPipelineMetrics, persistPipelineMetrics } from '../../lib/observability/pipeline-metrics.mjs';

describe('processing context and metrics', () => {
  it('adds explicit version metadata without replacing domain metadata', () => {
    const context = createProcessingContext({ job_name: 'test', started_at: '2026-10-23T00:00:00.000Z', nonce: '1', parser_version: 'p2' });
    const metadata = withProcessingMetadata({ topic: 'economy' }, context);
    assert.equal(metadata.topic, 'economy');
    assert.equal(metadata.processing.parser_version, 'p2');
    assert.equal(metadata.processing.pipeline_run_id.length, 32);
  });

  it('does not let undefined overrides erase default versions', () => {
    const context = createProcessingContext({ job_name: 'test', parser_version: undefined });
    assert.equal(context.parser_version, 'legacy-v1');
  });

  it('finishes metrics with deterministic counters and status', () => {
    const running = createPipelineMetrics('test-job', { started_at: '2026-10-23T00:00:00.000Z', records_in: 3, records_out: 2 });
    const completed = finishPipelineMetrics(running, 'completed');
    assert.equal(completed.status, 'completed');
    assert.equal(completed.records_in, 3);
    assert.ok(completed.duration_ms >= 0);
  });

  it('persists metrics with an upsert contract', async () => {
    const metrics = finishPipelineMetrics(createPipelineMetrics('test-job'), 'completed');
    let captured;
    const result = await persistPipelineMetrics(metrics, async (sql, params) => {
      captured = { sql, params };
      return { rows: [{ run_id: metrics.run_id }] };
    });
    assert.equal(result.run_id, metrics.run_id);
    assert.match(captured.sql, /ON CONFLICT \(run_id\)/);
    assert.equal(captured.params[0], metrics.run_id);
    assert.equal(captured.params[1], 'test-job');
  });
});
