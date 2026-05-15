-- Atomic summary merge support.
-- Adds soft-merge metadata for relationship_summaries and indexes for active matching.

ALTER TABLE IF EXISTS relationship_summaries
  ADD COLUMN IF NOT EXISTS summary_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS merged_into_summary_id INT REFERENCES relationship_summaries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merge_reason TEXT;

UPDATE relationship_summaries
SET summary_status = COALESCE(summary_status, 'active')
WHERE summary_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_relationship_summaries_active_match_v2
  ON relationship_summaries(relationship_type, summary_kind, action_signature, location_key, time_bucket, updated_at DESC, id DESC)
  WHERE summary_status = 'active' AND summary_key LIKE 'kind:%';

CREATE INDEX IF NOT EXISTS idx_relationship_summaries_merged_into
  ON relationship_summaries(merged_into_summary_id)
  WHERE summary_status = 'merged';

CREATE INDEX IF NOT EXISTS idx_relationship_summary_jobs_merge_claim
  ON relationship_summary_jobs(status, job_type, run_after, priority DESC, id)
  WHERE status = 'pending' AND job_type = 'summary_merge';
