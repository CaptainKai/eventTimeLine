import 'dotenv/config';
import { query, closeDB } from '../lib/db/connection.mjs';

async function main() {
  try {
    // 1. 查看running job对应的summary的成员数量
    const r1 = await query(`
      SELECT j.id as job_id, j.summary_id, j.locked_by, j.locked_at::text,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - j.locked_at))::int AS locked_seconds,
        rs.member_count, rs.edge_count, rs.summary_kind, rs.title
      FROM relationship_summary_jobs j
      JOIN relationship_summaries rs ON rs.id = j.summary_id
      WHERE j.status = 'running'
      ORDER BY rs.member_count DESC
    `);
    console.log('=== Running Jobs 及其 Summary 成员数 ===');
    for (const row of r1.rows) {
      console.log(`  Job#${row.job_id} summary=${row.summary_id} members=${row.member_count} edges=${row.edge_count} locked_sec=${row.locked_seconds} kind=${row.summary_kind}`);
      console.log(`    title: ${(row.title || '').slice(0, 80)}`);
    }

    // 2. 查看所有pending job对应summary的成员数量分布
    const r2 = await query(`
      SELECT 
        CASE 
          WHEN rs.member_count <= 10 THEN '1-10'
          WHEN rs.member_count <= 50 THEN '11-50'
          WHEN rs.member_count <= 100 THEN '51-100'
          WHEN rs.member_count <= 500 THEN '101-500'
          WHEN rs.member_count <= 1000 THEN '501-1000'
          WHEN rs.member_count <= 5000 THEN '1001-5000'
          ELSE '5000+'
        END as member_range,
        COUNT(*)::int as job_count,
        MIN(rs.member_count)::int as min_members,
        MAX(rs.member_count)::int as max_members,
        AVG(rs.member_count)::int as avg_members
      FROM relationship_summary_jobs j
      JOIN relationship_summaries rs ON rs.id = j.summary_id
      WHERE j.status IN ('pending', 'running')
      GROUP BY member_range
      ORDER BY min_members
    `);
    console.log('\n=== Pending/Running Jobs 成员数分布 ===');
    console.table(r2.rows);

    // 3. 成员数最大的前10个pending job
    const r3 = await query(`
      SELECT j.id as job_id, j.summary_id, rs.member_count, rs.edge_count, rs.title
      FROM relationship_summary_jobs j
      JOIN relationship_summaries rs ON rs.id = j.summary_id
      WHERE j.status IN ('pending', 'running')
      ORDER BY rs.member_count DESC
      LIMIT 10
    `);
    console.log('\n=== 成员数最多的 Pending/Running Jobs (Top 10) ===');
    for (const row of r3.rows) {
      const pairs = row.member_count * (row.member_count - 1) / 2;
      console.log(`  Job#${row.job_id} summary=${row.summary_id} members=${row.member_count} edges=${row.edge_count} pairs_to_compare=${pairs}`);
      console.log(`    title: ${(row.title || '').slice(0, 80)}`);
    }

    // 4. 估算总工作量
    const r4 = await query(`
      SELECT 
        SUM(rs.member_count * (rs.member_count - 1) / 2)::bigint as total_pairs,
        SUM(rs.member_count)::bigint as total_members,
        COUNT(*)::int as total_jobs
      FROM relationship_summary_jobs j
      JOIN relationship_summaries rs ON rs.id = j.summary_id
      WHERE j.status IN ('pending', 'running')
    `);
    console.log('\n=== 总工作量估算 ===');
    console.log(`  总pending/running jobs: ${r4.rows[0].total_jobs}`);
    console.log(`  总成员数: ${r4.rows[0].total_members}`);
    console.log(`  总pair比较数: ${r4.rows[0].total_pairs}`);

    // 5. 检查failed的jobs的错误信息
    const r5 = await query(`
      SELECT j.id, j.summary_id, j.error, j.attempts, j.max_attempts, rs.member_count
      FROM relationship_summary_jobs j
      JOIN relationship_summaries rs ON rs.id = j.summary_id
      WHERE j.status = 'failed'
      ORDER BY j.updated_at DESC LIMIT 10
    `);
    console.log('\n=== Failed Jobs 错误信息 ===');
    for (const row of r5.rows) {
      console.log(`  Job#${row.id} summary=${row.summary_id} members=${row.member_count} attempts=${row.attempts}/${row.max_attempts}`);
      console.log(`    error: ${(row.error || '').slice(0, 200)}`);
    }

    // 6. 检查relationship_summary_edges的写入速度 (看最近完成的job的实际耗时)
    const r6 = await query(`
      SELECT j.id, j.summary_id, rs.member_count, rs.edge_count,
        j.locked_at::text, j.completed_at::text,
        EXTRACT(EPOCH FROM (j.completed_at - j.locked_at))::int AS duration_seconds
      FROM relationship_summary_jobs j
      JOIN relationship_summaries rs ON rs.id = j.summary_id
      WHERE j.status = 'completed' AND j.completed_at IS NOT NULL AND j.locked_at IS NOT NULL
      ORDER BY j.completed_at DESC
      LIMIT 10
    `);
    console.log('\n=== 最近完成的Job耗时 ===');
    for (const row of r6.rows) {
      const pairsCompared = row.member_count * (row.member_count - 1) / 2;
      console.log(`  Job#${row.id} summary=${row.summary_id} members=${row.member_count} edges=${row.edge_count} pairs=${pairsCompared} duration=${row.duration_seconds}s`);
    }

  } finally {
    await closeDB();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
