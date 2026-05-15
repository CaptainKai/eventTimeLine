-- Event Timeline Engine - New Event Model Schema
-- Version: 2.1 (Fixed)
-- Description: Implements event-news separation, attribute history, timeline, event relationship network

-- ============================================================
-- Step 1: Create events table FIRST (core table)
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    event_hash TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,

    -- Event time range (supports ongoing and future events)
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    estimated_end_time TIMESTAMPTZ,
    is_ongoing BOOLEAN DEFAULT true,
    is_future BOOLEAN DEFAULT false,

    -- Participants and location
    actor1_id INT REFERENCES entity_mapping(id),
    actor2_id INT REFERENCES entity_mapping(id),
    location_id INT REFERENCES entity_mapping(id),

    -- Current snapshot attributes (latest calculated values)
    current_sentiment FLOAT,
    current_importance FLOAT,
    current_tone FLOAT,
    total_mentions INT DEFAULT 0,
    total_news_count INT DEFAULT 0,

    -- Event metadata
    event_code TEXT,
    status TEXT DEFAULT 'active',
    normalized_data JSONB,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for events table
CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_hash ON events(event_hash);

-- ============================================================
-- Step 2: Create dependent tables
-- ============================================================

-- Create news table
CREATE TABLE IF NOT EXISTS news (
    id SERIAL PRIMARY KEY,
    raw_event_id INT REFERENCES raw_events(id) ON DELETE CASCADE,
    event_id INT REFERENCES events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    source TEXT NOT NULL,
    source_url TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    lang TEXT DEFAULT 'en',

    -- News analysis attributes
    sentiment FLOAT,
    importance FLOAT,
    tone FLOAT,
    reliability_score FLOAT DEFAULT 1.0,
    mentions INT DEFAULT 0,

    normalized_data JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, source_url)
);

-- Ensure mentions column exists (for upgrade from older versions)
ALTER TABLE news ADD COLUMN IF NOT EXISTS mentions INT DEFAULT 0;

-- Create news table indexes
CREATE INDEX IF NOT EXISTS idx_news_event_time ON news(event_id, published_at DESC);

-- Create event-news association table
CREATE TABLE IF NOT EXISTS event_news (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    news_id INT NOT NULL REFERENCES news(id) ON DELETE CASCADE,

    -- Association information
    confidence FLOAT DEFAULT 1.0,
    association_type TEXT DEFAULT 'primary',

    -- Contribution weight
    contribution_score FLOAT DEFAULT 1.0,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, news_id)
);

-- Create event-news association indexes
CREATE INDEX IF NOT EXISTS idx_event_news_combined ON event_news(event_id, news_id);

