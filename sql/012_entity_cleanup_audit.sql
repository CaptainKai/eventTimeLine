-- Audit log for LLM-confirmed meaningless entity cleanup.

CREATE TABLE IF NOT EXISTS entity_cleanup_audit (
    id SERIAL PRIMARY KEY,
    entity_id INT,
    entity_raw_name TEXT,
    entity_canonical_name TEXT,
    llm_decision VARCHAR(20),
    reason TEXT,
    affected_proto_count INT DEFAULT 0,
    affected_event_count INT DEFAULT 0,
    affected_story_count INT DEFAULT 0,
    deleted_entity_row BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entity_cleanup_audit_entity ON entity_cleanup_audit(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_cleanup_audit_executed ON entity_cleanup_audit(executed_at);
