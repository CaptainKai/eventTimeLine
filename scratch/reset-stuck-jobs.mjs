import 'dotenv/config';
import { query, closeDB } from '../lib/db/connection.mjs';

async function resetJobs() {
  try {
    console.log('Force cleaning jobs table...');
    
    // 1. 删除所有 failed 状态的 job，避免唯一键冲突
    const r1 = await query(`DELETE FROM relationship_summary_jobs WHERE status = 'failed'`);
    console.log(`Deleted ${r1.rowCount} failed jobs.`);

    // 2. 将 running 重置为 pending
    const r2 = await query(`
      UPDATE relationship_summary_jobs 
      SET status = 'pending', attempts = 0, locked_by = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE status = 'running'
    `);
    console.log(`Reset ${r2.rowCount} running jobs to pending.`);

    // 3. 重置所有 pending 的尝试次数
    await query(`UPDATE relationship_summary_jobs SET attempts = 0 WHERE status = 'pending'`);

    // 4. 同步重置 relationship_summaries 的状态
    await query(`
      UPDATE relationship_summaries 
      SET detail_status = 'pending', detail_error = NULL, updated_at = CURRENT_TIMESTAMP
    `);
    console.log('System state reset to clean pending.');

  } finally {
    await closeDB();
  }
}

resetJobs().catch(console.error);
