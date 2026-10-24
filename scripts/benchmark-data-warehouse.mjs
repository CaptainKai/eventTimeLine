import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { closeDB, initDB, query } from '../lib/db/connection.mjs';

const RAW_SQL = `WITH members AS (SELECT summary_id,COUNT(*)::int AS member_count FROM relationship_summary_members GROUP BY summary_id),edges AS (SELECT summary_id,COUNT(*)::int AS edge_count FROM relationship_summary_edges GROUP BY summary_id) SELECT rs.id,COALESCE(m.member_count,0)::int AS member_count,COALESCE(e.edge_count,0)::int AS edge_count FROM relationship_summaries rs LEFT JOIN members m ON m.summary_id=rs.id LEFT JOIN edges e ON e.summary_id=rs.id WHERE COALESCE(rs.summary_status,'active')='active' ORDER BY member_count DESC,edge_count DESC,rs.id LIMIT 50`;
const DWS_SQL = `SELECT id,member_count::int,edge_count::int FROM relationship_summaries WHERE COALESCE(summary_status,'active')='active' ORDER BY member_count DESC,edge_count DESC,id LIMIT 50`;

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(Math.ceil(sorted.length * ratio) - 1, sorted.length - 1)];
}

async function measure(sql, iterations) {
  await query(sql);
  const durations = []; let rows = [];
  for (let index = 0; index < iterations; index++) {
    const started = performance.now(); const result = await query(sql); durations.push(performance.now() - started); rows = result.rows;
  }
  return { rows, durations, p50_ms: percentile(durations, 0.5), p95_ms: percentile(durations, 0.95), average_ms: durations.reduce((sum, value) => sum + value, 0) / durations.length };
}

function compareRows(rawRows, dwsRows) {
  const expected = new Map(rawRows.map(row => [Number(row.id), row])); let matched = 0;
  for (const row of dwsRows) {
    const raw = expected.get(Number(row.id));
    if (raw && Number(raw.member_count) === Number(row.member_count) && Number(raw.edge_count) === Number(row.edge_count)) matched++;
  }
  return { compared: dwsRows.length, matched, match_ratio: dwsRows.length ? matched / dwsRows.length : 1 };
}

export async function benchmarkWarehouse(options = {}) {
  const iterations = Math.max(Number(options.iterations || 7), 3);
  const raw = await measure(RAW_SQL, iterations); const dws = await measure(DWS_SQL, iterations);
  const counts = (await query(`SELECT (SELECT COUNT(*) FROM news)::int AS news,(SELECT COUNT(*) FROM proto_events)::int AS proto_events,(SELECT COUNT(*) FROM relationship_summaries)::int AS summaries,(SELECT COUNT(*) FROM atomic_event_relationships)::int AS relationships`)).rows[0];
  const quality = (await query(`SELECT COUNT(*)::int AS total,COUNT(stable_id)::int AS stable_ids,COUNT(*) FILTER(WHERE pipeline_run_id IS NOT NULL AND schema_version IS NOT NULL)::int AS versioned FROM news`)).rows[0];
  const improvement = raw.p50_ms / Math.max(dws.p50_ms, 0.001);
  return {
    generated_at: new Date().toISOString(), iterations, counts,
    raw_aggregation: { p50_ms: raw.p50_ms, p95_ms: raw.p95_ms, average_ms: raw.average_ms },
    dws_preaggregated: { p50_ms: dws.p50_ms, p95_ms: dws.p95_ms, average_ms: dws.average_ms },
    query_speedup: improvement,
    latency_reduction: 1 - dws.p50_ms / raw.p50_ms,
    result_consistency: compareRows(raw.rows, dws.rows),
    news_quality: { total: Number(quality.total), stable_id_coverage: Number(quality.stable_ids) / Number(quality.total), version_coverage: Number(quality.versioned) / Number(quality.total) },
  };
}

function markdown(report) {
  const percent = value => `${(value * 100).toFixed(2)}%`;
  return `# 数据仓库收益基准报告\n\n生成时间：${report.generated_at}\n\n## 数据规模\n\n- 新闻：${report.counts.news}\n- 原子事件：${report.counts.proto_events}\n- Summary：${report.counts.summaries}\n- 关系边：${report.counts.relationships}\n\n## 查询性能\n\n| 方案 | P50 | P95 | 平均 |\n| --- | ---: | ---: | ---: |\n| 现场 Join + 聚合 | ${report.raw_aggregation.p50_ms.toFixed(2)} ms | ${report.raw_aggregation.p95_ms.toFixed(2)} ms | ${report.raw_aggregation.average_ms.toFixed(2)} ms |\n| DWS 预聚合字段 | ${report.dws_preaggregated.p50_ms.toFixed(2)} ms | ${report.dws_preaggregated.p95_ms.toFixed(2)} ms | ${report.dws_preaggregated.average_ms.toFixed(2)} ms |\n\n- P50 加速：${report.query_speedup.toFixed(2)}x\n- P50 延迟降低：${percent(report.latency_reduction)}\n- Top 50 结果一致率：${percent(report.result_consistency.match_ratio)}\n\n## 治理覆盖率\n\n- 新闻稳定 ID 覆盖率：${percent(report.news_quality.stable_id_coverage)}\n- 新闻版本字段覆盖率：${percent(report.news_quality.version_coverage)}\n\n> 该结果来自本地 PostgreSQL 当前数据快照和 ${report.iterations} 次热查询，不代表生产集群 SLA。\n`;
}

async function main() {
  const iterationsArg = process.argv.find(value => value.startsWith('--iterations='));
  initDB();
  try {
    const report = await benchmarkWarehouse({ iterations: iterationsArg?.split('=')[1] });
    await mkdir('reports', { recursive: true });
    await writeFile('reports/data-warehouse-benchmark.json', JSON.stringify(report, null, 2));
    await writeFile('reports/data-warehouse-benchmark.md', markdown(report));
    console.log(JSON.stringify(report, null, 2));
  } finally { await closeDB(); }
}

if (import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) main().catch(error => { console.error(error); process.exitCode = 1; });
