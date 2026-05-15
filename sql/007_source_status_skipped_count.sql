-- Add skipped counter for source status observability
ALTER TABLE source_status
ADD COLUMN IF NOT EXISTS skipped_count INT DEFAULT 0;
