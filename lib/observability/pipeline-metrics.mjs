import { query } from '../db/connection.mjs';
import { createProcessingContext } from '../data/processing-context.mjs';

export const PIPELINE_METRIC_FIELDS = Object.freeze([
  'records_in', 'records_out', 'records_skipped', 'records_failed',
  'lag_seconds', 'duration_ms', 'checkpoint_age_seconds', 'dlq_count'
]);

export function createPipelineMetrics(jobName, overrides = {}) {
  const context = createProcessingContext({ job_name: jobName, ...overrides });
  return {
    job_name: jobName,
    run_id: context.pipeline_run_id,
    status: 'running',
    started_at: context.started_at,
    finished_at: null,
    records_in: 0,
    records_out: 0,
    records_skipped: 0,
    records_failed: 0,
    lag_seconds: null,
    duration_ms: null,
    checkpoint_age_seconds: null,
    dlq_count: 0,
    metadata: {},
    ...overrides
  };
}

export function finishPipelineMetrics(metrics, status = 'completed', error = null) {
  const finishedAt = new Date().toISOString();
  return {
    ...metrics,
    status,
    finished_at: finishedAt,
    duration_ms: metrics.duration_ms ?? Math.max(0, Date.parse(finishedAt) - Date.parse(metrics.started_at)),
    error_code: error?.code || null,
    error_message: error?.message || null
  };
}

export function logPipelineEvent(level, event, fields = {}) {
  const payload = { timestamp: new Date().toISOString(), level, event, ...fields };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  return payload;
}

export async function persistPipelineMetrics(metrics, queryFn = query) {
  const result = await queryFn(`
    INSERT INTO pipeline_run_metrics (
      run_id, job_name, status, started_at, finished_at,
      records_in, records_out, records_skipped, records_failed,
      lag_seconds, duration_ms, checkpoint_age_seconds, dlq_count,
      error_code, error_message, metadata, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16::jsonb, CURRENT_TIMESTAMP
    )
    ON CONFLICT (run_id) DO UPDATE SET
      status = EXCLUDED.status,
      finished_at = EXCLUDED.finished_at,
      records_in = EXCLUDED.records_in,
      records_out = EXCLUDED.records_out,
      records_skipped = EXCLUDED.records_skipped,
      records_failed = EXCLUDED.records_failed,
      lag_seconds = EXCLUDED.lag_seconds,
      duration_ms = EXCLUDED.duration_ms,
      checkpoint_age_seconds = EXCLUDED.checkpoint_age_seconds,
      dlq_count = EXCLUDED.dlq_count,
      error_code = EXCLUDED.error_code,
      error_message = EXCLUDED.error_message,
      metadata = EXCLUDED.metadata,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [
    metrics.run_id, metrics.job_name, metrics.status, metrics.started_at, metrics.finished_at,
    metrics.records_in, metrics.records_out, metrics.records_skipped, metrics.records_failed,
    metrics.lag_seconds, metrics.duration_ms, metrics.checkpoint_age_seconds, metrics.dlq_count,
    metrics.error_code || null, metrics.error_message || null, JSON.stringify(metrics.metadata || {})
  ]);
  return result.rows[0];
}

