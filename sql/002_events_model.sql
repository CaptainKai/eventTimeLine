-- 事件时间线引擎 - 新事件模型 Schema
-- 版本: 2.0
-- 描述: 实现事件-新闻分离、属性历史、时间线、事件关系网络

-- 创建事件属性历史表
CREATE TABLE IF NOT EXISTS event_attribute_history (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- 属性快照时间
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 基于新闻的计算源
    news_count INT NOT NULL, -- 截止此时间点的新闻数量
    triggering_news_id INT REFERENCES news(id), -- 触发此次更新的新闻

    -- 事件属性快照
    sentiment FLOAT,
    importance FLOAT,
    tone FLOAT,
    mentions INT,
    news_count_at_snapshot INT,

    -- 计算元数据
    aggregation_window TEXT, -- 聚合窗口：hour, day, week
    is_calculated BOOLEAN DEFAULT true, -- 是否是计算值（true=实时计算，false=手动修正）
    calculation_method TEXT, -- 计算方法：weighted_avg, moving_avg, exponential_smoothing

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 事件属性历史表索引
CREATE INDEX IF NOT EXISTS idx_event_attr_history ON event_attribute_history(event_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_event_attr_window ON event_attribute_history(event_id, aggregation_window, snapshot_time DESC);

-- 创建事件时间点表
CREATE TABLE IF NOT EXISTS event_milestones (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- 时间点信息
    milestone_time TIMESTAMPTZ NOT NULL, -- 时间点
    milestone_type TEXT NOT NULL, -- 类型：start, update, prediction, end, key_event, future_plan
    milestone_status TEXT DEFAULT 'confirmed', -- 状态：confirmed, predicted, cancelled, happened

    -- 描述
    title TEXT, -- 简短标题（如"谈判开始"）
    description TEXT, -- 详细描述

    -- 关联新闻
    news_id INT REFERENCES news(id), -- 支撑此时间点的新闻（可选）

    -- 置信度
    confidence FLOAT DEFAULT 1.0, -- 时间点的置信度（预测类时间点用）

    -- 排序
    position INT DEFAULT 0, -- 时间线显示顺序

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 事件时间点表索引
CREATE INDEX IF NOT EXISTS idx_event_milestones ON event_milestones(event_id, position, milestone_time);

-- 创建新闻报道表
CREATE TABLE IF NOT EXISTS news (
    id SERIAL PRIMARY KEY,
    raw_event_id INT REFERENCES raw_events(id) ON DELETE CASCADE,
    event_id INT REFERENCES events(id) ON DELETE CASCADE,
    title TEXT NOT NULL, -- 新闻标题
    content TEXT, -- 新闻内容（可选）
    source TEXT NOT NULL, -- 来源（gdelt、rss等）
    source_url TEXT NOT NULL, -- 原始URL
    published_at TIMESTAMPTZ NOT NULL, -- 发布时间
    lang TEXT DEFAULT 'en', -- 语言

    -- 新闻自身的分析属性
    sentiment FLOAT, -- 此新闻的情感值
    importance FLOAT, -- 此新闻的重要性（基于来源权威性、传播度等）
    tone FLOAT, -- 此新闻的语气
    reliability_score FLOAT DEFAULT 1.0, -- 可靠性评分（1.0最高）

    normalized_data JSONB, -- 标准化元数据
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, source_url)
);

-- 新闻表索引
CREATE INDEX IF NOT EXISTS idx_news_event_time ON news(event_id, published_at DESC);

-- 创建事件-新闻关联表
CREATE TABLE IF NOT EXISTS event_news (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    news_id INT NOT NULL REFERENCES news(id) ON DELETE CASCADE,

    -- 关联信息
    confidence FLOAT DEFAULT 1.0, -- 关联置信度（有多确定这篇新闻属于该事件）
    association_type TEXT DEFAULT 'primary', -- 关联类型：primary（主要报道）, related（相关提及）, update（更新报道）

    -- 贡献度
    contribution_score FLOAT DEFAULT 1.0, -- 对事件属性计算的贡献权重

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, news_id)
);

-- 事件-新闻关联表索引
CREATE INDEX IF NOT EXISTS idx_event_news_combined ON event_news(event_id, news_id);

-- 创建事件关系表
CREATE TABLE IF NOT EXISTS event_relationships (
    id SERIAL PRIMARY KEY,
    source_event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    target_event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- 关系类型
    relationship_type TEXT NOT NULL, -- 关系类型：
                                    -- parent_child（父子层级）
                                    -- cause_effect（因果关系）
                                    -- related（相关）
                                    -- evolution（演变）
                                    -- trigger（触发）
    is_direct BOOLEAN DEFAULT true, -- 是否直接关系

    -- 置信度
    confidence FLOAT DEFAULT 0.8, -- 关系置信度

    -- 关系权重
    weight FLOAT DEFAULT 1.0, -- 关系重要性

    -- 关系描述（可选）
    description TEXT, -- 关系描述：如"该谈判事件是美伊战争的一部分"

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_event_id, target_event_id, relationship_type)
);

