-- 清理 proto_events 表中的重复数据并添加唯一约束
-- 运行前请备份数据库！

BEGIN;

-- 1. 查看重复数据情况
-- SELECT news_id, actor_raw, action_raw, object_raw, COUNT(*) as cnt
-- FROM proto_events
-- GROUP BY news_id, actor_raw, action_raw, object_raw
-- HAVING COUNT(*) > 1;

-- 2. 删除重复数据，保留每组的第一条（id最小的那条）
DELETE FROM proto_events
WHERE id NOT IN (
    SELECT MIN(id)
    FROM proto_events
    GROUP BY news_id, actor_raw, action_raw, object_raw
);

-- 3. 添加唯一约束（防止未来插入重复数据）
-- 先检查约束是否已存在
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_proto_event_unique'
    ) THEN
        ALTER TABLE proto_events
        ADD CONSTRAINT uq_proto_event_unique
        UNIQUE (news_id, actor_raw, action_raw, object_raw);
    END IF;
END $$;

-- 4. 添加复合索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_proto_event_lookup
ON proto_events(news_id, actor_raw, action_raw);

-- 5. 验证结果
-- SELECT news_id, COUNT(*) as proto_count
-- FROM proto_events
-- GROUP BY news_id
-- ORDER BY proto_count DESC
-- LIMIT 10;

COMMIT;