-- 为 proto_events 表添加 canonical_event_id 字段
-- 用于直接关联到标准事件，提高数据一致性和查询效率

-- ============================================================
-- 警告：此脚本会修改数据库结构，但不会删除数据
-- ============================================================

-- 1. 检查字段是否已存在
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proto_events'
        AND column_name = 'canonical_event_id'
    ) THEN
        RAISE NOTICE 'Adding canonical_event_id column to proto_events...';

        -- 2. 添加 canonical_event_id 字段
        ALTER TABLE proto_events
        ADD COLUMN canonical_event_id INT REFERENCES events(id) ON DELETE SET NULL;

        -- 3. 创建索引（提高查询效率）
        CREATE INDEX IF NOT EXISTS idx_proto_canonical ON proto_events(canonical_event_id);

        RAISE NOTICE 'canonical_event_id column added successfully';
    ELSE
        RAISE NOTICE 'canonical_event_id column already exists';
    END IF;
END $$;

-- ============================================================
-- 更新现有数据的关联（如果可能）
-- ============================================================

-- 此操作可能需要较长时间，取决于数据量
DO $$
DECLARE
    v_proto_id INT;
    v_canonical_id INT;
    count INT := 0;
BEGIN
    RAISE NOTICE 'Attempting to update existing proto_events with canonical_event_id...';

    -- 遍历有 news_id 和 event_id 关联的 proto_events
    FOR v_proto_id, v_canonical_id IN
        SELECT pe.id, en.event_id
        FROM proto_events pe
        JOIN event_news en ON pe.news_id = en.news_id
        JOIN events e ON en.event_id = e.id
        WHERE pe.canonical_event_id IS NULL
    LOOP
        -- 检查是否是第一个匹配（避免重复更新）
        UPDATE proto_events
        SET canonical_event_id = v_canonical_id
        WHERE id = v_proto_id;

        count := count + 1;
    END LOOP;

    RAISE NOTICE 'Updated % proto_events with canonical_event_id', count;
    RAISE NOTICE 'Total proto_events with canonical_event_id: %',
        (SELECT COUNT(*) FROM proto_events WHERE canonical_event_id IS NOT NULL);
END $$;

-- ============================================================
-- 显示操作结果
-- ============================================================

DO $$
DECLARE
    total_proto INT;
    linked_proto INT;
    unlinked_proto INT;
BEGIN
    SELECT COUNT(*) INTO total_proto FROM proto_events;
    SELECT COUNT(*) INTO linked_proto FROM proto_events WHERE canonical_event_id IS NOT NULL;
    unlinked_proto := total_proto - linked_proto;

    RAISE NOTICE '=== proto_events Table Statistics ===';
    RAISE NOTICE 'Total proto_events: %', total_proto;
    RAISE NOTICE 'Linked to canonical events: % (%%)', linked_proto,
        ROUND((linked_proto::NUMERIC / NULLIF(total_proto, 0)) * 100, 1);
    RAISE NOTICE 'Unlinked proto_events: % (%%)', unlinked_proto,
        ROUND((unlinked_proto::NUMERIC / NULLIF(total_proto, 0)) * 100, 1);
END $$;

-- ============================================================
-- 操作完成
-- ============================================================
