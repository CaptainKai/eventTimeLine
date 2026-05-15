-- Atomic batch assignment queue.
-- Persists only pending proto assignment work; batch clusters remain in memory.

CREATE TABLE IF NOT EXISTS atomic_batch_assignment_queue (
    id SERIAL PRIMARY KEY,
    proto_event_id INT NOT NULL REFERENCES proto_events(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    sort_time TIMESTAMPTZ NOT NULL,
    priority INT DEFAULT 0,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    run_after TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    payload JSONB DEFAULT '{}'::jsonb,
    result JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    UNIQUE(proto_event_id)
);

CREATE INDEX IF NOT EXISTS idx_atomic_batch_assignment_claim
  ON atomic_batch_assignment_queue(status, run_after, sort_time, proto_event_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_atomic_batch_assignment_running
  ON atomic_batch_assignment_queue(status, locked_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_atomic_batch_assignment_proto
  ON atomic_batch_assignment_queue(proto_event_id, status);

