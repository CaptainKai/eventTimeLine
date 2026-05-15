-- 检查并修复 event_news 关联
-- 插入缺失的 event_news 关联
INSERT INTO event_news (event_id, news_id, confidence)
SELECT DISTINCT pe.canonical_event_id, pe.news_id, 0.8
FROM proto_events pe
WHERE pe.canonical_event_id IS NOT NULL
ON CONFLICT (event_id, news_id) DO NOTHING;

-- 验证
SELECT 'event_news 修复完成' as status, COUNT(DISTINCT event_id) as events, COUNT(DISTINCT news_id) as news FROM event_news;