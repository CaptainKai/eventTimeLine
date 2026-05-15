#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { initDB, closeDB } from '../lib/db/connection.mjs';
import { runNormalizationAudit } from '../lib/pipeline/normalization-audit.mjs';

function parseArgs(argv) {
  const options = { apply: false, rebuild: true, limit: 20, itemKind: null, status: 'pending' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--no-rebuild') options.rebuild = false;
    else if (arg === '--limit') options.limit = Number(argv[++index] || options.limit);
    else if (arg === '--item-kind') options.itemKind = argv[++index] || null;
    else if (arg === '--status') options.status = argv[++index] || options.status;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initDB();
  try {
    const result = await runNormalizationAudit(options);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDB();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(async (error) => {
    console.error('[audit-normalizations] Failed:', error);
    await closeDB();
    process.exit(1);
  });
}

