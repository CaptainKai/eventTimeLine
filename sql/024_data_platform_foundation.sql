BEGIN;

ALTER TABLE news ADD COLUMN IF NOT EXISTS stable_id TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS pipeline_run_id TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE news ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE news ADD COLUMN IF NOT EXISTS parser_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE news ADD COLUMN IF NOT EXISTS prompt_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE news ADD COLUMN IF NOT EXISTS normalization_version TEXT NOT NULL DEFAULT 'legacy-v1';
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_stable_id ON news(stable_id) WHERE stable_id IS NOT NULL;

ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS stable_id TEXT;
ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS pipeline_run_id TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS parser_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS prompt_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS normalization_version TEXT NOT NULL DEFAULT 'legacy-v1';
CREATE UNIQUE INDEX IF NOT EXISTS idx_proto_events_stable_id ON proto_events(stable_id) WHERE stable_id IS NOT NULL;

ALTER TABLE relationship_summaries ADD COLUMN IF NOT EXISTS pipeline_run_id TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE relationship_summaries ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE relationship_summaries ADD COLUMN IF NOT EXISTS logic_version TEXT NOT NULL DEFAULT 'legacy-v1';

ALTER TABLE atomic_event_relationships ADD COLUMN IF NOT EXISTS stable_id TEXT;
ALTER TABLE atomic_event_relationships ADD COLUMN IF NOT EXISTS pipeline_run_id TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE atomic_event_relationships ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE atomic_event_relationships ADD COLUMN IF NOT EXISTS logic_version TEXT NOT NULL DEFAULT 'legacy-v1';
CREATE UNIQUE INDEX IF NOT EXISTS idx_atomic_relationship_stable_id
  ON atomic_event_relationships(stable_id) WHERE stable_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pipeline_run_metrics (
  run_id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  records_in BIGINT NOT NULL DEFAULT 0 CHECK (records_in >= 0),
  records_out BIGINT NOT NULL DEFAULT 0 CHECK (records_out >= 0),
  records_skipped BIGINT NOT NULL DEFAULT 0 CHECK (records_skipped >= 0),
  records_failed BIGINT NOT NULL DEFAULT 0 CHECK (records_failed >= 0),
  lag_seconds DOUBLE PRECISION,
  duration_ms BIGINT,
  checkpoint_age_seconds DOUBLE PRECISION,
  dlq_count BIGINT NOT NULL DEFAULT 0 CHECK (dlq_count >= 0),
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pipeline_run_metrics_job_started
  ON pipeline_run_metrics(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_run_metrics_status_started
  ON pipeline_run_metrics(status, started_at DESC);

COMMIT;

