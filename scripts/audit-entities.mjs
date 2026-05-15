#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { initDB, closeDB } from '../lib/db/connection.mjs';
import {
  deleteEntityChains,
  findMeaninglessEntityCandidates,
  runMeaninglessEntityCleanup
} from '../lib/pipeline/entity-cleanup.mjs';

function parseArgs(argv) {
  const options = {
    apply: false,
    limit: 20,
    entityIds: [],
    deleteEntityRows: true
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--keep-entity-rows') options.deleteEntityRows = false;
    else if (arg === '--limit') options.limit = Number(argv[++index] || options.limit);
    else if (arg === '--entity-id') options.entityIds.push(Number(argv[++index]));
    else if (arg === '--entity-ids') {
      options.entityIds.push(...String(argv[++index] || '').split(',').map(Number));
    }
  }

  options.entityIds = options.entityIds.filter(Number.isInteger);
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initDB();

  try {
    if (options.entityIds.length > 0) {
      if (!options.apply) {
        const candidates = await findMeaninglessEntityCandidates({ entityIds: options.entityIds, limit: options.limit });
        console.log(JSON.stringify({ mode: 'preview_explicit_entities', candidates }, null, 2));
        return;
      }

      const result = await deleteEntityChains(options.entityIds, { deleteEntityRows: options.deleteEntityRows });
      console.log(JSON.stringify({ mode: 'explicit_delete', ...result }, null, 2));
      return;
    }

    if (!options.apply) {
      const candidates = await findMeaninglessEntityCandidates({ limit: options.limit });
      console.log(JSON.stringify({ mode: 'preview', count: candidates.length, candidates }, null, 2));
      return;
    }

    const result = await runMeaninglessEntityCleanup({
      limit: options.limit,
      deleteEntityRows: options.deleteEntityRows
    });
    console.log(JSON.stringify({ mode: 'audit_and_cleanup', ...result }, null, 2));
  } finally {
    await closeDB();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(async (error) => {
    console.error('[audit-entities] Failed:', error);
    await closeDB();
    process.exit(1);
  });
}
