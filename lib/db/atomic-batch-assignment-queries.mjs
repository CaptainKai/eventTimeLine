import { query } from './connection.mjs';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_FLUSH_AFTER_MS = 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

export async function enqueueAtomicBatchAssignment(protoEventId, options = {}) {
  const sql = `
    INSERT INTO atomic_batch_assignment_queue (
      proto_event_id, status, sort_time, priority, max_attempts, run_after, payload, created_at, updated_at
    )
    SELECT
      pe.id,
      'pending',
      COALESCE(pe.event_time, n.published_at, pe.created_at),
      $2,
      $3,
      COALESCE($4::timestamptz, CURRENT_TIMESTAMP),
      $5::jsonb,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    WHERE pe.id = $1
    ON CONFLICT (proto_event_id)
    DO UPDATE SET
      status = CASE
        WHEN atomic_batch_assignment_queue.status = 'completed' AND $6::boolean IS NOT TRUE THEN atomic_batch_assignment_queue.status
        ELSE 'pending'
      END,
      sort_time = EXCLUDED.sort_time,
      priority = GREATEST(atomic_batch_assignment_queue.priority, EXCLUDED.priority),
      max_attempts = GREATEST(atomic_batch_assignment_queue.max_attempts, EXCLUDED.max_attempts),
      run_after = LEAST(atomic_batch_assignment_queue.run_after, EXCLUDED.run_after),
      payload = COALESCE(atomic_batch_assignment_queue.payload, '{}'::jsonb) || COALESCE(EXCLUDED.payload, '{}'::jsonb),
      error = NULL,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const result = await query(sql, [
    Number(protoEventId),
    Number(options.priority || 0),
    Number(options.maxAttempts || 3),
    options.runAfter || null,
    JSON.stringify(options.payload || {}),
    options.requeueCompleted === true
  ]);
  return result.rows[0] || null;
}

export async function enqueueAtomicBatchAssignments(protoEventIds = [], options = {}) {
  const rows = [];
  for (const protoEventId of [...new Set((protoEventIds || []).map(Number).filter(Number.isInteger))]) {
    const row = await enqueueAtomicBatchAssignment(protoEventId, options);
    if (row) rows.push(row);
  }
  return rows;
}

export async function claimAtomicBatchAssignmentBatch(options = {}) {
  const batchSize = Math.max(parseInt(options.batchSize || `${DEFAULT_BATCH_SIZE}`, 10), 1);
  const flushAfterMs = Math.max(parseInt(options.flushAfterMs || `${DEFAULT_FLUSH_AFTER_MS}`, 10), 0);
  const staleAfterMs = Math.max(parseInt(options.staleAfterMs || `${DEFAULT_STALE_AFTER_MS}`, 10), 1);
  const workerId = options.workerId || `atomic-batch-assignment-worker:${process.pid}`;
  const force = options.force === true;

  const sql = `
    WITH stale AS (
      UPDATE atomic_batch_assignment_queue
      SET status = 'pending', locked_by = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE status = 'running'
        AND locked_at < (CURRENT_TIMESTAMP - ($4::int * INTERVAL '1 millisecond'))
      RETURNING id
    ),
    pending_stats AS (
      SELECT COUNT(*)::int AS total, MIN(created_at) AS oldest_created_at
      FROM atomic_batch_assignment_queue
      WHERE status = 'pending'
        AND run_after <= CURRENT_TIMESTAMP
        AND attempts < max_attempts
    ),
    picked AS (
      SELECT id
      FROM atomic_batch_assignment_queue
      WHERE status = 'pending'
        AND run_after <= CURRENT_TIMESTAMP
        AND attempts < max_attempts
        AND (
          $5::boolean
          OR (SELECT total FROM pending_stats) >= $1
          OR (SELECT oldest_created_at FROM pending_stats) <= (CURRENT_TIMESTAMP - ($3::int * INTERVAL '1 millisecond'))
        )
      ORDER BY sort_time ASC, proto_event_id ASC, id ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE atomic_batch_assignment_queue q
    SET status = 'running',
        locked_by = $2,
        locked_at = CURRENT_TIMESTAMP,
        attempts = attempts + 1,
        updated_at = CURRENT_TIMESTAMP
    FROM picked
    WHERE q.id = picked.id
    RETURNING q.*;
  `;

  const result = await query(sql, [batchSize, workerId, flushAfterMs, staleAfterMs, force]);
  return result.rows;
}

export async function getProtoEventsForAssignmentJobs(jobs = []) {
  const jobIds = [...new Set((jobs || []).map(job => Number(job?.id || job)).filter(Number.isInteger))];
  if (jobIds.length === 0) return [];

  const sql = `
    SELECT
      q.id AS assignment_job_id,
      q.sort_time AS assignment_sort_time,
      pe.*,
      COALESCE(pe.event_time, n.published_at, pe.created_at) AS effective_time,
      n.title AS news_title,
      n.source AS news_source,
      n.published_at AS news_published_at,
      actor.canonical_name AS actor_name,
      object_entity.canonical_name AS object_name,
      location.canonical_name AS location_name,
      sa.display_name AS action_name,
      sa.action_key AS action_key
    FROM atomic_batch_assignment_queue q
    JOIN proto_events pe ON pe.id = q.proto_event_id
    LEFT JOIN news n ON n.id = pe.news_id
    LEFT JOIN entity_mapping actor ON actor.id = pe.actor_entity_id
    LEFT JOIN entity_mapping object_entity ON object_entity.id = pe.object_entity_id
    LEFT JOIN entity_mapping location ON location.id = pe.location_id
    LEFT JOIN standard_actions sa ON sa.id = pe.action_id
    WHERE q.id = ANY($1::int[])
    ORDER BY q.sort_time ASC, q.proto_event_id ASC;
  `;
  const result = await query(sql, [jobIds]);
  return result.rows;
}

export async function completeAtomicBatchAssignmentJobs(jobIds = [], resultPayload = {}) {
  const ids = [...new Set((jobIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0) return [];
  const result = await query(`
    UPDATE atomic_batch_assignment_queue
    SET status = 'completed',
        locked_by = NULL,
        locked_at = NULL,
        result = COALESCE(result, '{}'::jsonb) || $2::jsonb,
        error = NULL,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ANY($1::int[])
    RETURNING *;
  `, [ids, JSON.stringify(resultPayload || {})]);
  return result.rows;
}

export async function failAtomicBatchAssignmentJobs(jobs = [], error) {
  const ids = [...new Set((jobs || []).map(job => Number(job?.id || job)).filter(Number.isInteger))];
  if (ids.length === 0) return [];
  const message = error?.message || String(error || 'Unknown batch assignment error');
  const result = await query(`
    UPDATE atomic_batch_assignment_queue
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        locked_by = NULL,
        locked_at = NULL,
        error = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ANY($1::int[])
    RETURNING *;
  `, [ids, message]);
  return result.rows;
}

export async function countPendingAtomicBatchAssignments() {
  const result = await query(`
    SELECT COUNT(*)::int AS total
    FROM atomic_batch_assignment_queue
    WHERE status = 'pending'
  `);
  return Number(result.rows[0]?.total || 0);
}