-- 事件关系表索引
CREATE INDEX IF NOT EXISTS idx_event_relationships ON event_relationships(source_event_id, target_event_id);
CREATE INDEX IF NOT EXISTS idx_event_rel_type ON event_relationships(relationship_type);

-- 更新原有的 events 表（重命名 normalized_events 为 events）
-- 首先检查 normalized_events 是否存在
DO $$
BEGIN
    -- 检查 normalized_events 是否存在且有数据
    PERFORM id FROM normalized_events LIMIT 1;

    -- 如果存在，我们将进行以下操作：
    -- 1. 创建新的 events 表
    -- 2. 迁移数据
    -- 3. 重命名旧表为 backup_normalized_events

    -- 创建新的 events 表（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
        CREATE TABLE events (
            id SERIAL PRIMARY KEY,
            event_hash TEXT NOT NULL UNIQUE, -- 事件去重哈希值
            event_type TEXT NOT NULL, -- 标准化事件类型

            -- 事件时间范围（支持持续事件和未来事件）
            start_time TIMESTAMPTZ, -- 事件开始时间（首次发现）
            end_time TIMESTAMPTZ,   -- 事件结束时间（持续事件的结束，或最后报道）
            estimated_end_time TIMESTAMPTZ, -- 预估结束时间（如谈判预定结束）
            is_ongoing BOOLEAN DEFAULT true, -- 是否正在进行中
            is_future BOOLEAN DEFAULT false, -- 是否是未来事件（如预定的谈判）

            -- 参与者和位置
            actor1_id INT REFERENCES entity_mapping(id), -- 参与者1
            actor2_id INT REFERENCES entity_mapping(id), -- 参与者2
            location_id INT REFERENCES entity_mapping(id), -- 发生地点

            -- 当前快照属性（最新计算值）
            current_sentiment FLOAT, -- 当前情感值
            current_importance FLOAT, -- 当前重要性
            current_tone FLOAT, -- 当前语气
            total_mentions INT DEFAULT 0, -- 总提及次数
            total_news_count INT DEFAULT 0, -- 相关新闻总数

            -- 事件元数据
            event_code TEXT, -- GDELT CAMEO代码
            status TEXT DEFAULT 'active', -- 事件状态：active, resolved, cancelled, pending
            normalized_data JSONB,

            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        -- 为 events 表创建索引
        CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time);
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
        CREATE INDEX IF NOT EXISTS idx_events_hash ON events(event_hash);
    END IF;

    -- 现在开始数据迁移（如果 normalized_events 有数据）
    -- 注意：我们需要谨慎处理数据迁移，这里只做简单演示
    -- 实际生产环境需要更复杂的逻辑

    -- 以下是简化的数据迁移示例：
    INSERT INTO events (
        event_hash, event_type, start_time, actor1_id, actor2_id,
        location_id, current_sentiment, current_importance,
        current_tone, total_mentions, event_code, normalized_data
    )
    SELECT
        -- 使用 existing normalized events 数据生成简单哈希
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

    -- 记录迁移日志
    RAISE NOTICE '迁移了 % 条事件数据到 events 表', (SELECT COUNT(*) FROM events);

EXCEPTION
    WHEN OTHERS THEN
        -- 如果 normalized_events 不存在，直接创建 events 表
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
            CREATE TABLE events (
                id SERIAL PRIMARY KEY,
                event_hash TEXT NOT NULL UNIQUE, -- 事件去重哈希值
                event_type TEXT NOT NULL, -- 标准化事件类型

                -- 事件时间范围（支持持续事件和未来事件）
                start_time TIMESTAMPTZ, -- 事件开始时间（首次发现）
                end_time TIMESTAMPTZ,   -- 事件结束时间（持续事件的结束，或最后报道）
                estimated_end_time TIMESTAMPTZ, -- 预估结束时间（如谈判预定结束）
                is_ongoing BOOLEAN DEFAULT true, -- 是否正在进行中
                is_future BOOLEAN DEFAULT false, -- 是否是未来事件（如预定的谈判）

                -- 参与者和位置
                actor1_id INT REFERENCES entity_mapping(id), -- 参与者1
                actor2_id INT REFERENCES entity_mapping(id), -- 参与者2
                location_id INT REFERENCES entity_mapping(id), -- 发生地点

                -- 当前快照属性（最新计算值）
                current_sentiment FLOAT, -- 当前情感值
                current_importance FLOAT, -- 当前重要性
                current_tone FLOAT, -- 当前语气
                total_mentions INT DEFAULT 0, -- 总提及次数
                total_news_count INT DEFAULT 0, -- 相关新闻总数

                -- 事件元数据
                event_code TEXT, -- GDELT CAMEO代码
                status TEXT DEFAULT 'active', -- 事件状态：active, resolved, cancelled, pending
                normalized_data JSONB,

                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );

            -- 为 events 表创建索引
            CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time);
            CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
            CREATE INDEX IF NOT EXISTS idx_events_hash ON events(event_hash);
        END IF;

        RAISE NOTICE 'normalized_events 表不存在，直接创建 events 表';
