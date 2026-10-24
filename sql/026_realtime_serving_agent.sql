BEGIN;

CREATE TABLE IF NOT EXISTS ads_source_quality_1h (
  bucket_start TIMESTAMPTZ NOT NULL, source TEXT NOT NULL,
  records_in BIGINT NOT NULL DEFAULT 0, records_valid BIGINT NOT NULL DEFAULT 0,
  records_failed BIGINT NOT NULL DEFAULT 0, duplicate_count BIGINT NOT NULL DEFAULT 0,
  avg_parse_duration_ms DOUBLE PRECISION, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bucket_start, source)
);

CREATE TABLE IF NOT EXISTS ads_topic_trend_1h (
  bucket_start TIMESTAMPTZ NOT NULL, topic_key TEXT NOT NULL,
  event_count BIGINT NOT NULL DEFAULT 0, avg_confidence DOUBLE PRECISION,
  unique_entity_count BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bucket_start, topic_key)
);

CREATE TABLE IF NOT EXISTS realtime_summary_candidates (
  candidate_id TEXT PRIMARY KEY, source_proto_id TEXT NOT NULL, target_proto_id TEXT NOT NULL,
  candidate_key TEXT NOT NULL, score DOUBLE PRECISION NOT NULL CHECK (score BETWEEN 0 AND 1),
  logic_version TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_proto_id, target_proto_id, logic_version)
);
CREATE INDEX IF NOT EXISTS idx_realtime_summary_candidates_expiry ON realtime_summary_candidates(expires_at);

CREATE TABLE IF NOT EXISTS semantic_embeddings (
  object_type TEXT NOT NULL CHECK (object_type IN ('news', 'proto_event', 'summary')),
  object_id TEXT NOT NULL, embedding_version TEXT NOT NULL, model_name TEXT NOT NULL,
  embedding DOUBLE PRECISION[] NOT NULL, source_text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (object_type, object_id, embedding_version)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    EXECUTE 'ALTER TABLE semantic_embeddings ADD COLUMN IF NOT EXISTS embedding_vector vector(1536)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_tool_audit (
  id BIGSERIAL PRIMARY KEY, request_id TEXT NOT NULL, tool_name TEXT NOT NULL,
  arguments JSONB NOT NULL, status TEXT NOT NULL CHECK (status IN ('success', 'rejected', 'failed')),
  result_count INT, duration_ms BIGINT NOT NULL, error_code TEXT,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb, data_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_created ON agent_tool_audit(created_at DESC);

COMMIT;
