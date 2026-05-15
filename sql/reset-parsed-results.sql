-- 事件解析结果重置脚本
-- 仅重置解析结果，保留原始新闻数据 (news 表数据保持不变)

-- ============================================================
-- 警告：此脚本会删除解析结果数据，请谨慎使用！
-- ============================================================

-- 1. 关闭外键约束检查（以便安全删除）
SET session_replication_role = replica;

-- 2. 删除所有解析结果相关的表数据
TRUNCATE TABLE event_relationships CASCADE;
TRUNCATE TABLE event_milestones CASCADE;
TRUNCATE TABLE event_attribute_history CASCADE;
TRUNCATE TABLE event_news CASCADE;
TRUNCATE TABLE events CASCADE;
TRUNCATE TABLE proto_events CASCADE;

-- 3. 重置序列（用于自动增量字段）
SELECT setval('events_id_seq', 1, false);
SELECT setval('proto_events_id_seq', 1, false);
SELECT setval('event_news_id_seq', 1, false);
SELECT setval('event_attribute_history_id_seq', 1, false);
SELECT setval('event_milestones_id_seq', 1, false);
SELECT setval('event_relationships_id_seq', 1, false);

-- 4. 恢复外键约束检查
SET session_replication_role = DEFAULT;

-- 5. 显示成功信息
DO $$
BEGIN
    RAISE NOTICE '解析结果重置成功！';
    RAISE NOTICE '保留的表：news, entity_mapping, entity_types, raw_events';
END $$;

-- ============================================================
-- 重置完成
-- ============================================================
