-- Step 2: 为仍然没有关联的创建新事件
-- 创建新事件并关联

INSERT INTO events (event_hash, event_type, start_time, actor1_id, actor2_id, location_id, status)
SELECT
    md5(random()::TEXT || now()::TEXT || id::TEXT) as event_hash,
    pe.action_raw as event_type,
    pe.event_time as start_time,
    pe.actor_entity_id as actor1_id,
    pe.object_entity_id as actor2_id,
    pe.location_id as location_id,
    'active' as status
FROM proto_events pe
WHERE pe.canonical_event_id IS NULL
  AND pe.actor_entity_id IS NOT NULL
RETURNING id, actor1_id, event_type;

-- 查看新创建的事件数量
-- SELECT COUNT(*) as new_events FROM events WHERE event_hash LIKE '________-______-______-______-____________%';