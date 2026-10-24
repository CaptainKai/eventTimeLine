BEGIN;

CREATE TABLE IF NOT EXISTS authority_switch_audit (
  id BIGSERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  requested_mode TEXT NOT NULL,
  effective_mode TEXT NOT NULL,
  primary_count INTEGER,
  shadow_count INTEGER,
  overlap_count INTEGER,
  match_ratio DOUBLE PRECISION,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_authority_switch_audit_domain_created
  ON authority_switch_audit(domain, created_at DESC);

COMMIT;
