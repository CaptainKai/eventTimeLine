-- Add marker for file-level idempotency in source_status
ALTER TABLE source_status
ADD COLUMN IF NOT EXISTS last_processed_marker TEXT;

CREATE INDEX IF NOT EXISTS idx_source_status_marker
ON source_status(source_name, last_processed_marker);
