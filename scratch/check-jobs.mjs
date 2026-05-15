import 'dotenv/config';
import { query, closeDB } from '../lib/db/connection.mjs';

async function main() {
  try {
    // 1. Job状态分布
    const r1 = await query('SELECT status, COUNT(*)::int as cnt FROM relationship_summary_jobs GROUP BY status ORDER BY status');
    console.log('=== Job状态分布 ===');
    console.table(r1.rows);

    // 2. Active v2 summaries count
    const r2 = await query(`SELECT COUNT(*)::int as total FROM relationship_summaries WHERE summary_key LIKE 'kind:%' AND COALESCE(summary_status,'active')='active'`);
    console.log('\nActive v2 summaries:', r2.rows[0].total);

    // 3. Job type + status分布
    const r3 = await query('SELECT job_type, status, COUNT(*)::int as cnt FROM relationship_summary_jobs GROUP BY job_type, status ORDER BY job_type, status');
    console.log('\n=== Job类型+状态分布 ===');
    console.table(r3.rows);

    // 4. 最近的活跃/失败的job
    const r4 = await query(`SELECT id, summary_id, job_type, status, error, attempts, max_attempts, 
      created_at::text, updated_at::text 
      FROM relationship_summary_jobs 
      WHERE status IN ('pending','running','failed') 
      ORDER BY updated_at DESC LIMIT 15`);
    console.log('\n=== 最近活跃/失败 Jobs (top 15) ===');
    for (const row of r4.rows) {
      console.log(`  Job#${row.id} summary=${row.summary_id} type=${row.job_type} status=${row.status} attempts=${row.attempts}/${row.max_attempts} error=${(row.error || '').slice(0, 100)} updated=${row.updated_at}`);
    }

    // 5. 检查是否有running但卡住的job
    const r5 = await query(`SELECT id, summary_id, job_type, locked_by, locked_at::text, updated_at::text,
      EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - locked_at))::int AS locked_seconds
      FROM relationship_summary_jobs 
      WHERE status = 'running' 
      ORDER BY locked_at ASC LIMIT 10`);
    console.log('\n=== Running中的Jobs ===');
    if (r5.rows.length === 0) {
      console.log('  没有running状态的job');
    } else {
      for (const row of r5.rows) {
        console.log(`  Job#${row.id} summary=${row.summary_id} type=${row.job_type} locked_by=${row.locked_by} locked_seconds=${row.locked_seconds} updated=${row.updated_at}`);
      }
    }

    // 6. 检查pending job但attempts已达上限的
    const r6 = await query(`SELECT COUNT(*)::int as cnt FROM relationship_summary_jobs 
      WHERE status = 'pending' AND attempts >= max_attempts`);
    console.log('\n已达最大重试但仍pending的jobs:', r6.rows[0].cnt);

    // 7. 检查detail_rebuild jobs的pending总数
    const r7 = await query(`SELECT COUNT(*)::int as cnt FROM relationship_summary_jobs WHERE job_type = 'detail_rebuild' AND status = 'pending'`);
    console.log('Pending detail_rebuild jobs:', r7.rows[0].cnt);

    // 8. 最近完成的jobs
    const r8 = await query(`SELECT id, summary_id, job_type, status, completed_at::text, updated_at::text
      FROM relationship_summary_jobs 
      WHERE status = 'completed' 
      ORDER BY completed_at DESC LIMIT 5`);
    console.log('\n=== 最近完成的Jobs ===');
    for (const row of r8.rows) {
      console.log(`  Job#${row.id} summary=${row.summary_id} type=${row.job_type} completed=${row.completed_at}`);
    }

    // 9. 检查summary_merge jobs
    const r9 = await query(`SELECT status, COUNT(*)::int as cnt FROM relationship_summary_jobs WHERE job_type = 'summary_merge' GROUP BY status`);
    console.log('\n=== Summary Merge Jobs ===');
    console.table(r9.rows);

    // 10. 表大小
    const r10 = await query(`SELECT 
      (SELECT COUNT(*)::int FROM relationship_summaries) as summaries,
      (SELECT COUNT(*)::int FROM relationship_summary_members) as members,
      (SELECT COUNT(*)::int FROM relationship_summary_jobs) as jobs,
      (SELECT COUNT(*)::int FROM relationship_summary_edges) as edges,
      (SELECT COUNT(*)::int FROM atomic_event_relationships) as atomic_rels,
      (SELECT COUNT(*)::int FROM proto_events) as proto_events
    `);
    console.log('\n=== 表大小 ===');
    console.table(r10.rows);

  } finally {
    await closeDB();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
