-- Defensive cleanup for historical zero-id placeholders.
-- 0 should never be used for FK-like columns; normalize to NULL.
-- Safe to run multiple times.

UPDATE entity_mapping
SET parent_entity_id = NULL
WHERE parent_entity_id = 0;

UPDATE pending_normalizations
SET
  parent_entity_id = CASE WHEN parent_entity_id = 0 THEN NULL ELSE parent_entity_id END,
  target_entity_id = CASE WHEN target_entity_id = 0 THEN NULL ELSE target_entity_id END,
  target_action_id = CASE WHEN target_action_id = 0 THEN NULL ELSE target_action_id END
WHERE parent_entity_id = 0
   OR target_entity_id = 0
   OR target_action_id = 0;

UPDATE normalization_audit_logs
SET
  pending_id = CASE WHEN pending_id = 0 THEN NULL ELSE pending_id END,
  target_entity_id = CASE WHEN target_entity_id = 0 THEN NULL ELSE target_entity_id END,
  target_action_id = CASE WHEN target_action_id = 0 THEN NULL ELSE target_action_id END,
  rebuild_job_id = CASE WHEN rebuild_job_id = 0 THEN NULL ELSE rebuild_job_id END
WHERE pending_id = 0
   OR target_entity_id = 0
   OR target_action_id = 0
   OR rebuild_job_id = 0;

-- Optional visibility check:
SELECT
  (SELECT COUNT(*) FROM entity_mapping WHERE parent_entity_id = 0) AS entity_parent_zero_count,
  (SELECT COUNT(*) FROM pending_normalizations WHERE parent_entity_id = 0 OR target_entity_id = 0 OR target_action_id = 0) AS pending_zero_count,
  (SELECT COUNT(*) FROM normalization_audit_logs WHERE pending_id = 0 OR target_entity_id = 0 OR target_action_id = 0 OR rebuild_job_id = 0) AS audit_zero_count;
