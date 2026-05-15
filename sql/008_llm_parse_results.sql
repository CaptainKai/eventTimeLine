-- LLM parse results storage table
-- Stores each LLM parse result to avoid repeated API calls

CREATE TABLE IF NOT EXISTS llm_parse_results (
    id SERIAL PRIMARY KEY,
    news_id INT NOT NULL REFERENCES news(id) ON DELETE CASCADE,

    prompt TEXT NOT NULL,
    raw_response JSONB NOT NULL,
    proto_event_count INT DEFAULT 0,

    model_used TEXT,
    parse_duration_ms INT,

    status TEXT DEFAULT 'success',
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_llm_parse_news ON llm_parse_results(news_id);
CREATE INDEX IF NOT EXISTS idx_llm_parse_status ON llm_parse_results(status);
CREATE INDEX IF NOT EXISTS idx_llm_parse_created ON llm_parse_results(created_at);