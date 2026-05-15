-- Event Timeline Engine - 6-Layer Architecture Schema
-- Version: 3.0
-- Layers: Article (news) -> ProtoEvent -> Canonical Event -> Event Graph -> Story -> Hypothesis

-- ============================================================
-- Layer 2: ProtoEvent (Atomic Facts)
-- ============================================================

CREATE TABLE IF NOT EXISTS proto_events (
    id SERIAL PRIMARY KEY,
    news_id INT NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    
    -- WHO did WHAT to WHOM
    actor_raw TEXT,
    action_raw TEXT,
    object_raw TEXT,
    
    -- Normalized pointers (if available during extraction)
    actor_entity_id INT REFERENCES entity_mapping(id),
    object_entity_id INT REFERENCES entity_mapping(id),
    
    -- Spatio-temporal
    event_time TIMESTAMPTZ,
    location_raw TEXT,
    location_id INT REFERENCES entity_mapping(id),
    
    -- Quality
    extraction_confidence FLOAT DEFAULT 0.5,
    
    -- Raw extraction data
    raw_extraction JSONB,
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proto_news ON proto_events(news_id);
CREATE INDEX IF NOT EXISTS idx_proto_time ON proto_events(event_time);

-- ============================================================
-- Layer 3: Canonical Event (Enhancement)
-- ============================================================

-- Add new semantic columns to events table if they don't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='events' AND column_name='action') THEN
        ALTER TABLE events ADD COLUMN action TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='events' AND column_name='object_id') THEN
        ALTER TABLE events ADD COLUMN object_id INT REFERENCES entity_mapping(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='events' AND column_name='story_id') THEN
        ALTER TABLE events ADD COLUMN story_id INT; -- Reference will be added after stories table creation
    END IF;
END $$;

-- ============================================================
-- Layer 5: Story (Narrative Subgraphs)
-- ============================================================

CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    theme TEXT, -- e.g., 'Ukraine War', 'Global Energy Crisis'
    
    -- Narrative state
    escalation_level INT DEFAULT 1, -- 1 to 10
    status TEXT DEFAULT 'active', -- active, resolving, concluded, archived
    
    -- Key entities involved (cached for fast UI)
    key_actors JSONB DEFAULT '[]',
    
    -- Metadata
    first_event_at TIMESTAMPTZ,
    last_event_at TIMESTAMPTZ,
    
    normalized_data JSONB,
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Now add the foreign key to events
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE constraint_name='fk_event_story') THEN
        ALTER TABLE events ADD CONSTRAINT fk_event_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_theme ON stories(theme);

-- ============================================================
-- Layer 6: Hypothesis (Predictive Latent Layer)
-- ============================================================

CREATE TABLE IF NOT EXISTS hypotheses (
    id SERIAL PRIMARY KEY,
    story_id INT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    
    -- The prediction
    predicted_event TEXT NOT NULL, -- "Next possible action"
    probability FLOAT DEFAULT 0.5,
    
    -- Evidence tracking
    evidence_signals JSONB DEFAULT '[]', -- List of required ProtoEvents to verify
    status TEXT DEFAULT 'pending', -- pending, verified, refuted, expired
    
    reasoning TEXT, -- Why did LLM think this?
    
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hypotheses_story ON hypotheses(story_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status);

-- ============================================================
-- Link L1 to L2 in news table for fast lookup
-- ============================================================

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='news' AND column_name='proto_event_id') THEN
        ALTER TABLE news ADD COLUMN proto_event_id INT; -- Reference added later
    END IF;
END $$;
