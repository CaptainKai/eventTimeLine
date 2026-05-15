-- Entity Hierarchy Support
-- Add parent_entity_id to entity_mapping for hierarchical entity relationships
-- e.g., "Department of Defense" -> parent: "United States"

ALTER TABLE entity_mapping ADD COLUMN IF NOT EXISTS parent_entity_id INT REFERENCES entity_mapping(id);
ALTER TABLE entity_mapping ADD COLUMN IF NOT EXISTS entity_subtype VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_entity_parent ON entity_mapping(parent_entity_id);