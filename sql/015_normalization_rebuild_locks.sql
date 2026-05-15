-- Persistent normalization rebuild jobs, news-level pipeline locks, and hierarchy metadata.
-- Keep this migration free of DO $$ blocks because scripts/run-sql.mjs splits statements naively.

CREATE TABLE IF NOT EXISTS normalization_rebuild_jobs (
    id BIGSERIAL PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'queued',
    news_ids INT[] NOT NULL DEFAULT '{}',
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    attempt_count INT DEFAULT 0,
    locked_news_count INT DEFAULT 0,
    deferred_news_count INT DEFAULT 0,
    result JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_normalization_rebuild_jobs_status_next_run
  ON normalization_rebuild_jobs(status, next_run_at, created_at);

CREATE INDEX IF NOT EXISTS idx_normalization_rebuild_jobs_created_at
  ON normalization_rebuild_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS pipeline_news_locks (
    lock_key TEXT PRIMARY KEY,
    news_id INT NOT NULL,
    owner TEXT NOT NULL,
    reason TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipeline_news_locks_news_id
  ON pipeline_news_locks(news_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_news_locks_expires_at
  ON pipeline_news_locks(expires_at);

ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS parent_entity_name TEXT;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS parent_entity_id INT REFERENCES entity_mapping(id) ON DELETE SET NULL;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS entity_subtype TEXT;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS hierarchy_confidence FLOAT;

CREATE INDEX IF NOT EXISTS idx_pending_normalizations_parent_entity
  ON pending_normalizations(parent_entity_id);

ALTER TABLE normalization_audit_logs ADD COLUMN IF NOT EXISTS rebuild_job_id BIGINT REFERENCES normalization_rebuild_jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_normalization_audit_rebuild_job
  ON normalization_audit_logs(rebuild_job_id);
