-- Normalize invalid parent entity foreign keys that used 0 as "empty".
-- Keep this migration simple (no DO $$ blocks) for scripts/run-sql.mjs compatibility.

UPDATE pending_normalizations
SET parent_entity_id = NULL
WHERE parent_entity_id = 0;

UPDATE entity_mapping
SET parent_entity_id = NULL
WHERE parent_entity_id = 0;
