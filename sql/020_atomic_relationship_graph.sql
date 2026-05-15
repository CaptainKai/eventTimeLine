-- Atomic Event Relationship Graph
-- New write path: proto_events -> atomic_event_relationships -> relationship_summaries

CREATE TABLE IF NOT EXISTS atomic_event_relationships (
    id SERIAL PRIMARY KEY,
    source_proto_event_id INT NOT NULL REFERENCES proto_events(id) ON DELETE CASCADE,
    target_proto_event_id INT NOT NULL REFERENCES proto_events(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    is_direct BOOLEAN DEFAULT true,
    confidence FLOAT DEFAULT 0.8,
    weight FLOAT DEFAULT 1.0,
    description TEXT,
    evidence JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CHECK (source_proto_event_id <> target_proto_event_id),
    UNIQUE(source_proto_event_id, target_proto_event_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_atomic_relationships_source_type
  ON atomic_event_relationships(source_proto_event_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_atomic_relationships_target_type
  ON atomic_event_relationships(target_proto_event_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_atomic_relationships_type_updated_at
  ON atomic_event_relationships(relationship_type, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_atomic_relationships_updated_at
  ON atomic_event_relationships(updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS relationship_summaries (
    id SERIAL PRIMARY KEY,
    summary_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    relationship_type TEXT NOT NULL,
    key_entities JSONB DEFAULT '[]'::jsonb,
    action_signature TEXT,
    location_key TEXT,
    time_start TIMESTAMPTZ,
    time_end TIMESTAMPTZ,
    member_count INT DEFAULT 0,
    edge_count INT DEFAULT 0,
    avg_confidence FLOAT DEFAULT 0,
    generated_by TEXT DEFAULT 'rule',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_relationship_summaries_type_updated_at
  ON relationship_summaries(relationship_type, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_relationship_summaries_time
  ON relationship_summaries(time_start, time_end);

CREATE INDEX IF NOT EXISTS idx_relationship_summaries_action
  ON relationship_summaries(action_signature);

CREATE INDEX IF NOT EXISTS idx_relationship_summaries_location
  ON relationship_summaries(location_key);

CREATE INDEX IF NOT EXISTS idx_relationship_summaries_key_entities
  ON relationship_summaries USING GIN(key_entities);

CREATE TABLE IF NOT EXISTS relationship_summary_members (
    id SERIAL PRIMARY KEY,
    summary_id INT NOT NULL REFERENCES relationship_summaries(id) ON DELETE CASCADE,
    proto_event_id INT NOT NULL REFERENCES proto_events(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    first_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(summary_id, proto_event_id)
);

CREATE INDEX IF NOT EXISTS idx_relationship_summary_members_summary
  ON relationship_summary_members(summary_id, proto_event_id);

CREATE INDEX IF NOT EXISTS idx_relationship_summary_members_proto
  ON relationship_summary_members(proto_event_id, summary_id);

CREATE TABLE IF NOT EXISTS relationship_summary_edges (
    id SERIAL PRIMARY KEY,
    summary_id INT NOT NULL REFERENCES relationship_summaries(id) ON DELETE CASCADE,
    atomic_relationship_id INT NOT NULL REFERENCES atomic_event_relationships(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(summary_id, atomic_relationship_id)
);

CREATE INDEX IF NOT EXISTS idx_relationship_summary_edges_summary
  ON relationship_summary_edges(summary_id, atomic_relationship_id);

CREATE INDEX IF NOT EXISTS idx_relationship_summary_edges_relationship
  ON relationship_summary_edges(atomic_relationship_id, summary_id);

CREATE INDEX IF NOT EXISTS idx_proto_atomic_candidate_time
  ON proto_events((COALESCE(event_time, created_at)));

CREATE INDEX IF NOT EXISTS idx_proto_atomic_entities_time
  ON proto_events(actor_entity_id, object_entity_id, location_id, (COALESCE(event_time, created_at)));

CREATE INDEX IF NOT EXISTS idx_proto_atomic_action_time
  ON proto_events(action_id, action_pending_id, (COALESCE(event_time, created_at)));
