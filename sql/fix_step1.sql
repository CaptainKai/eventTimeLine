-- 修复没有关联标准事件的原子事件
-- Step 1: 模糊匹配更新

UPDATE proto_events pe
SET canonical_event_id = e.id
FROM events e
WHERE pe.canonical_event_id IS NULL
  AND pe.actor_entity_id IS NOT NULL
  AND e.actor1_id = pe.actor_entity_id
  AND e.event_type = pe.action_raw
  AND DATE(e.start_time) = DATE(pe.event_time);

-- 查看修复数量
SELECT '模糊匹配修复' as step, COUNT(*) as count FROM proto_events WHERE canonical_event_id IS NOT NULL;