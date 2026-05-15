-- Add stable updated_at timestamp for relationship ordering.

ALTER TABLE IF EXISTS event_relationships
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE event_relationships
SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
WHERE updated_at IS NULL;

ALTER TABLE IF EXISTS event_relationships
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_event_relationships_updated_at
  ON event_relationships(updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_event_relationships_type_updated_at
  ON event_relationships(relationship_type, updated_at DESC, id DESC);
