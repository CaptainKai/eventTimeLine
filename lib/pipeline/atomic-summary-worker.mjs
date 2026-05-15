import { claimRelationshipSummaryJobs } from '../db/relationship-summary-queries.mjs';
import { relationshipSummaryManager } from '../analysis/relationship-summary-manager.mjs';

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_CONCURRENCY = 1;

let activeWorker = null;

export function startAtomicSummaryWorker(options = {}) {
  const enabled = options.enabled ?? (process.env.ATOMIC_SUMMARY_WORKER_ENABLED !== 'false');
  if (!enabled) {
    console.log('[AtomicSummaryWorker] Disabled by ATOMIC_SUMMARY_WORKER_ENABLED=false');
    return null;
  }

  if (activeWorker) {
    return activeWorker;
  }

  const worker = new AtomicSummaryWorker(options);
  activeWorker = worker;
  worker.start();
  return worker;
}

export function stopAtomicSummaryWorker() {
  if (!activeWorker) return;
  activeWorker.stop();
  activeWorker = null;
}

export class AtomicSummaryWorker {
  constructor(options = {}) {
    this.workerId = options.workerId || `atomic-summary-worker:${process.pid}:${Date.now()}`;
    this.intervalMs = parsePositiveInt(options.intervalMs ?? process.env.ATOMIC_SUMMARY_WORKER_INTERVAL_MS, DEFAULT_INTERVAL_MS);
    this.batchSize = parsePositiveInt(options.batchSize ?? process.env.ATOMIC_SUMMARY_WORKER_BATCH_SIZE, DEFAULT_BATCH_SIZE);
    this.concurrency = parsePositiveInt(options.concurrency ?? process.env.ATOMIC_SUMMARY_WORKER_CONCURRENCY, DEFAULT_CONCURRENCY);
    this.staleAfterMs = parsePositiveInt(options.staleAfterMs ?? process.env.ATOMIC_SUMMARY_WORKER_STALE_AFTER_MS, 15 * 60 * 1000);
    this.manager = options.manager || relationshipSummaryManager;
    this.timer = null;
    this.running = false;
    this.stopped = false;
  }

  start() {
    if (this.timer || this.running) return;
    this.stopped = false;
    console.log(`[AtomicSummaryWorker] Started workerId=${this.workerId} intervalMs=${this.intervalMs} batchSize=${this.batchSize} concurrency=${this.concurrency}`);
    this.schedule(250);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[AtomicSummaryWorker] Stop requested');
  }

  schedule(delayMs = this.intervalMs) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick().catch(error => {
        console.error('[AtomicSummaryWorker] Tick failed:', error.message);
      });
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
      const result = await this.processAvailableJobs();
      delayMs = result.claimed > 0 ? 250 : this.intervalMs;
      return result;
    } catch (error) {
      console.error('[AtomicSummaryWorker] Tick failed:', error.message);
      return { claimed: 0, processed: 0, failed: 0, error: error.message };
    } finally {
      this.running = false;
      this.schedule(delayMs);
    }
  }

  async processAvailableJobs() {
    const jobs = await claimRelationshipSummaryJobs({
      limit: this.batchSize,
      workerId: this.workerId,
      staleAfterMs: this.staleAfterMs
    });

    if (jobs.length === 0) {
      return { claimed: 0, processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;
    const queue = [...jobs];
    const workerCount = Math.min(this.concurrency, queue.length);

    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const job = queue.shift();
        try {
          await this.manager.processSummaryJob(job);
          processed += 1;
        } catch (error) {
          failed += 1;
          console.error(`[AtomicSummaryWorker] Job ${job.id} failed:`, error.message);
        }
      }
    }));

    return { claimed: jobs.length, processed, failed };
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
