#!/usr/bin/env node

import 'dotenv/config';
import { closeDB } from '../lib/db/connection.mjs';
import {
  countUnassignedProtoEvents,
  getUnassignedProtoEventsPage,
  claimRelationshipSummaryJobs
} from '../lib/db/relationship-summary-queries.mjs';
import { relationshipSummaryManager } from '../lib/analysis/relationship-summary-manager.mjs';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_JOB_BATCH_SIZE = 10;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    drainDetails: false,
    limit: null,
    since: null,
    batchSize: DEFAULT_BATCH_SIZE,
    jobBatchSize: DEFAULT_JOB_BATCH_SIZE
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--drain-details') args.drainDetails = true;
    else if (arg === '--limit') args.limit = parsePositiveInt(argv[++index], null);
    else if (arg.startsWith('--limit=')) args.limit = parsePositiveInt(arg.split('=')[1], null);
    else if (arg === '--since') args.since = argv[++index] || null;
    else if (arg.startsWith('--since=')) args.since = arg.split('=').slice(1).join('=') || null;
    else if (arg === '--batch-size') args.batchSize = parsePositiveInt(argv[++index], DEFAULT_BATCH_SIZE);
    else if (arg.startsWith('--batch-size=')) args.batchSize = parsePositiveInt(arg.split('=')[1], DEFAULT_BATCH_SIZE);
    else if (arg === '--job-batch-size') args.jobBatchSize = parsePositiveInt(argv[++index], DEFAULT_JOB_BATCH_SIZE);
    else if (arg.startsWith('--job-batch-size=')) args.jobBatchSize = parsePositiveInt(arg.split('=')[1], DEFAULT_JOB_BATCH_SIZE);
  }

  return args;
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function drainDetailJobs(options = {}) {
  if (options.dryRun) {
    return { claimed_detail_job_count: 0, completed_detail_job_count: 0, failed_detail_job_count: 0, dry_run: true };
  }

  const stats = {
    claimed_detail_job_count: 0,
    completed_detail_job_count: 0,
    failed_detail_job_count: 0
  };
  const workerId = `backfill-unassigned-atomic-graph:${process.pid}:${Date.now()}`;

  while (true) {
    const jobs = await claimRelationshipSummaryJobs({
      limit: options.jobBatchSize || DEFAULT_JOB_BATCH_SIZE,
      workerId
    });
    if (jobs.length === 0) break;

    stats.claimed_detail_job_count += jobs.length;
    for (const job of jobs) {
      try {
        await relationshipSummaryManager.processSummaryJob(job);
        stats.completed_detail_job_count += 1;
      } catch (error) {
        stats.failed_detail_job_count += 1;
        console.warn(`[AtomicBackfill] Detail job ${job.id} failed: ${error.message}`);
      }
    }
  }

  return stats;
}

async function backfillUnassignedAtomicGraph(options) {
  const initialUnassigned = await countUnassignedProtoEvents(options);
  const plannedTotal = options.limit ? Math.min(initialUnassigned, options.limit) : initialUnassigned;
  const stats = {
    initial_unassigned_count: initialUnassigned,
    processed_proto_count: 0,
    skipped_count: 0,
    candidate_count_total: 0,
    planned_new_summary_count: 0,
    summary_ids: new Set(),
    detail_job_ids: new Set(),
    merge_job_ids: new Set()
  };

  console.log(`[AtomicBackfill] Unassigned proto_events=${initialUnassigned} planned=${plannedTotal} dryRun=${options.dryRun}`);

  let cursorTime = null;
  let cursorId = 0;

  while (stats.processed_proto_count + stats.skipped_count < plannedTotal) {
    const batchLimit = Math.min(options.batchSize, plannedTotal - stats.processed_proto_count - stats.skipped_count);
    const protos = await getUnassignedProtoEventsPage({
      since: options.since,
      limit: batchLimit,
      afterTime: cursorTime,
      afterId: cursorId
    });
    if (protos.length === 0) break;

    const lastProto = protos[protos.length - 1];
    cursorTime = lastProto.effective_time || lastProto.event_time || lastProto.created_at;
    cursorId = Number(lastProto.id || cursorId);

    const remainingProtos = protos.slice(0, Math.max(0, plannedTotal - stats.processed_proto_count - stats.skipped_count));
    const result = await relationshipSummaryManager.processProtoEventBatch(remainingProtos, {
      dryRun: options.dryRun,
      enqueueDetail: !options.dryRun,
      detailMode: 'incremental',
      logErrors: true
    });
    stats.processed_proto_count += Number(result.processed_proto_count || 0);
    stats.skipped_count += Number(result.skipped_count || 0);
    stats.candidate_count_total += Number(result.candidate_count_total || 0);
    stats.planned_new_summary_count += Number(result.planned_new_summary_count || 0);
    for (const summaryId of result.summary_ids || []) stats.summary_ids.add(summaryId);
    for (const jobId of result.detail_job_ids || []) stats.detail_job_ids.add(jobId);
    for (const jobId of result.merge_job_ids || []) stats.merge_job_ids.add(jobId);

    console.log(`[AtomicBackfill] Progress processed=${stats.processed_proto_count}/${plannedTotal} clusters=${result.cluster_count || 0} summaries=${stats.summary_ids.size} skipped=${stats.skipped_count} jobs=${stats.detail_job_ids.size}`);
  }

  const remainingUnassigned = options.dryRun ? initialUnassigned : await countUnassignedProtoEvents(options);
  const drainStats = options.drainDetails
    ? await drainDetailJobs(options)
    : { claimed_detail_job_count: 0, completed_detail_job_count: 0, failed_detail_job_count: 0 };

  return {
    initial_unassigned_count: stats.initial_unassigned_count,
    remaining_unassigned_count: remainingUnassigned,
    processed_proto_count: stats.processed_proto_count,
    skipped_count: stats.skipped_count,
    summary_count: stats.summary_ids.size,
    planned_new_summary_count: stats.planned_new_summary_count,
    enqueued_detail_job_count: stats.detail_job_ids.size,
    enqueued_merge_job_count: stats.merge_job_ids.size,
    average_candidate_count: stats.processed_proto_count > 0
      ? Number((stats.candidate_count_total / stats.processed_proto_count).toFixed(2))
      : 0,
    ...drainStats
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  try {
    const stats = await backfillUnassignedAtomicGraph(options);
    console.log('[AtomicBackfill] Completed', {
      ...stats,
      duration_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1))
    });
  } finally {
    await closeDB();
  }
}

main().catch(async error => {
  console.error('[AtomicBackfill] Fatal error:', error);
  await closeDB();
  process.exit(1);
});