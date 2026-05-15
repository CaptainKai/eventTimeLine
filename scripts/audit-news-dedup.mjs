import { initDB, closeDB, query } from '../lib/db/connection.mjs';

function parseDaysArg() {
  const raw = process.argv[2];
  const days = Number.parseInt(raw || '7', 10);
  return Number.isFinite(days) && days > 0 ? days : 7;
}

async function auditNewsDedup(days) {
  console.log(`[Audit] Checking duplicates and growth stats (last ${days} days)...`);

  const duplicateSql = `
    SELECT source, source_url, COUNT(*) AS dup_count
    FROM news
    GROUP BY source, source_url
    HAVING COUNT(*) > 1
    ORDER BY dup_count DESC, source
    LIMIT 100;
  `;

  const growthSql = `
    WITH span AS (
      SELECT generate_series(
        CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day',
        CURRENT_DATE,
        INTERVAL '1 day'
      )::date AS day
    ),
    news_daily AS (
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM news
      WHERE created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
      GROUP BY DATE(created_at)
    ),
    raw_daily AS (
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM raw_events
      WHERE created_at >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
      GROUP BY DATE(created_at)
    )
    SELECT
      s.day,
      COALESCE(n.count, 0) AS news_count,
      COALESCE(r.count, 0) AS raw_events_count
    FROM span s
    LEFT JOIN news_daily n ON n.day = s.day
    LEFT JOIN raw_daily r ON r.day = s.day
    ORDER BY s.day DESC;
  `;

  const [dupRes, growthRes] = await Promise.all([
    query(duplicateSql),
    query(growthSql, [days])
  ]);

  console.log(`\n[Audit] Duplicate (source, source_url) rows: ${dupRes.rows.length}`);
  if (dupRes.rows.length > 0) {
    for (const row of dupRes.rows.slice(0, 10)) {
      console.log(`  - ${row.source} | ${row.source_url} | duplicates=${row.dup_count}`);
    }
    if (dupRes.rows.length > 10) {
      console.log(`  ... and ${dupRes.rows.length - 10} more`);
    }
  }

  console.log('\n[Audit] Daily growth overview:');
  for (const row of growthRes.rows) {
    console.log(`  - ${String(row.day).slice(0, 10)} | news=${row.news_count} | raw_events=${row.raw_events_count}`);
  }
}

async function main() {
  const days = parseDaysArg();
  initDB();
  try {
    await auditNewsDedup(days);
  } finally {
    await closeDB();
  }
}

main().catch(error => {
  console.error('[Audit] Failed:', error);
  process.exitCode = 1;
});