-- Create event attribute history table
CREATE TABLE IF NOT EXISTS event_attribute_history (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- Attribute snapshot time
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- News-based calculation source
    news_count INT NOT NULL,
    triggering_news_id INT REFERENCES news(id),

    -- Event attribute snapshot
    sentiment FLOAT,
    importance FLOAT,
    tone FLOAT,
    mentions INT,
    news_count_at_snapshot INT,

    -- Calculation metadata
    aggregation_window TEXT,
    is_calculated BOOLEAN DEFAULT true,
    calculation_method TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create event attribute history indexes
CREATE INDEX IF NOT EXISTS idx_event_attr_history ON event_attribute_history(event_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_event_attr_window ON event_attribute_history(event_id, aggregation_window, snapshot_time DESC);

-- Create event milestones table
CREATE TABLE IF NOT EXISTS event_milestones (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- Milestone information
    milestone_time TIMESTAMPTZ NOT NULL,
    milestone_type TEXT NOT NULL,
    milestone_status TEXT DEFAULT 'confirmed',

    -- Description
    title TEXT,
    description TEXT,

    -- Associated news
    news_id INT REFERENCES news(id),

    -- Confidence
    confidence FLOAT DEFAULT 1.0,

    -- Sorting
    position INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create event milestones indexes
CREATE INDEX IF NOT EXISTS idx_event_milestones ON event_milestones(event_id, position, milestone_time);

-- Create event relationships table
CREATE TABLE IF NOT EXISTS event_relationships (
    id SERIAL PRIMARY KEY,
    source_event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    target_event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- Relationship type
    relationship_type TEXT NOT NULL,
    is_direct BOOLEAN DEFAULT true,

    -- Confidence
    confidence FLOAT DEFAULT 0.8,

    -- Relationship weight
    weight FLOAT DEFAULT 1.0,

    -- Relationship description
    description TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_event_id, target_event_id, relationship_type)
);

-- Create event relationships indexes
CREATE INDEX IF NOT EXISTS idx_event_relationships ON event_relationships(source_event_id, target_event_id);
CREATE INDEX IF NOT EXISTS idx_event_rel_type ON event_relationships(relationship_type);

-- ============================================================
-- Step 3: Data migration (if normalized_events exists)
-- ============================================================

DO $$
BEGIN
    -- Check if normalized_events exists and has data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'normalized_events') THEN
        RAISE NOTICE 'Migrating data from normalized_events...';

        -- Migrate to events table
        INSERT INTO events (
            event_hash, event_type, start_time, actor1_id, actor2_id,
            location_id, current_sentiment, current_importance,
            current_tone, total_mentions, event_code, normalized_data
        )
        SELECT
            MD5(CONCAT(event_type, COALESCE(actor1_id::TEXT, ''), COALESCE(actor2_id::TEXT, ''),
                event_time::TEXT, COALESCE(location_id::TEXT, ''))) as event_hash,
            event_type,
            event_time as start_time,
            actor1_id,
            actor2_id,
            location_id,
            sentiment as current_sentiment,
            importance as current_importance,
            tone as current_tone,
            mentions as total_mentions,
            event_code,
            normalized_data
        FROM normalized_events
        ON CONFLICT (event_hash) DO NOTHING;

        RAISE NOTICE 'Migrated % event records to events table', (SELECT COUNT(*) FROM events);

        -- Migrate to news table
        INSERT INTO news (
            raw_event_id, event_id, title, source,
            source_url, published_at, sentiment,
            importance, reliability_score, mentions, normalized_data
        )
        SELECT
            ne.raw_event_id,
            e.id as event_id,
            ne.title,
            COALESCE(re.source, 'unknown'),
            COALESCE(re.source_url, 'http://unknown-source.org'),
            ne.event_time,
            ne.sentiment,
            ne.importance,
            0.9,
            COALESCE(ne.mentions, 0),
            ne.normalized_data
        FROM normalized_events ne
        JOIN events e ON e.event_hash = MD5(CONCAT(ne.event_type,
            COALESCE(ne.actor1_id::TEXT, ''), COALESCE(ne.actor2_id::TEXT, ''),
            ne.event_time::TEXT, COALESCE(ne.location_id::TEXT, '')))
        JOIN raw_events re ON ne.raw_event_id = re.id
        ON CONFLICT (source, source_url) DO NOTHING;

        RAISE NOTICE 'Migrated % news records to news table', (SELECT COUNT(*) FROM news);

        -- Create event-news associations
        INSERT INTO event_news (event_id, news_id, confidence)
        SELECT e.id, n.id, 0.8
        FROM news n
        JOIN events e ON n.event_id = e.id
        ON CONFLICT (event_id, news_id) DO NOTHING;

        RAISE NOTICE 'Created % event-news associations', (SELECT COUNT(*) FROM event_news);
    ELSE
        RAISE NOTICE 'normalized_events table does not exist, skipping data migration';
    END IF;
END $$;

-- ============================================================
-- Step 4: Update event statistics
-- ============================================================

-- Update total_news_count in events table
UPDATE events
SET total_news_count = COALESCE(
    (SELECT COUNT(*) FROM event_news en WHERE en.event_id = events.id), 0
);

-- Update current attributes from associated news
UPDATE events e
SET
    current_sentiment = COALESCE(
        (SELECT AVG(n.sentiment) FROM event_news en JOIN news n ON en.news_id = n.id WHERE en.event_id = e.id),
        e.current_sentiment
    ),
    current_importance = COALESCE(
        (SELECT AVG(n.importance) FROM event_news en JOIN news n ON en.news_id = n.id WHERE en.event_id = e.id),
        e.current_importance
    ),
    current_tone = COALESCE(
        (SELECT AVG(n.tone) FROM event_news en JOIN news n ON en.news_id = n.id WHERE en.event_id = e.id),
        e.current_tone
    ),
    total_mentions = COALESCE(
        (SELECT SUM(n.mentions) FROM event_news en JOIN news n ON en.news_id = n.id WHERE en.event_id = e.id),
        e.total_mentions
    )
WHERE EXISTS (
    SELECT 1 FROM event_news en WHERE en.event_id = e.id
);

-- ============================================================
-- Step 5: Create materialized views
-- ============================================================

-- Create active events view
CREATE MATERIALIZED VIEW IF NOT EXISTS active_events AS
SELECT
    e.id,
    e.event_hash,
    e.event_type,
    e.start_time,
    e.current_sentiment,
    e.current_importance,
    e.total_news_count,
    e.is_ongoing,
    a1.canonical_name as actor1_name,
    a2.canonical_name as actor2_name,
    loc.canonical_name as location_name
FROM events e
LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
LEFT JOIN entity_mapping loc ON e.location_id = loc.id
WHERE e.is_ongoing = true
  AND e.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
ORDER BY e.total_news_count DESC, e.current_importance DESC;

-- Create daily event stats view
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_event_stats AS
SELECT
    DATE(e.start_time) as event_date,
    e.event_type,
    COUNT(DISTINCT e.id) as event_count,
    COUNT(n.id) as news_count,
    AVG(e.current_sentiment) as avg_sentiment,
    AVG(e.current_importance) as avg_importance
FROM events e
LEFT JOIN event_news en ON e.id = en.event_id
LEFT JOIN news n ON en.news_id = n.id
GROUP BY event_date, e.event_type
ORDER BY event_date DESC, news_count DESC;

-- ============================================================
-- Step 6: Create utility functions
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_daily_event_stats()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW daily_event_stats;
    REFRESH MATERIALIZED VIEW active_events;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 7: Final verification
-- ============================================================

DO $$
DECLARE
    events_count INT;
    news_count INT;
    relationships_count INT;
BEGIN
    SELECT COUNT(*) INTO events_count FROM events;
    SELECT COUNT(*) INTO news_count FROM news;
    SELECT COUNT(*) INTO relationships_count FROM event_relationships;

    RAISE NOTICE 'Database initialization complete:';
    RAISE NOTICE '  Total events: %', events_count;
    RAISE NOTICE '  Total news: %', news_count;
    RAISE NOTICE '  Event-news associations: %', (SELECT COUNT(*) FROM event_news);
    RAISE NOTICE '  Event relationships: %', relationships_count;

    IF events_count > 0 THEN
        RAISE NOTICE '  Active events: %', (SELECT COUNT(*) FROM active_events);
    END IF;
END $$;
