-- 修复没有关联标准事件的原子事件
-- 重新运行合并逻辑

BEGIN;

-- 1. 找出所有没有 canonical_event_id 的 proto_events
-- 2. 尝试匹配或创建标准事件
-- 3. 更新关联

-- 查看需要修复的数量
-- SELECT COUNT(*) FROM proto_events WHERE canonical_event_id IS NULL;

-- 简化处理：对于没有关联的 proto_events，尝试模糊匹配 actor+action+date
-- 如果找不到完全匹配的，就创建一个新事件

-- 创建一个临时函数来处理
DO $$
DECLARE
    pe RECORD;
    new_event_id INT;
    matched_event_id INT;
    event_date TEXT;
BEGIN
    FOR pe IN
        SELECT pe.id, pe.actor_raw, pe.action_raw, pe.object_raw,
               pe.actor_entity_id, pe.object_entity_id, pe.location_id,
               pe.event_time
        FROM proto_events pe
        WHERE pe.canonical_event_id IS NULL
    LOOP
        -- 获取日期
        event_date := DATE(pe.event_time)::TEXT;

        -- 尝试模糊匹配：相同 actor1_id + 相同 action + 同一天
        IF pe.actor_entity_id IS NOT NULL THEN
            SELECT e.id INTO matched_event_id
            FROM events e
            WHERE e.actor1_id = pe.actor_entity_id
              AND e.event_type = pe.action_raw
              AND e.start_time::date = event_date::date
            LIMIT 1;

            IF matched_event_id IS NOT NULL THEN
                -- 找到匹配，更新关联
                UPDATE proto_events
                SET canonical_event_id = matched_event_id,
                    raw_extraction = COALESCE(raw_extraction, '{}'::jsonb) || jsonb_build_object('fixed', true)
                WHERE id = pe.id;

                -- 建立 event_news 关联
                INSERT INTO event_news (event_id, news_id, confidence)
                SELECT matched_event_id, pe.news_id, 0.8
                ON CONFLICT (event_id, news_id) DO NOTHING;

                RAISE NOTICE 'Fixed proto_event %: linked to event %', pe.id, matched_event_id;
            ELSE
                -- 没找到匹配，创建新事件
                INSERT INTO events (event_hash, event_type, start_time, actor1_id, actor2_id, location_id, status)
                VALUES (
                    md5(random()::TEXT || now()::TEXT),  -- 生成临时hash
                    pe.action_raw,
                    pe.event_time,
                    pe.actor_entity_id,
                    pe.object_entity_id,
                    pe.location_id,
                    'active'
                )
                RETURNING id INTO new_event_id;

                -- 更新关联
                UPDATE proto_events
                SET canonical_event_id = new_event_id,
                    raw_extraction = COALESCE(raw_extraction, '{}'::jsonb) || jsonb_build_object('created', true)
                WHERE id = pe.id;

                -- 建立 event_news 关联
                INSERT INTO event_news (event_id, news_id, confidence)
                VALUES (new_event_id, pe.news_id, 0.8)
                ON CONFLICT (event_id, news_id) DO NOTHING;

                RAISE NOTICE 'Created new event % for proto_event %', new_event_id, pe.id;
            END IF;
        END IF;

        matched_event_id := NULL;
        new_event_id := NULL;
    END LOOP;
END $$;

-- 验证结果
-- SELECT COUNT(*) as total, COUNT(canonical_event_id) as linked FROM proto_events;

COMMIT;