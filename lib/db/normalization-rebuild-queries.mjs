import { query, queryOne } from './connection.mjs';

const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;
const DEFAULT_DEFER_MS = 5 * 60 * 1000;

export async function createNormalizationRebuildJob({ newsIds = [], reason = null, metadata = {} } = {}) {
  const uniqueNewsIds = normalizeNewsIds(newsIds);
  if (uniqueNewsIds.length === 0) {
    return {
      id: null,
      status: 'skipped',
      news_ids: [],
      news_count: 0,
      reason,
      metadata,
      locked_news_count: 0,
      deferred_news_count: 0
    };
  }

  const result = await query(`
    INSERT INTO normalization_rebuild_jobs (status, news_ids, reason, metadata, next_run_at)
    VALUES ('queued', $1::int[], $2, $3::jsonb, CURRENT_TIMESTAMP)
    RETURNING *
  `, [uniqueNewsIds, reason, JSON.stringify(metadata || {})]);

  return hydrateJob(result.rows[0]);
}

export async function listNormalizationRebuildJobs(options = {}) {
  const { status = null, limit = 50, offset = 0 } = options;
  const params = [];
  const where = [];

  if (status) {
    params.push(Array.isArray(status) ? status : [status]);
    where.push(`status = ANY($${params.length}::text[])`);
  }

  params.push(clampLimit(limit));
  const limitIndex = params.length;
  params.push(Math.max(0, Number(offset) || 0));
  const offsetIndex = params.length;

  const result = await query(`
    SELECT *, COUNT(*) OVER() AS total_count
    FROM normalization_rebuild_jobs
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `, params);

  return result.rows.map(hydrateJob);
}

export async function getNormalizationRebuildJob(id) {
  const row = await queryOne('SELECT * FROM normalization_rebuild_jobs WHERE id = $1', [Number(id)]);
  return hydrateJob(row);
}

export async function claimNextNormalizationRebuildJob() {
  const result = await query(`
    WITH next_job AS (
      SELECT id
      FROM normalization_rebuild_jobs
      WHERE status IN ('queued', 'deferred')
        AND (next_run_at IS NULL OR next_run_at <= CURRENT_TIMESTAMP)
      ORDER BY next_run_at NULLS FIRST, created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE normalization_rebuild_jobs jobs
    SET status = 'running',
        attempt_count = COALESCE(jobs.attempt_count, 0) + 1,
        started_at = CURRENT_TIMESTAMP,
        finished_at = NULL,
        updated_at = CURRENT_TIMESTAMP,
        error = NULL
    FROM next_job
    WHERE jobs.id = next_job.id
    RETURNING jobs.*
  `);

  return hydrateJob(result.rows[0]);
}

export async function markNormalizationRebuildJobSuccess(id, { result = {}, lockedNewsCount = 0, deferredNewsCount = 0 } = {}) {
  const row = await queryOne(`
    UPDATE normalization_rebuild_jobs
    SET status = 'success',
        result = $2::jsonb,
        locked_news_count = $3,
        deferred_news_count = $4,
        finished_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP,
        error = NULL
    WHERE id = $1
    RETURNING *
  `, [Number(id), JSON.stringify(result || {}), Number(lockedNewsCount) || 0, Number(deferredNewsCount) || 0]);

  return hydrateJob(row);
}

export async function markNormalizationRebuildJobFailed(id, { error = null, result = {}, lockedNewsCount = 0, deferredNewsCount = 0 } = {}) {
  const row = await queryOne(`
    UPDATE normalization_rebuild_jobs
    SET status = 'failed',
        result = $2::jsonb,
        locked_news_count = $3,
        deferred_news_count = $4,
        error = $5,
        finished_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [Number(id), JSON.stringify(result || {}), Number(lockedNewsCount) || 0, Number(deferredNewsCount) || 0, error]);

  return hydrateJob(row);
}

export async function markNormalizationRebuildJobDeferred(id, {
  error = null,
  result = {},
  lockedNewsCount = 0,
  deferredNewsCount = 0,
  delayMs = DEFAULT_DEFER_MS
} = {}) {
  const delaySeconds = Math.max(1, Math.round(Number(delayMs || DEFAULT_DEFER_MS) / 1000));
  const row = await queryOne(`
    UPDATE normalization_rebuild_jobs
    SET status = 'deferred',
        result = $2::jsonb,
        locked_news_count = $3,
        deferred_news_count = $4,
        error = $5,
        next_run_at = CURRENT_TIMESTAMP + ($6 || ' seconds')::interval,
        finished_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [Number(id), JSON.stringify(result || {}), Number(lockedNewsCount) || 0, Number(deferredNewsCount) || 0, error, String(delaySeconds)]);

  return hydrateJob(row);
}

