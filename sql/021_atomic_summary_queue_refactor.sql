-- Atomic summary-first queue refactor.
-- Adds async detail jobs and summary assignment metadata.

ALTER TABLE IF EXISTS relationship_summaries
  ADD COLUMN IF NOT EXISTS summary_kind TEXT DEFAULT 'relationship',
  ADD COLUMN IF NOT EXISTS time_bucket TEXT,
  ADD COLUMN IF NOT EXISTS detail_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS detail_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detail_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detail_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detail_error TEXT;

UPDATE relationship_summaries
SET
  summary_kind = COALESCE(summary_kind, CASE WHEN relationship_type = 'isolated' THEN 'isolated' ELSE 'relationship' END),
  detail_status = COALESCE(detail_status, 'pending'),
  time_bucket = COALESCE(time_bucket, to_char(COALESCE(time_start, created_at), 'YYYY-MM'))
WHERE summary_kind IS NULL OR detail_status IS NULL OR time_bucket IS NULL;

CREATE TABLE IF NOT EXISTS relationship_summary_jobs (
    id SERIAL PRIMARY KEY,
    summary_id INT NOT NULL REFERENCES relationship_summaries(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL DEFAULT 'detail_rebuild',
    status TEXT NOT NULL DEFAULT 'pending',
    priority INT DEFAULT 0,
    payload JSONB DEFAULT '{}'::jsonb,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    run_after TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_summary_jobs_pending_unique
  ON relationship_summary_jobs(summary_id, job_type)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_relationship_summary_jobs_claim
  ON relationship_summary_jobs(status, run_after, priority DESC, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_relationship_summary_jobs_summary
  ON relationship_summary_jobs(summary_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_relationship_summaries_detail_status
  ON relationship_summaries(detail_status, detail_requested_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_relationship_summaries_match
  ON relationship_summaries(relationship_type, summary_kind, action_signature, location_key, time_bucket);

CREATE INDEX IF NOT EXISTS idx_relationship_summary_members_proto_only
  ON relationship_summary_members(proto_event_id);

CREATE INDEX IF NOT EXISTS idx_proto_unassigned_atomic_time
  ON proto_events((COALESCE(event_time, created_at)), id);
