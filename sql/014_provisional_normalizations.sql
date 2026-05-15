-- Unified provisional normalization store and DB-backed standard actions.

CREATE TABLE IF NOT EXISTS standard_actions (
    id SERIAL PRIMARY KEY,
    action_key TEXT NOT NULL UNIQUE,
    display_name TEXT,
    action_category TEXT,
    description TEXT,
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS action_mappings (
    id SERIAL PRIMARY KEY,
    raw_action TEXT NOT NULL UNIQUE,
    action_id INT NOT NULL REFERENCES standard_actions(id) ON DELETE CASCADE,
    confidence FLOAT DEFAULT 1.0,
    source TEXT DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO standard_actions (action_key, display_name, action_category, confidence)
VALUES
  ('cut_supply', 'cut_supply', 'SUPPLY', 1.0),
  ('increase_supply', 'increase_supply', 'SUPPLY', 1.0),
  ('disrupt_supply', 'disrupt_supply', 'SUPPLY', 1.0),
  ('increase_demand', 'increase_demand', 'DEMAND', 1.0),
  ('decrease_demand', 'decrease_demand', 'DEMAND', 1.0),
  ('price_increase', 'price_increase', 'PRICE', 1.0),
  ('price_decrease', 'price_decrease', 'PRICE', 1.0),
  ('attack', 'attack', 'CONFLICT', 1.0),
  ('retaliate', 'retaliate', 'CONFLICT', 1.0),
  ('escalate', 'escalate', 'CONFLICT', 1.0),
  ('ceasefire', 'ceasefire', 'CONFLICT', 1.0),
  ('sanction', 'sanction', 'POLICY', 1.0),
  ('lift_sanction', 'lift_sanction', 'POLICY', 1.0),
  ('regulate', 'regulate', 'POLICY', 1.0),
  ('ban', 'ban', 'POLICY', 1.0),
  ('raise_rate', 'raise_rate', 'FINANCIAL', 1.0),
  ('cut_rate', 'cut_rate', 'FINANCIAL', 1.0),
  ('invest', 'invest', 'FINANCIAL', 1.0),
  ('divest', 'divest', 'FINANCIAL', 1.0),
  ('deploy', 'deploy', 'MOVEMENT', 1.0),
  ('withdraw', 'withdraw', 'MOVEMENT', 1.0),
  ('protest', 'protest', 'MOVEMENT', 1.0),
  ('announce', 'announce', 'STATEMENT', 1.0),
  ('warn', 'warn', 'STATEMENT', 1.0),
  ('confirm', 'confirm', 'STATEMENT', 1.0),
  ('deny', 'deny', 'STATEMENT', 1.0),
  ('sell_weapons', 'sell_weapons', 'MILITARY_DETAIL', 1.0),
  ('conduct_exercise', 'conduct_exercise', 'MILITARY_DETAIL', 1.0),
  ('impose_blockade', 'impose_blockade', 'MILITARY_DETAIL', 1.0),
  ('import', 'import', 'TRADE', 1.0),
  ('export', 'export', 'TRADE', 1.0),
  ('tariff', 'tariff', 'TRADE', 1.0),
  ('negotiate', 'negotiate', 'NEGOTIATE', 1.0),
  ('mediate', 'mediate', 'NEGOTIATE', 1.0)
ON CONFLICT (action_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  action_category = EXCLUDED.action_category,
  confidence = EXCLUDED.confidence,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO action_mappings (raw_action, action_id, confidence, source)
SELECT action_key, id, 1.0, 'seed'
FROM standard_actions
ON CONFLICT (raw_action) DO UPDATE SET
  action_id = EXCLUDED.action_id,
  confidence = EXCLUDED.confidence,
  updated_at = CURRENT_TIMESTAMP;

ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS item_kind TEXT;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS provisional_key TEXT;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS provisional_name TEXT;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS provisional_type TEXT;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS target_entity_id INT REFERENCES entity_mapping(id) ON DELETE SET NULL;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS target_action_id INT REFERENCES standard_actions(id) ON DELETE SET NULL;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS audit_decision TEXT;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS audit_reason TEXT;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '[]'::jsonb;
ALTER TABLE pending_normalizations ADD COLUMN IF NOT EXISTS source_refs JSONB DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_normalizations_provisional_key
  ON pending_normalizations(provisional_key)
  WHERE provisional_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_normalizations_item_kind ON pending_normalizations(item_kind);
CREATE INDEX IF NOT EXISTS idx_pending_normalizations_target_entity ON pending_normalizations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_pending_normalizations_target_action ON pending_normalizations(target_action_id);

ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS actor_pending_id INT REFERENCES pending_normalizations(id) ON DELETE SET NULL;
ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS object_pending_id INT REFERENCES pending_normalizations(id) ON DELETE SET NULL;
ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS location_pending_id INT REFERENCES pending_normalizations(id) ON DELETE SET NULL;
ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS action_id INT REFERENCES standard_actions(id) ON DELETE SET NULL;
ALTER TABLE proto_events ADD COLUMN IF NOT EXISTS action_pending_id INT REFERENCES pending_normalizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_proto_actor_pending ON proto_events(actor_pending_id);
CREATE INDEX IF NOT EXISTS idx_proto_object_pending ON proto_events(object_pending_id);
CREATE INDEX IF NOT EXISTS idx_proto_location_pending ON proto_events(location_pending_id);
CREATE INDEX IF NOT EXISTS idx_proto_action_id ON proto_events(action_id);
CREATE INDEX IF NOT EXISTS idx_proto_action_pending ON proto_events(action_pending_id);

ALTER TABLE events ADD COLUMN IF NOT EXISTS actor1_pending_id INT REFERENCES pending_normalizations(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS actor2_pending_id INT REFERENCES pending_normalizations(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS location_pending_id INT REFERENCES pending_normalizations(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS action_id INT REFERENCES standard_actions(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS action_pending_id INT REFERENCES pending_normalizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_actor1_pending ON events(actor1_pending_id);
CREATE INDEX IF NOT EXISTS idx_events_actor2_pending ON events(actor2_pending_id);
CREATE INDEX IF NOT EXISTS idx_events_location_pending ON events(location_pending_id);
CREATE INDEX IF NOT EXISTS idx_events_action_id ON events(action_id);
CREATE INDEX IF NOT EXISTS idx_events_action_pending ON events(action_pending_id);

CREATE TABLE IF NOT EXISTS normalization_audit_logs (
    id SERIAL PRIMARY KEY,
    pending_id INT REFERENCES pending_normalizations(id) ON DELETE SET NULL,
    item_kind TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT,
    target_entity_id INT REFERENCES entity_mapping(id) ON DELETE SET NULL,
    target_action_id INT REFERENCES standard_actions(id) ON DELETE SET NULL,
    affected_proto_count INT DEFAULT 0,
    affected_event_count INT DEFAULT 0,
    affected_story_count INT DEFAULT 0,
    affected_news_count INT DEFAULT 0,
    rebuild_status TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_normalization_audit_pending ON normalization_audit_logs(pending_id);
CREATE INDEX IF NOT EXISTS idx_normalization_audit_kind ON normalization_audit_logs(item_kind);
CREATE INDEX IF NOT EXISTS idx_normalization_audit_executed_at ON normalization_audit_logs(executed_at DESC);

UPDATE pending_normalizations
SET
  item_kind = CASE
    WHEN normalized_type = 'unknown_action' THEN 'action'
    WHEN normalized_type IN ('unknown_actor', 'unknown_object', 'unknown_location') THEN 'entity'
    ELSE COALESCE(item_kind, 'entity')
  END,
  role = CASE
    WHEN normalized_type = 'unknown_actor' THEN 'actor'
    WHEN normalized_type = 'unknown_object' THEN 'object'
    WHEN normalized_type = 'unknown_location' THEN 'location'
    ELSE role
  END,
  provisional_name = COALESCE(provisional_name, raw_value),
  provisional_type = COALESCE(
    provisional_type,
    CASE
      WHEN normalized_type = 'unknown_action' THEN 'action'
      WHEN normalized_type = 'unknown_location' THEN 'location'
      ELSE 'organization'
    END
  ),
  provisional_key = COALESCE(
    provisional_key,
    CASE
      WHEN normalized_type = 'unknown_action' THEN 'action:action:action:' || lower(raw_value)
      WHEN normalized_type = 'unknown_location' THEN 'entity:location:location:' || lower(raw_value)
      WHEN normalized_type = 'unknown_object' THEN 'entity:object:organization:' || lower(raw_value)
      ELSE 'entity:actor:organization:' || lower(raw_value)
    END
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE item_kind IS NULL
   OR provisional_key IS NULL
   OR provisional_name IS NULL
   OR provisional_type IS NULL;
