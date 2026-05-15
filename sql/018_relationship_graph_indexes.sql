-- Indexes for relationship subgraph / neighbor expansion performance.

CREATE INDEX IF NOT EXISTS idx_event_relationships_source_type
  ON event_relationships(source_event_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_event_relationships_target_type
  ON event_relationships(target_event_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_events_story_start_time
  ON events(story_id, start_time DESC);
