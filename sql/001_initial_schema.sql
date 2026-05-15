-- 事件时间线引擎 - 数据库初始Schema

-- 原始事件表 (存储未处理的原始事件数据)
CREATE TABLE IF NOT EXISTS raw_events (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    source_event_id TEXT,
    event_time TIMESTAMPTZ NOT NULL,
    raw_data JSONB NOT NULL,
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, source_event_id)
);

-- 实体映射表 (用于标准化)
CREATE TABLE IF NOT EXISTS entity_mapping (
    id SERIAL PRIMARY KEY,
    raw_name TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- country, org, person, location, etc.
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(raw_name, entity_type)
);

-- 标准化事件表 (核心事件表)
CREATE TABLE IF NOT EXISTS normalized_events (
    id SERIAL PRIMARY KEY,
    raw_event_id INT REFERENCES raw_events(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    actor1_id INT REFERENCES entity_mapping(id),
    actor2_id INT REFERENCES entity_mapping(id),
    sentiment FLOAT,
    importance FLOAT,
    location TEXT,
    location_id INT REFERENCES entity_mapping(id),
    event_code TEXT,
    tone FLOAT,
    mentions INT,
    normalized_data JSONB,
    title TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 事件聚合表 (用于时间线视图的预计算)
CREATE TABLE IF NOT EXISTS event_aggregates (
    id SERIAL PRIMARY KEY,
    aggregate_date DATE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    actor1_id INT REFERENCES entity_mapping(id),
    actor2_id INT REFERENCES entity_mapping(id),
    location_id INT REFERENCES entity_mapping(id),
    event_count INT NOT NULL DEFAULT 0,
    avg_sentiment FLOAT,
    total_mentions INT,
    avg_importance FLOAT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(aggregate_date, event_type, actor1_id, actor2_id, location_id)
);

-- 数据源状态表 (跟踪各数据源的同步状态)
CREATE TABLE IF NOT EXISTS source_status (
    id SERIAL PRIMARY KEY,
    source_name VARCHAR(50) NOT NULL UNIQUE,
    last_sweep TIMESTAMPTZ,
    last_success TIMESTAMPTZ,
    last_processed_marker TEXT,
    last_error TEXT,
    events_fetched INT DEFAULT 0,
    skipped_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'idle', -- idle, running, error
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 为常用查询创建索引
CREATE INDEX IF NOT EXISTS idx_raw_events_time ON raw_events(event_time);
CREATE INDEX IF NOT EXISTS idx_raw_events_source ON raw_events(source);
CREATE INDEX IF NOT EXISTS idx_normalized_time ON normalized_events(event_time);
CREATE INDEX IF NOT EXISTS idx_normalized_type ON normalized_events(event_type);
CREATE INDEX IF NOT EXISTS idx_normalized_actor1 ON normalized_events(actor1_id);
CREATE INDEX IF NOT EXISTS idx_normalized_actor2 ON normalized_events(actor2_id);
CREATE INDEX IF NOT EXISTS idx_normalized_location ON normalized_events(location_id);
CREATE INDEX IF NOT EXISTS idx_aggregate_date ON event_aggregates(aggregate_date);
CREATE INDEX IF NOT EXISTS idx_aggregate_type ON event_aggregates(event_type);
CREATE INDEX IF NOT EXISTS idx_entity_type ON entity_mapping(entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_canonical ON entity_mapping(canonical_name);
