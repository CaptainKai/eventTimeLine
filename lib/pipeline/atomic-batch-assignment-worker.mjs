import {
  claimAtomicBatchAssignmentBatch,
  completeAtomicBatchAssignmentJobs,
  failAtomicBatchAssignmentJobs,
  getProtoEventsForAssignmentJobs
} from '../db/atomic-batch-assignment-queries.mjs';
import { relationshipSummaryManager } from '../analysis/relationship-summary-manager.mjs';

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_FLUSH_AFTER_MS = 60 * 1000;
const DEFAULT_CONCURRENCY = 1;

let activeWorker = null;

export function startAtomicBatchAssignmentWorker(options = {}) {
  const enabled = options.enabled ?? (process.env.ATOMIC_BATCH_ASSIGNMENT_WORKER_ENABLED !== 'false');
  if (!enabled) {
    console.log('[AtomicBatchAssignmentWorker] Disabled by ATOMIC_BATCH_ASSIGNMENT_WORKER_ENABLED=false');
    return null;
  }
  if (activeWorker) return activeWorker;
  const worker = new AtomicBatchAssignmentWorker(options);
  activeWorker = worker;
  worker.start();
  return worker;
}

export function stopAtomicBatchAssignmentWorker() {
  if (!activeWorker) return;
  activeWorker.stop();
  activeWorker = null;
}

export class AtomicBatchAssignmentWorker {
  constructor(options = {}) {
    this.workerId = options.workerId || `atomic-batch-assignment-worker:${process.pid}:${Date.now()}`;
    this.intervalMs = parsePositiveInt(options.intervalMs ?? process.env.ATOMIC_BATCH_ASSIGNMENT_WORKER_INTERVAL_MS, DEFAULT_INTERVAL_MS);
    this.batchSize = parsePositiveInt(options.batchSize ?? process.env.ATOMIC_BATCH_ASSIGNMENT_BATCH_SIZE, DEFAULT_BATCH_SIZE);
    this.flushAfterMs = parsePositiveInt(options.flushAfterMs ?? process.env.ATOMIC_BATCH_ASSIGNMENT_FLUSH_AFTER_MS, DEFAULT_FLUSH_AFTER_MS);
    this.concurrency = parsePositiveInt(options.concurrency ?? process.env.ATOMIC_BATCH_ASSIGNMENT_WORKER_CONCURRENCY, DEFAULT_CONCURRENCY);
    this.manager = options.manager || relationshipSummaryManager;
    this.timer = null;
    this.running = false;
    this.stopped = false;
  }

  start() {
    if (this.timer || this.running) return;
    this.stopped = false;
    console.log(`[AtomicBatchAssignmentWorker] Started workerId=${this.workerId} intervalMs=${this.intervalMs} batchSize=${this.batchSize} flushAfterMs=${this.flushAfterMs}`);
    this.schedule(250);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[AtomicBatchAssignmentWorker] Stop requested');
  }

  schedule(delayMs = this.intervalMs) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick().catch(error => console.error('[AtomicBatchAssignmentWorker] Tick failed:', error.message));
    }, delayMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  async tick() {
    if (this.running || this.stopped) {
      this.schedule();
      return { claimed: 0, processed: 0 };
    }
    this.running = true;
    let delayMs = this.intervalMs;
    try {
      const result = await this.processAvailableBatch();
      delayMs = result.claimed > 0 ? 250 : this.intervalMs;
      return result;
    } catch (error) {
      console.error('[AtomicBatchAssignmentWorker] Tick failed:', error.message);
      return { claimed: 0, processed: 0, failed: 0, error: error.message };
    } finally {
      this.running = false;
      this.schedule(delayMs);
    }
  }

  async processAvailableBatch(options = {}) {
    const jobs = await claimAtomicBatchAssignmentBatch({
      batchSize: options.batchSize || this.batchSize,
      flushAfterMs: options.flushAfterMs ?? this.flushAfterMs,
      workerId: this.workerId,
      force: options.force === true
    });
    if (jobs.length === 0) return { claimed: 0, processed: 0, failed: 0 };

    try {
      const protos = await getProtoEventsForAssignmentJobs(jobs);
      const result = await this.manager.processProtoEventBatch(protos, {
        enqueueDetail: true,
        detailMode: 'incremental'
      });
      await completeAtomicBatchAssignmentJobs(jobs.map(job => job.id), result);
      console.log(`[AtomicBatchAssignmentWorker] Processed batch jobs=${jobs.length} protos=${protos.length} clusters=${result.cluster_count} summaries=${result.summary_ids.length}`);
      return { claimed: jobs.length, processed: protos.length, failed: 0, ...result };
    } catch (error) {
      await failAtomicBatchAssignmentJobs(jobs, error);
      throw error;
    }
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
