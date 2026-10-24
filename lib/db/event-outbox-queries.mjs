import { query, withTransaction } from './connection.mjs';

export async function enqueueOutboxEvent(event, options = {}) {
  const queryFn = options.queryFn || query;
  const result = await queryFn(`
    INSERT INTO event_outbox (event_id, topic, event_key, payload, headers, max_attempts)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
    ON CONFLICT (topic, event_id) DO UPDATE SET
      payload = EXCLUDED.payload,
      headers = EXCLUDED.headers,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `, [event.event_id, event.topic, event.key, JSON.stringify(event.payload), JSON.stringify(event.headers || {}), options.maxAttempts || 10]);
  return result.rows[0];
}

export async function claimOutboxBatch(limit = 50, workerId = `outbox:${process.pid}`) {
  return withTransaction(async queryFn => {
    const result = await queryFn(`
      WITH candidates AS (
        SELECT id FROM event_outbox
        WHERE status IN ('pending', 'failed') AND run_after <= CURRENT_TIMESTAMP AND attempts < max_attempts
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE event_outbox o SET
        status = 'publishing', attempts = attempts + 1,
        locked_at = CURRENT_TIMESTAMP, locked_by = $2, updated_at = CURRENT_TIMESTAMP
      FROM candidates c WHERE o.id = c.id
      RETURNING o.*
    `, [limit, workerId]);
    return result.rows;
  });
}

export async function markOutboxPublished(id) {
  await query(`UPDATE event_outbox SET status='published', published_at=CURRENT_TIMESTAMP, locked_at=NULL, locked_by=NULL, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [id]);
}

export async function markOutboxFailed(id, error, delaySeconds = 30) {
  await query(`UPDATE event_outbox SET status='failed', run_after=CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second'), locked_at=NULL, locked_by=NULL, last_error=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [id, delaySeconds, String(error?.message || error).slice(0, 4000)]);
}

