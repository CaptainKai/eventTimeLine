-- 数据库字段使用情况分析 - 2026-04-25
-- 记录各字段的使用率，作为未来优化参考

-- ============================================================
-- 分析结果摘要
-- ============================================================

-- news 表:
--   tone: 0.6% 非空 - 预留字段，代码中有引用
--   proto_event_id: 0% 非空 - 设计错误字段，news 和 proto_events 是一对多关系
--   event_id: 15.6% 非空 - 冗余字段，通过 proto_events.canonical_event_id 关联

-- proto_events 表:
--   location_raw: 0% 非空 - 预留字段，location 信息存在 location_id
--   location_id: 10.4% 非空 - 实际使用中

-- events 表:
--   estimated_end_time: 0% 非空 - 预留字段
--   action: 0% 非空 - 预留字段，action 信息在 event_type
--   object_id: 0% 非空 - 预留字段，已有 actor2_id
--   story_id: 6.9% 非空 - 正常使用中

-- stories 表:
--   summary: 0% 非空 - 预留字段
--   last_event_at: 0% 非空 - 预留字段
--   normalized_data: 0% 非空 - 预留字段

-- hypotheses 表:
--   expires_at: 0% 非空 - 预留字段

-- ============================================================
-- 建议: 暂不删除预留字段
-- ============================================================

-- 以下字段虽然当前使用率低，但作为预留功能字段保留:
-- 1. tone - 语义基调，未来情感分析功能
-- 2. estimated_end_time - 事件预估结束时间
-- 3. action - 标准化动作标签
-- 4. summary - 叙事摘要
-- 5. last_event_at - 叙事最后更新时间
-- 6. expires_at - 假设过期时间

-- 唯一建议删除的字段:
-- news.proto_event_id - 设计错误，news 和 proto_events 是一对多关系
-- 正确的关联方式: news.id <- proto_events.news_id

-- ============================================================
-- 数据关系说明
-- ============================================================

-- L1 -> L2: news.id <- proto_events.news_id (一对多)
-- L2 -> L3: proto_events.canonical_event_id -> events.id (多对一)
-- L3 -> L4: events.id <- event_relationships.source_event_id/target_event_id
-- L3 -> L5: events.story_id -> stories.id (多对一)
-- L5 -> L6: stories.id <- hypotheses.story_id (一对多)
-- L1 -> LLM: news.id <- llm_parse_results.news_id (一对一)
