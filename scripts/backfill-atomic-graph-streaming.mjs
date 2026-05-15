#!/usr/bin/env node

import 'dotenv/config';
import { closeDB, query, withAdvisoryLock } from '../lib/db/connection.mjs';
import { 
  clearAtomicRelationshipGraph, 
  getAtomicRelationshipGraphTableCounts 
} from '../lib/db/relationship-summary-queries.mjs';
import { relationshipSummaryManager } from '../lib/analysis/relationship-summary-manager.mjs';

const BACKFILL_LOCK_KEY = [20260514, 88888];
const BATCH_SIZE = 200; // 每批读取的数量

async function backfillStreaming(options = {}) {
  const stats = {
    total_protos: 0,
    processed_count: 0,
    start_time: Date.now(),
    last_log_time: Date.now()
  };

  // 1. 获取总数
  const countResult = await query('SELECT COUNT(*)::int as total FROM proto_events');
  stats.total_protos = countResult.rows[0].total;
  console.log(`[Backfill] Starting streaming backfill for ${stats.total_protos} proto_events...`);

  // 2. 清空现有原子图数据
  if (!options.resume) {
    console.log('[Backfill] Clearing existing atomic graph data...');
    await clearAtomicRelationshipGraph();
    console.log('[Backfill] Tables truncated.');
  }

  // 3. 流式读取并处理
  let offset = 0;
  while (offset < stats.total_protos) {
    const batch = await query(`
      SELECT pe.*, 
        COALESCE(pe.event_time, n.published_at, pe.created_at) AS effective_time
      FROM proto_events pe
      LEFT JOIN news n ON n.id = pe.news_id
      ORDER BY COALESCE(pe.event_time, n.published_at, pe.created_at) ASC, pe.id ASC
      LIMIT $1 OFFSET $2
    `, [BATCH_SIZE, offset]);

    if (batch.rows.length === 0) break;

    for (const proto of batch.rows) {
      const tStart = Date.now();
      try {
        // 使用同步重建模式，严格按时间序处理
        await relationshipSummaryManager.assignProtoEventToSummaries(proto, {
          syncRebuild: true,
          detailMode: 'incremental',
          enqueueMerge: true
        });

        const tEnd = Date.now();
        stats.processed_count++;
        
        // 记录慢操作
        if (tEnd - tStart > 500) {
          console.warn(`[Backfill] Slow proto ${proto.id}: ${tEnd - tStart}ms`);
        }
      } catch (err) {
        console.error(`[Backfill] Error processing proto ${proto.id}:`, err.message);
      }

      if (Date.now() - stats.last_log_time > 5000) {
        const now = Date.now();
        const elapsed = (now - stats.start_time) / 1000;
        const speed = (stats.processed_count / elapsed).toFixed(2);
        
        // 计算瞬时速度
        const instantElapsed = (now - stats.last_log_time) / 1000;
        const instantProcessed = stats.processed_count - (stats.last_processed_count || 0);
        const instantSpeed = (instantProcessed / instantElapsed).toFixed(2);
        stats.last_processed_count = stats.processed_count;

        const percent = ((stats.processed_count / stats.total_protos) * 100).toFixed(2);
        console.log(`[Backfill] Progress: ${stats.processed_count}/${stats.total_protos} (${percent}%) - Avg: ${speed} p/s - Instant: ${instantSpeed} p/s - Current: ${proto.effective_time}`);
        stats.last_log_time = now;
      }
    }
    offset += BATCH_SIZE;
  }
  return stats;
}

async function main() {
  const startedAt = Date.now();
  try {
    const stats = await withAdvisoryLock(BACKFILL_LOCK_KEY, () => backfillStreaming({
      resume: process.argv.includes('--resume')
    }), {
      errorMessage: 'Another backfill process is running.'
    });

    const finalCounts = await getAtomicRelationshipGraphTableCounts();
    console.log('[Backfill] Completed successfully!', {
      processed: stats.processed_count,
      duration_seconds: ((Date.now() - startedAt) / 1000).toFixed(1),
      table_counts: finalCounts
    });
  } catch (err) {
    console.error('[Backfill] Fatal error:', err);
    process.exit(1);
  } finally {
    await closeDB();
  }
}

main();