END $$;

-- 创建事件-新闻关联数据（从 normalized_events 迁移）
DO $$
DECLARE
    old_event RECORD;
    news_count INT;
BEGIN
    -- 检查是否有事件但没有新闻数据
    SELECT COUNT(*) INTO news_count FROM news;

    IF news_count = 0 THEN
        RAISE NOTICE '开始从 normalized_events 迁移新闻数据到 news 表';

        FOR old_event IN SELECT * FROM normalized_events LOOP
            INSERT INTO news (
                raw_event_id, event_id, title, source,
                source_url, published_at, sentiment,
                importance, reliability_score, normalized_data
            ) VALUES (
                old_event.raw_event_id,
                (SELECT id FROM events WHERE event_hash = MD5(CONCAT(
                    old_event.event_type,
                    COALESCE(old_event.actor1_id::TEXT, ''),
                    COALESCE(old_event.actor2_id::TEXT, ''),
                    old_event.event_time::TEXT,
                    COALESCE(old_event.location_id::TEXT, '')
                ))),
                old_event.title,
                'gdelt', -- 假设都是 GDELT 来源
                old_event.source_url,
                old_event.event_time,
                old_event.sentiment,
                old_event.importance,
                0.9,
                old_event.normalized_data
            ) ON CONFLICT (source, source_url) DO NOTHING;
        END LOOP;

        RAISE NOTICE '成功迁移了 % 条新闻数据', (SELECT COUNT(*) FROM news);

        -- 创建事件-新闻关联
        INSERT INTO event_news (event_id, news_id, confidence)
        SELECT e.id, n.id, 0.8
        FROM news n
        JOIN events e ON n.event_id = e.id
        ON CONFLICT (event_id, news_id) DO NOTHING;

        RAISE NOTICE '创建了 % 条事件-新闻关联', (SELECT COUNT(*) FROM event_news);
    ELSE
        RAISE NOTICE 'news 表已包含数据，跳过迁移';
    END IF;
END $$;

-- 更新 events 表的 total_news_count 字段
UPDATE events
SET total_news_count = COALESCE(
    (SELECT COUNT(*) FROM event_news en WHERE en.event_id = events.id), 0
);

-- 为新闻报道更新事件属性（确保 events 表有正确的 current_* 属性）
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

-- 创建视图：活跃事件视图
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

-- 创建视图：每日事件统计
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

-- 添加刷新视图的函数
CREATE OR REPLACE FUNCTION refresh_daily_event_stats()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW daily_event_stats;
    REFRESH MATERIALIZED VIEW active_events;
END;
$$ LANGUAGE plpgsql;

-- 创建每日定时任务（需要 pg_cron 扩展）
-- 注意：需要先安装 pg_cron 扩展
DO $$
BEGIN
    -- 尝试创建定时任务，如果 pg_cron 不可用则静默失败
    BEGIN
        PERFORM cron.schedule(
            'daily-event-stats-refresh',
            '0 0 * * *', -- 每天午夜
            'SELECT refresh_daily_event_stats();'
        );

        RAISE NOTICE '成功创建每日事件统计刷新任务';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'pg_cron 扩展不可用，跳过定时任务创建';
    END;
END $$;

-- 最终的完整性检查
DO $$
DECLARE
    events_count INT;
    news_count INT;
    relationships_count INT;
BEGIN
    SELECT COUNT(*) INTO events_count FROM events;
    SELECT COUNT(*) INTO news_count FROM news;
    SELECT COUNT(*) INTO relationships_count FROM event_relationships;

    RAISE NOTICE '数据库初始化完成：';
    RAISE NOTICE '  事件总数: %', events_count;
    RAISE NOTICE '  新闻总数: %', news_count;
    RAISE NOTICE '  事件-新闻关联: %', (SELECT COUNT(*) FROM event_news);
    RAISE NOTICE '  事件关系: %', relationships_count;

    IF events_count > 0 THEN
        RAISE NOTICE '  活跃事件: %', (SELECT COUNT(*) FROM active_events);
    END IF;
END $$;
