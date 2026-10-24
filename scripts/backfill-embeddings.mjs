import { pathToFileURL } from 'node:url';
import { closeDB, initDB } from '../lib/db/connection.mjs';
import { countEmbeddingCoverage, listMissingNewsEmbeddings, upsertEmbedding } from '../lib/db/semantic-search-queries.mjs';
import { buildEmbeddingText, requestEmbeddings } from '../lib/search/embedding-service.mjs';

export async function backfillNewsEmbeddings(options = {}) {
  const embeddingVersion = options.embeddingVersion || process.env.EMBEDDING_VERSION || 'embedding-v1';
  const batchSize = Math.min(Math.max(Number(options.batchSize || 32), 1), 200);
  const maxRows = Number(options.maxRows || 0);
  const dryRun = options.dryRun === true;
  const listMissing = options.listMissing || listMissingNewsEmbeddings;
  const embed = options.embed || requestEmbeddings;
  const upsert = options.upsert || upsertEmbedding;
  let afterId = Number(options.afterId || 0); let processed = 0; let failed = 0; let batches = 0;
  while (!maxRows || processed < maxRows) {
    const limit = maxRows ? Math.min(batchSize, maxRows - processed) : batchSize;
    const rows = await listMissing({ embeddingVersion, limit, afterId });
    if (!rows.length) break;
    batches++;
    const texts = rows.map(row => buildEmbeddingText('news', row));
    if (!dryRun) {
      const response = await embed(texts, options.embeddingOptions);
      for (let index = 0; index < rows.length; index++) {
        try {
          await upsert({ object_type: 'news', object_id: rows[index].stable_id, embedding_version: embeddingVersion, model_name: response.model, embedding: response.embeddings[index], source_text: texts[index], metadata: { news_id: rows[index].id, source: rows[index].source } });
        } catch { failed++; }
      }
    }
    processed += rows.length; afterId = Number(rows.at(-1).id);
  }
  return { embedding_version: embeddingVersion, processed, failed, batches, last_news_id: afterId, dry_run: dryRun };
}

async function main() {
  const args = new Map(process.argv.slice(2).map(value => { const [key, raw = 'true'] = value.split('='); return [key.replace(/^--/, ''), raw]; }));
  initDB();
  try {
    const before = await countEmbeddingCoverage(args.get('version') || process.env.EMBEDDING_VERSION || 'embedding-v1');
    const result = await backfillNewsEmbeddings({ embeddingVersion: args.get('version'), batchSize: args.get('batch-size'), maxRows: args.get('limit'), afterId: args.get('after-id'), dryRun: args.has('dry-run') });
    const after = result.dry_run ? before : await countEmbeddingCoverage(result.embedding_version);
    console.log(JSON.stringify({ before, result, after }, null, 2));
  } finally { await closeDB(); }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error); process.exitCode = 1; });
