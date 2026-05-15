-- Dashboard performance indexes for filtered aggregate views

CREATE INDEX IF NOT EXISTS idx_news_published_at_desc ON news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_source ON news(source);
CREATE INDEX IF NOT EXISTS idx_news_lang ON news(lang);

CREATE INDEX IF NOT EXISTS idx_proto_news_dashboard ON proto_events(news_id);
CREATE INDEX IF NOT EXISTS idx_proto_canonical_dashboard ON proto_events(canonical_event_id);
CREATE INDEX IF NOT EXISTS idx_proto_event_type_dashboard ON proto_events((raw_extraction->'metadata'->>'event_type'));

CREATE INDEX IF NOT EXISTS idx_llm_parse_news_dashboard ON llm_parse_results(news_id);