export async function recoverStaleNormalizationRebuildJobs({ runningOlderThanMs = 60 * 60 * 1000 } = {}) {
  const seconds = Math.max(60, Math.round(Number(runningOlderThanMs) / 1000));
  const result = await query(`
    UPDATE normalization_rebuild_jobs
    SET status = 'deferred',
        error = COALESCE(error, 'Recovered stale running job after process restart or timeout'),
        next_run_at = CURRENT_TIMESTAMP,
        finished_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'running'
      AND started_at < CURRENT_TIMESTAMP - ($1 || ' seconds')::interval
    RETURNING *
  `, [String(seconds)]);

  return result.rows.map(hydrateJob);
}

export async function cleanupExpiredNewsLocks() {
  const result = await query('DELETE FROM pipeline_news_locks WHERE expires_at <= CURRENT_TIMESTAMP RETURNING lock_key');
  return result.rowCount || 0;
}

export async function tryAcquireNewsLocks(newsIds, options = {}) {
  const uniqueNewsIds = normalizeNewsIds(newsIds);
  const owner = normalizeOwner(options.owner);
  const reason = options.reason || null;
  const ttlMs = Number(options.ttlMs || DEFAULT_LOCK_TTL_MS);
  const ttlSeconds = Math.max(5, Math.round(ttlMs / 1000));
  const acquired = [];
  const deferred = [];

  await cleanupExpiredNewsLocks();

  for (const newsId of uniqueNewsIds) {
    const lockKey = buildNewsLockKey(newsId);
    const result = await query(`
      INSERT INTO pipeline_news_locks (lock_key, news_id, owner, reason, expires_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5 || ' seconds')::interval)
      ON CONFLICT (lock_key) DO UPDATE SET
        owner = EXCLUDED.owner,
        reason = EXCLUDED.reason,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP
      WHERE pipeline_news_locks.owner = EXCLUDED.owner
         OR pipeline_news_locks.expires_at <= CURRENT_TIMESTAMP
      RETURNING *
    `, [lockKey, newsId, owner, reason, String(ttlSeconds)]);

    if (result.rows[0]) acquired.push(result.rows[0]);
    else deferred.push(newsId);
  }

  return {
    acquired: deferred.length === 0,
    owner,
    reason,
    lock_keys: acquired.map((row) => row.lock_key),
    acquired_news_ids: acquired.map((row) => row.news_id),
    deferred_news_ids: deferred,
    locked_news_count: acquired.length,
    deferred_news_count: deferred.length
  };
}

export async function releaseNewsLocks(lockKeys, owner = null) {
  const keys = [...new Set((lockKeys || []).map((key) => String(key || '').trim()).filter(Boolean))];
  if (keys.length === 0) return 0;

  const params = [keys];
  let ownerClause = '';
  if (owner) {
    params.push(owner);
    ownerClause = `AND owner = $${params.length}`;
  }

  const result = await query(`
    DELETE FROM pipeline_news_locks
    WHERE lock_key = ANY($1::text[])
      ${ownerClause}
  `, params);
  return result.rowCount || 0;
}

export async function withNewsLocks(newsIds, options = {}, fn) {
  const lockInfo = await tryAcquireNewsLocks(newsIds, options);
  if (!lockInfo.acquired) {
    await releaseNewsLocks(lockInfo.lock_keys, lockInfo.owner);
    if (options.throwOnUnavailable === false) return { lockInfo, result: null };
    const error = new Error(`News lock unavailable for news IDs: ${lockInfo.deferred_news_ids.join(', ')}`);
    error.code = 'NEWS_LOCK_UNAVAILABLE';
    error.lockInfo = lockInfo;
    throw error;
  }

  try {
    const result = await fn(lockInfo);
    return { lockInfo, result };
  } finally {
    await releaseNewsLocks(lockInfo.lock_keys, lockInfo.owner);
  }
}

export function buildNewsLockKey(newsId) {
  return `news:${Number(newsId)}`;
}

function normalizeNewsIds(newsIds) {
  return [...new Set((newsIds || []).map(Number).filter(Number.isInteger))];
}

function normalizeOwner(owner) {
  const text = String(owner || '').trim();
  return text || `pid:${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function clampLimit(value) {
  const numeric = Number(value || 50);
  if (!Number.isFinite(numeric)) return 50;
  return Math.max(1, Math.min(500, Math.floor(numeric)));
}

function hydrateJob(row) {
  if (!row) return null;
  const newsIds = Array.isArray(row.news_ids) ? row.news_ids.map(Number).filter(Number.isInteger) : [];
  return {
    ...row,
    id: row.id === null || row.id === undefined ? null : Number(row.id),
    news_ids: newsIds,
    news_count: newsIds.length,
    attempt_count: Number(row.attempt_count || 0),
    locked_news_count: Number(row.locked_news_count || 0),
    deferred_news_count: Number(row.deferred_news_count || 0),
    total_count: row.total_count === undefined ? undefined : Number(row.total_count || 0)
  };
}
