-- Pending Normalizations Table
-- Records unrecognized entities/actions for human review
-- Part of the system's continuous learning mechanism

CREATE TABLE IF NOT EXISTS pending_normalizations (
    id SERIAL PRIMARY KEY,

    -- Type: unknown_action, unknown_actor, unknown_object, unknown_location
    normalized_type TEXT NOT NULL,

    -- Raw value (stored in lowercase)
    raw_value TEXT NOT NULL,

    -- Context info (source news, event type, etc.)
    context JSONB DEFAULT '{}',

    -- Status: pending, approved, rejected
    status TEXT DEFAULT 'pending',

    -- Suggested normalization result (filled during review)
    suggested_normalization TEXT,

    -- Occurrence count
    occurrence_count INT DEFAULT 1,

    -- Last seen timestamp
    last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Review info
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint: same type+value only recorded once
    CONSTRAINT uq_pending_normalization_type_value UNIQUE (normalized_type, raw_value)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_norm_status ON pending_normalizations(status);
CREATE INDEX IF NOT EXISTS idx_pending_norm_type ON pending_normalizations(normalized_type);
CREATE INDEX IF NOT EXISTS idx_pending_norm_last_seen ON pending_normalizations(last_seen_at DESC);

-- Comments
COMMENT ON TABLE pending_normalizations IS 'Records unrecognized entities/actions for human review';
COMMENT ON COLUMN pending_normalizations.normalized_type IS 'Type: unknown_action, unknown_actor, unknown_object, unknown_location';
COMMENT ON COLUMN pending_normalizations.raw_value IS 'Raw value (lowercase)';
COMMENT ON COLUMN pending_normalizations.context IS 'Context: {source, event_type, temporal_status, news_id}';
COMMENT ON COLUMN pending_normalizations.status IS 'Status: pending, approved, rejected';
COMMENT ON COLUMN pending_normalizations.suggested_normalization IS 'Human-specified normalization for updating ENTITY_NORMALIZATION_MAP or ACTION_TAXONOMY';