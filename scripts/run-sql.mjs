#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { closeDB, query } from '../lib/db/connection.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function resolveSqlPath(inputPath) {
  if (!inputPath) {
    throw new Error('Usage: node scripts/run-sql.mjs <sql-file>');
  }

  return isAbsolute(inputPath) ? inputPath : join(repoRoot, inputPath);
}

async function runSQLFile(filePath) {
  const sql = await readFile(filePath, 'utf8');
  console.log(`[run-sql] Executing SQL file: ${filePath}`);
  await query(sql);
  console.log('[run-sql] SQL file executed successfully');
}

async function main() {
  const filePath = resolveSqlPath(process.argv[2]);
  try {
    await runSQLFile(filePath);
  } finally {
    await closeDB();
  }
}

main().catch(async (error) => {
  console.error('[run-sql] Failed:', error.message);
  await closeDB();
  process.exit(1);
});
