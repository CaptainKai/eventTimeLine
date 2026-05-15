#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { initDB, closeDB } from '../lib/db/connection.mjs';
import { rebuildAffectedNormalizations } from '../lib/pipeline/normalization-audit.mjs';

function parseArgs(argv) {
  const options = { pendingId: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--pending-id') options.pendingId = Number(argv[++index]);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(options.pendingId)) {
    throw new Error('Usage: node scripts/rebuild-affected-normalizations.mjs --pending-id ID');
  }

  initDB();
  try {
    const result = await rebuildAffectedNormalizations(options.pendingId, { reason: `script:${options.pendingId}` });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDB();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(async (error) => {
    console.error('[rebuild-affected-normalizations] Failed:', error);
    await closeDB();
    process.exit(1);
  });
}

