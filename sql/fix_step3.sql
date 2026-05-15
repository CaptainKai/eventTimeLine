-- 更新新创建的事件关联
UPDATE proto_events pe
SET canonical_event_id = e.id
FROM events e
WHERE pe.canonical_event_id IS NULL
  AND pe.actor_entity_id = e.actor1_id
  AND pe.action_raw = e.event_type
  AND DATE(pe.event_time) = DATE(e.start_time)
  AND e.id > 1340;

-- 验证最终结果
SELECT '最终状态' as status, COUNT(*) as total, COUNT(canonical_event_id) as linked, COUNT(*) - COUNT(canonical_event_id) as unlinked FROM proto_events;