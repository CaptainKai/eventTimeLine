import { query } from '../lib/db/connection.mjs';

async function check() {
  console.log('=== proto_events metadata 情况 ===\n');

  const stats = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(raw_extraction) as with_raw_extraction,
      COUNT(raw_extraction->>'metadata') as with_metadata
    FROM proto_events
  `);
  console.log('proto_events 统计:', stats.rows[0]);

  // 检查 extraction_mode 分布
  const modes = await query(`
    SELECT
      raw_extraction->'metadata'->>'extraction_mode' as extraction_mode,
      COUNT(*) as count
    FROM proto_events
    WHERE raw_extraction IS NOT NULL
    GROUP BY raw_extraction->'metadata'->>'extraction_mode'
    ORDER BY count DESC
  `);
  console.log('\nextraction_mode 分布:');
  modes.rows.forEach(r => console.log(`  ${r.extraction_mode || 'null'}: ${r.count}`));

  // 检查 llm_parse_results 数量
  const llmCount = await query('SELECT COUNT(*) as count FROM llm_parse_results');
  console.log(`\nllm_parse_results 记录数: ${llmCount.rows[0].count}`);

  // 检查有多少新闻有 proto_events 但没有 llm_parse_results
  const missingLlm = await query(`
    SELECT COUNT(DISTINCT n.id) as count
    FROM news n
    JOIN proto_events pe ON pe.news_id = n.id
    LEFT JOIN llm_parse_results lpr ON lpr.news_id = n.id
    WHERE lpr.id IS NULL
  `);
  console.log(`有 proto_events 但没有 llm_parse_results 的新闻: ${missingLlm.rows[0].count}`);

  // 检查 model_used 分布
  const models = await query(`
    SELECT
      raw_extraction->'metadata'->>'model_used' as model_used,
      COUNT(*) as count
    FROM proto_events
    WHERE raw_extraction IS NOT NULL
    GROUP BY raw_extraction->'metadata'->>'model_used'
    ORDER BY count DESC
  `);
  console.log('\nmodel_used 分布:');
  models.rows.forEach(r => console.log(`  ${r.model_used || 'null'}: ${r.count}`));

  process.exit(0);
}

check().catch(console.error);
