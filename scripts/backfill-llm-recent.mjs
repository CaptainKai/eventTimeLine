import { query } from '../lib/db/connection.mjs';
import { saveLlmParseResult } from '../lib/db/llm-parse-queries.mjs';
import { buildEventExtractionPrompt } from '../apis/parsers/llm-parser.mjs';

/**
 * 补充存储 LLM 解析结果
 * 条件：4月25日晚7点之后的重要新闻 (importance >= 0.4)，有 proto_events 但没有 llm_parse_results
 */

const CONFIG = {
  startDate: '2026-04-25 19:00:00', // 4月25日晚7点
  minImportance: 0.4,
  delayBetweenCalls: 100,
};

/**
 * 从 proto_events 重建 events JSON 结构
 * 模拟 LLM 输出格式
 */
function reconstructEventsFromProtoEvents(protoEvents) {
  const events = protoEvents.map(pe => {
    const actors = pe.actor_raw ? [pe.actor_raw] : [];
    const objects = pe.object_raw ? [pe.object_raw] : [];

    return {
      time: pe.event_time || '',
      action: pe.action_raw || '',
      actors: actors,
      objects: objects,
      location: pe.location_raw || '',
      confidence: pe.extraction_confidence || 1,
      event_type: pe.raw_extraction?.event_type || 'unknown',
      normalized_action: pe.action_raw || null,
    };
  });

  return { events };
}

async function main() {
  console.log('='.repeat(60));
  console.log('补充存储 LLM 解析结果');
  console.log('='.repeat(60));
  console.log(`筛选条件:`);
  console.log(`  - 时间: >= ${CONFIG.startDate}`);
  console.log(`  - 重要性: >= ${CONFIG.minImportance}`);
  console.log(`  - 有 proto_events 但没有 llm_parse_results`);

  // 查询符合条件的新闻
  const sql = `
    SELECT DISTINCT
      n.id as news_id,
      n.title,
      n.content,
      n.source,
      n.importance,
      n.created_at,
      COUNT(pe.id) as proto_event_count
    FROM news n
    JOIN proto_events pe ON pe.news_id = n.id
    LEFT JOIN llm_parse_results lpr ON lpr.news_id = n.id
    WHERE lpr.id IS NULL
      AND n.created_at >= $1
      AND n.importance >= $2
    GROUP BY n.id, n.title, n.content, n.source, n.importance, n.created_at
    ORDER BY n.created_at DESC
  `;

  const result = await query(sql, [CONFIG.startDate, CONFIG.minImportance]);
  console.log(`\n找到 ${result.rows.length} 条符合条件的新闻`);

  if (result.rows.length === 0) {
    console.log('没有需要补充的新闻');
    process.exit(0);
    return;
  }

  // 显示前几条
  console.log('\n前5条新闻:');
  result.rows.slice(0, 5).forEach((r, i) => {
    console.log(`  [${i + 1}] news_id: ${r.news_id}, importance: ${r.importance}, proto_events: ${r.proto_event_count}`);
    console.log(`      title: ${r.title?.slice(0, 40)}...`);
    console.log(`      created_at: ${r.created_at}`);
  });

  // 补充存储
  console.log('\n开始补充存储...');
  let success = 0;
  let failed = 0;

  for (let i = 0; i < result.rows.length; i++) {
    const newsItem = result.rows[i];

    try {
      // 查询该新闻的所有 proto_events
      const protoEventsResult = await query(`
        SELECT
          event_time,
          action_raw,
          actor_raw,
          object_raw,
          location_raw,
          extraction_confidence,
          raw_extraction
        FROM proto_events
        WHERE news_id = $1
        ORDER BY id
      `, [newsItem.news_id]);

      // 从 proto_events 重建 events JSON
      const reconstructedEvents = reconstructEventsFromProtoEvents(protoEventsResult.rows);

      // 构建 prompt（用于记录）
      const prompt = buildEventExtractionPrompt(newsItem.title, newsItem.content);

      // 存储结果
      await saveLlmParseResult({
        news_id: newsItem.news_id,
        prompt: prompt,
        raw_response: reconstructedEvents,
        proto_event_count: parseInt(newsItem.proto_event_count) || 0,
        model_used: 'backfilled',
        parse_duration_ms: null,
        status: 'success',
        error_message: null
      });

      success++;
      console.log(`[${i + 1}/${result.rows.length}] Saved: news ${newsItem.news_id}, proto_events: ${newsItem.proto_event_count}`);

      // 延迟
      if (i < result.rows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenCalls));
      }
    } catch (error) {
      console.error(`[${i + 1}/${result.rows.length}] Failed: news ${newsItem.news_id} - ${error.message}`);
      failed++;
    }
  }

  // 汇总
  console.log('\n' + '='.repeat(60));
  console.log('补充完成');
  console.log('='.repeat(60));
  console.log(`总计: ${result.rows.length}`);
  console.log(`成功: ${success}`);
  console.log(`失败: ${failed}`);

  // 检查最终结果
  const finalCount = await query(`SELECT COUNT(*) as count FROM llm_parse_results`);
  console.log(`\nllm_parse_results 表当前记录数: ${finalCount.rows[0].count}`);

  process.exit(0);
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
