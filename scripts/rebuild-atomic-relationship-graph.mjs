#!/usr/bin/env node

import 'dotenv/config';
import { closeDB, query, withAdvisoryLock } from '../lib/db/connection.mjs';
import { getProtoEventsForAtomicGraph } from '../lib/db/atomic-relationship-queries.mjs';
import {
  clearAtomicRelationshipGraph,
  listRelationshipSummaryIds,
  claimRelationshipSummaryJobs,
  getAtomicRelationshipGraphTableCounts,
  countLegacyRelationshipSummaries,
  resetFailedRelationshipSummaryJobs
} from '../lib/db/relationship-summary-queries.mjs';
import { relationshipSummaryManager } from '../lib/analysis/relationship-summary-manager.mjs';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_JOB_BATCH_SIZE = 10;
const REBUILD_LOCK_KEY = [20260513, 22022];

function parseArgs(argv) {
  const args = {
    full: false,
    dryRun: false,
    drainDetails: false,
    limit: null,
    since: null,
    batchSize: DEFAULT_BATCH_SIZE,
    jobBatchSize: DEFAULT_JOB_BATCH_SIZE,
    allowLegacySummaries: false,
    clearAttempts: 5,
    resumeAfterPhase1: false,
    resetFailedJobs: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--full') args.full = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--drain-details') args.drainDetails = true;
    else if (arg === '--limit') args.limit = parsePositiveInt(argv[++index], null);
    else if (arg.startsWith('--limit=')) args.limit = parsePositiveInt(arg.split('=')[1], null);
    else if (arg === '--since') args.since = argv[++index] || null;
    else if (arg.startsWith('--since=')) args.since = arg.split('=').slice(1).join('=') || null;
    else if (arg === '--batch-size') args.batchSize = parsePositiveInt(argv[++index], DEFAULT_BATCH_SIZE);
    else if (arg.startsWith('--batch-size=')) args.batchSize = parsePositiveInt(arg.split('=')[1], DEFAULT_BATCH_SIZE);
    else if (arg === '--job-batch-size') args.jobBatchSize = parsePositiveInt(argv[++index], DEFAULT_JOB_BATCH_SIZE);
    else if (arg.startsWith('--job-batch-size=')) args.jobBatchSize = parsePositiveInt(arg.split('=')[1], DEFAULT_JOB_BATCH_SIZE);
    else if (arg === '--allow-legacy-summaries') args.allowLegacySummaries = true;
    else if (arg === '--clear-attempts') args.clearAttempts = parsePositiveInt(argv[++index], 5);
    else if (arg.startsWith('--clear-attempts=')) args.clearAttempts = parsePositiveInt(arg.split('=')[1], 5);
    else if (arg === '--resume-after-phase1') args.resumeAfterPhase1 = true;
    else if (arg === '--reset-failed-jobs') args.resetFailedJobs = true;
  }

  return args;
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function listProtoEventIds({ since, offset, batchSize, remaining }) {
  const params = [];
  const conditions = [];
  if (since) {
    params.push(since);
    conditions.push(`COALESCE(pe.event_time, n.published_at, pe.created_at) >= $${params.length}::timestamptz`);
  }

  params.push(Math.max(1, Math.min(batchSize, remaining)));
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(`
    SELECT pe.id
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    ${whereClause}
    ORDER BY COALESCE(pe.event_time, n.published_at, pe.created_at), pe.id
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `, params);
  return result.rows.map(row => row.id);
}

