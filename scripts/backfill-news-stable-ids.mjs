import { pathToFileURL } from 'node:url';
import { closeDB, initDB, query } from '../lib/db/connection.mjs';
import { createNewsStableId } from '../lib/data/stable-identifiers.mjs';

export async function backfillNewsStableIds(options = {}) {
  const batchSize = Math.min(Math.max(Number(options.batchSize || 500), 1), 2000);
  const dryRun = options.dryRun === true;
  const readBatch = options.readBatch || (afterId => query('SELECT id,source,source_url,normalized_data FROM news WHERE id>$1 AND stable_id IS NULL ORDER BY id LIMIT $2', [afterId, batchSize]).then(result => result.rows));
  const writeBatch = options.writeBatch || (records => query(`UPDATE news n SET stable_id=v.stable_id FROM unnest($1::bigint[],$2::text[]) AS v(id,stable_id) WHERE n.id=v.id AND n.stable_id IS NULL`, [records.map(row => row.id), records.map(row => row.stable_id)]));
  let afterId = Number(options.afterId || 0); let scanned = 0; let updated = 0; let batches = 0;
  const seen = new Set();
  while (true) {
    const rows = await readBatch(afterId);
    if (!rows.length) break;
    const records = rows.map(row => ({
      id: Number(row.id),
      stable_id: createNewsStableId({
        source: row.source || 'legacy',
        sourceUrl: row.source_url,
        sourceEventId: row.normalized_data?.source_event_id || (!row.source_url ? `legacy-news-${row.id}` : null),
      }),
    }));
    for (const record of records) {
      if (seen.has(record.stable_id)) throw new Error(`Stable ID collision in backfill: ${record.stable_id}`);
      seen.add(record.stable_id);
    }
    if (!dryRun) { const result = await writeBatch(records); updated += result.rowCount ?? records.length; }
    scanned += records.length; batches++; afterId = records.at(-1).id;
  }
  return { scanned, updated, batches, last_news_id: afterId, dry_run: dryRun };
}

async function main() {
  const args = new Map(process.argv.slice(2).map(value => { const [key, raw = 'true'] = value.split('='); return [key.replace(/^--/, ''), raw]; }));
  initDB();
  try { console.log(JSON.stringify(await backfillNewsStableIds({ batchSize: args.get('batch-size'), dryRun: args.has('dry-run') }), null, 2)); }
  finally { await closeDB(); }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error); process.exitCode = 1; });
