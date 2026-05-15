-- One-time cleanup for accidental duplicates in news.
-- Keeps the newest row per (source, source_url), deletes the rest.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY source, source_url
      ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS rn
  FROM news
),
to_delete AS (
  SELECT id
  FROM ranked
  WHERE rn > 1
)
DELETE FROM news n
USING to_delete d
WHERE n.id = d.id;

-- Verify no duplicates remain.
SELECT source, source_url, COUNT(*) AS cnt
FROM news
GROUP BY source, source_url
HAVING COUNT(*) > 1
ORDER BY cnt DESC;