async function countProtoEvents({ since, limit }) {
  const params = [];
  const conditions = [];
  if (since) {
    params.push(since);
    conditions.push(`COALESCE(pe.event_time, n.published_at, pe.created_at) >= $${params.length}::timestamptz`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(`SELECT COUNT(*)::int AS total FROM proto_events pe LEFT JOIN news n ON n.id = pe.news_id ${whereClause}`, params);
  const total = Number(result.rows[0]?.total || 0);
  return limit ? Math.min(total, limit) : total;
}


function getNonZeroGraphCounts(counts = {}) {
  return Object.entries(counts).filter(([, value]) => Number(value || 0) !== 0);
}

function isGraphCleared(counts = {}) {
  return getNonZeroGraphCounts(counts).length === 0;
}

function formatNonZeroCounts(counts = {}) {
  const dirty = getNonZeroGraphCounts(counts);
  return dirty.length > 0
    ? dirty.map(([table, count]) => `${table}=${count}`).join(', ')
    : 'none';
}

function assertGraphCleared(counts) {
  const dirty = getNonZeroGraphCounts(counts);
  if (dirty.length > 0) {
    throw new Error(`Atomic graph clear failed: ${formatNonZeroCounts(counts)}`);
  }
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clearAndVerifyAtomicGraph(options = {}) {
  const attempts = Math.max(Number(options.clearAttempts || 5), 1);
  let lastCounts = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const transactionCounts = await clearAtomicRelationshipGraph();
    assertGraphCleared(transactionCounts);

    const counts = await getAtomicRelationshipGraphTableCounts();
    if (isGraphCleared(counts)) {
      return counts;
    }

    lastCounts = counts;
    const nonZero = formatNonZeroCounts(counts);
    const retryLabel = attempt < attempts ? `retrying ${attempt}/${attempts}` : `giving up ${attempt}/${attempts}`;
    console.warn(`[AtomicGraph] Rows appeared immediately after clear (${nonZero}); ${retryLabel}. This usually means another rebuild/backfill/server process is still writing atomic summaries.`);
    if (attempt < attempts) await sleep(Math.min(1000 * attempt, 5000));
  }

  assertGraphCleared(lastCounts || {});
}

async function guardLegacySummaries(options) {
  const legacyCount = await countLegacyRelationshipSummaries();
  if (legacyCount === 0) return { legacy_summary_count: 0 };
  if (options.full || options.allowLegacySummaries) {
    console.log(`[AtomicGraph] Legacy type:* summaries detected count=${legacyCount}; full rebuild will clear them.`);
    return { legacy_summary_count: legacyCount };
  }
  throw new Error(`Legacy relationship_summaries detected (${legacyCount} type:* rows). Run with --full or pass --allow-legacy-summaries explicitly.`);
}

async function enqueueFullDetailJobs(summaryIds, options = {}) {
  console.log(`[AtomicGraph] enqueueFullDetailJobs start count=${summaryIds.length}`);
  if (options.dryRun) {
    return { enqueued_detail_job_count: 0, dry_run: true };
  }
  if (summaryIds.length === 0) {
    return { enqueued_detail_job_count: 0 };
  }

  const t0 = Date.now();
  const jobTypes = summaryIds.map(() => 'detail_rebuild');
  const statuses = summaryIds.map(() => 'pending');
  const priorities = summaryIds.map(() => 0);
  const payloads = summaryIds.map(() => JSON.stringify({
    mode: 'full',
    rule_version: 'atomic-summary-first-v2',
    requested_at: new Date().toISOString()
  }));
  const maxAttempts = summaryIds.map(() => 3);
  const nows = summaryIds.map(() => new Date().toISOString());

  const sql = `
    INSERT INTO relationship_summary_jobs
      (summary_id, job_type, status, priority, payload, max_attempts, run_after, created_at, updated_at)
    SELECT 
      u.sid, u.type, u.stat, u.prio, u.pay, u.max_a, u.run_a::timestamptz, u.cre::timestamptz, u.upd::timestamptz
    FROM unnest(
      $1::int[], $2::text[], $3::text[], $4::int[], $5::jsonb[], $6::int[], $7::text[], $8::text[], $9::text[]
    ) AS u(sid, type, stat, prio, pay, max_a, run_a, cre, upd)
    ON CONFLICT (summary_id, job_type) WHERE status IN ('pending', 'running') DO NOTHING
    RETURNING id
  `;

  const result = await query(sql, [
    summaryIds, jobTypes, statuses, priorities, payloads, maxAttempts, nows, nows, nows
  ]);
  console.log(`[AtomicGraph] enqueueFullDetailJobs bulk-insert t=${Date.now() - t0}ms returned=${result.rows.length}`);

  await query(`
    UPDATE relationship_summaries
    SET detail_status = 'pending', detail_requested_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ANY($1::int[])
  `, [summaryIds]);

  return { enqueued_detail_job_count: result.rows.length };
}

async function drainSummaryJobs(options = {}) {
  if (options.dryRun) {
    return { claimed_detail_job_count: 0, completed_detail_job_count: 0, failed_detail_job_count: 0, dry_run: true };
  }

  const stats = {
    claimed_detail_job_count: 0,
    completed_detail_job_count: 0,
    failed_detail_job_count: 0
  };
  const workerId = `rebuild-atomic-graph:${process.pid}:${Date.now()}`;
  const batchSize = options.jobBatchSize || DEFAULT_JOB_BATCH_SIZE;

  while (true) {
    const tBatch = Date.now();
    const jobs = await claimRelationshipSummaryJobs({
      limit: batchSize,
      workerId,
      jobType: options.jobType || null
    });
    if (jobs.length === 0) {
      console.log(`[AtomicGraph] drainSummaryJobs loop done total claimed=${stats.claimed_detail_job_count} completed=${stats.completed_detail_job_count} failed=${stats.failed_detail_job_count}`);
      break;
    }

    console.log(`[AtomicGraph] drainSummaryJobs batch claimed=${jobs.length} type=${options.jobType || 'all'} t=${Date.now() - tBatch}ms`);
    stats.claimed_detail_job_count += jobs.length;

    const results = await Promise.allSettled(
      jobs.map(job => relationshipSummaryManager.processSummaryJob(job))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        stats.completed_detail_job_count += 1;
      } else {
        stats.failed_detail_job_count += 1;
        console.warn(`[AtomicGraph] Summary job failed: ${result.reason?.message}`);
      }
    }
    console.log(`[AtomicGraph] Drained summary jobs type=${options.jobType || 'all'} batch=${jobs.length} completed=${stats.completed_detail_job_count} failed=${stats.failed_detail_job_count}`);
  }

  return stats;
}

async function resetFailedSummaryJobsForResume(options = {}) {
  if (!options.resetFailedJobs || options.dryRun) return { reset_failed_job_count: 0 };
  const resetRows = await resetFailedRelationshipSummaryJobs({ jobType: options.jobType || null });
  if (resetRows.length > 0) {
    console.log(`[AtomicGraph] Reset failed summary jobs count=${resetRows.length} jobType=${options.jobType || 'all'}`);
  }
  return { reset_failed_job_count: resetRows.length };
}

async function rebuildAtomicGraph(options) {
  const stats = {
    processed_proto_count: 0,
    skipped_count: 0,
    candidate_count_total: 0,
    planned_new_summary_count: 0,
    summary_ids: new Set(),
    merge_job_ids: new Set()
  };

  await guardLegacySummaries(options);

  if (options.resumeAfterPhase1 && options.full) {
    throw new Error('--resume-after-phase1 cannot be combined with --full');
  }

  if (options.full && !options.dryRun) {
    console.log('[AtomicGraph] Clearing atomic graph tables for full summary-first rebuild...');
    await clearAndVerifyAtomicGraph(options);
    console.log('[AtomicGraph] Atomic graph tables cleared and verified.');
  } else if (options.full && options.dryRun) {
    console.log('[AtomicGraph] Dry run: would clear atomic graph tables');
  }

  if (options.resumeAfterPhase1) {
    console.log('[AtomicGraph] Resume mode: skipping Phase 1 summary assignment');
    const summaryIds = await listRelationshipSummaryIds({ summaryStatus: 'active', v2Only: true });
    stats.summary_ids = new Set(summaryIds);
  } else {
    const total = await countProtoEvents(options);
    console.log(`[AtomicGraph] Phase 1 summary assignment total=${total} dryRun=${options.dryRun}`);

    let offset = 0;
    while (offset < total) {
      const remaining = total - offset;
      const ids = await listProtoEventIds({
        since: options.since,
        offset,
        batchSize: options.batchSize,
        remaining
      });
      if (ids.length === 0) break;

      const protos = await getProtoEventsForAtomicGraph(ids);
      const result = await relationshipSummaryManager.processProtoEventBatch(protos, {
        dryRun: options.dryRun,
        enqueueDetail: false,
        logErrors: true
      });
      stats.processed_proto_count += Number(result.processed_proto_count || 0);
      stats.skipped_count += Number(result.skipped_count || 0);
      stats.candidate_count_total += Number(result.candidate_count_total || 0);
      stats.planned_new_summary_count += Number(result.planned_new_summary_count || 0);
      for (const summaryId of result.summary_ids || []) stats.summary_ids.add(summaryId);
      for (const jobId of result.merge_job_ids || []) stats.merge_job_ids.add(jobId);

      offset += ids.length;
      console.log(`[AtomicGraph] Phase 1 progress ${offset}/${total} clusters=${result.cluster_count || 0} summaries=${stats.summary_ids.size} skipped=${stats.skipped_count}`);
    }

  }

  let mergeDrainStats = {
    reset_failed_merge_job_count: 0,
    claimed_merge_job_count: 0,
    completed_merge_job_count: 0,
    failed_merge_job_count: 0
  };
  if (!options.dryRun && (stats.merge_job_ids.size > 0 || options.resumeAfterPhase1)) {
    console.log(`[AtomicGraph] Phase 1.5 drain summary merge jobs jobs=${stats.merge_job_ids.size}${options.resumeAfterPhase1 ? ' resume=true' : ''}`);
    const resetStats = await resetFailedSummaryJobsForResume({ ...options, jobType: 'summary_merge' });
    const drained = await drainSummaryJobs({ ...options, jobType: 'summary_merge' });
    mergeDrainStats = {
      reset_failed_merge_job_count: resetStats.reset_failed_job_count,
      claimed_merge_job_count: drained.claimed_detail_job_count,
      completed_merge_job_count: drained.completed_detail_job_count,
      failed_merge_job_count: drained.failed_detail_job_count
    };
  }

  let detailStats = { enqueued_detail_job_count: 0 };
  if (options.dryRun) {
    console.log('[AtomicGraph] Dry run: would enqueue one full detail job per rebuilt summary');
  } else {
    const summaryIds = await listRelationshipSummaryIds({ summaryStatus: 'active', v2Only: true });
    console.log(`[AtomicGraph] Phase 2 enqueue full detail jobs summaries=${summaryIds.length}`);
    detailStats = await enqueueFullDetailJobs(summaryIds, options);
    stats.summary_ids = new Set(summaryIds);
  }

  const drainStats = options.drainDetails
    ? await drainSummaryJobs(options)
    : { claimed_detail_job_count: 0, completed_detail_job_count: 0, failed_detail_job_count: 0 };

  return {
    processed_proto_count: stats.processed_proto_count,
    skipped_count: stats.skipped_count,
    summary_count: options.dryRun ? stats.summary_ids.size + stats.planned_new_summary_count : stats.summary_ids.size,
    planned_new_summary_count: stats.planned_new_summary_count,
    enqueued_merge_job_count: stats.merge_job_ids.size,
    average_candidate_count: stats.processed_proto_count > 0
      ? Number((stats.candidate_count_total / stats.processed_proto_count).toFixed(2))
      : 0,
    ...mergeDrainStats,
    ...detailStats,
    ...drainStats
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  try {
    const stats = await withAdvisoryLock(REBUILD_LOCK_KEY, () => rebuildAtomicGraph(options), {
      errorMessage: 'Another atomic graph rebuild is already running. Stop the existing rebuild/backfill process before retrying.'
    });
    console.log('[AtomicGraph] Completed', {
      ...stats,
      duration_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1))
    });
  } finally {
    await closeDB();
  }
}

main().catch(async error => {
  console.error('[AtomicGraph] Fatal error:', error);
  await closeDB();
  process.exit(1);
});
