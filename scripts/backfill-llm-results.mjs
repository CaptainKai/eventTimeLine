/**
 * 补充存储已有的 LLM 解析结果
 *
 * 逻辑：
 * 1. 查找有 proto_events 的新闻
 * 2. 根据 proto_events 的 metadata.extraction_mode 判断是否为 LLM 解析
 * 3. 如果是 LLM 解析但没有 llm_parse_results 记录，则补充存储
 */

import 'dotenv/config';
import { query } from '../lib/db/connection.mjs';
import { saveLlmParseResult } from '../lib/db/llm-parse-queries.mjs';
import { buildEventExtractionPrompt } from '../apis/parsers/llm-parser.mjs';

const DELAY_BETWEEN_CALLS = 100; // 写入间隔，避免数据库压力

/**
 * 获取需要补充的新闻列表
 */
async function getNewsNeedingLlmRecord() {
  const sql = `
    SELECT DISTINCT
      n.id as news_id,
      n.title,
      n.content,
      n.source,
      pe.raw_extraction->>'metadata' as metadata
    FROM news n
    JOIN proto_events pe ON pe.news_id = n.id
    LEFT JOIN llm_parse_results lpr ON lpr.news_id = n.id
    WHERE lpr.id IS NULL
      AND pe.raw_extraction IS NOT NULL
      AND pe.raw_extraction->>'metadata' IS NOT NULL
    ORDER BY n.id DESC
  `;

  const result = await query(sql);
  return result.rows;
}

/**
 * 检查是否为 LLM 解析的结果
 */
function isLlmParsed(metadataJson) {
  try {
    const metadata = typeof metadataJson === 'string' ? JSON.parse(metadataJson) : metadataJson;
    return metadata?.extraction_mode === 'llm_structured_v2' ||
           metadata?.extracted_at !== undefined ||
           metadata?.model_used !== undefined;
  } catch {
    return false;
  }
}

/**
 * 获取新闻的 proto_events 统计
 */
async function getProtoEventStats(newsId) {
  const sql = `
    SELECT
      COUNT(*) as proto_event_count,
      MIN(raw_extraction->>'model_used') as model_used,
      MIN(raw_extraction->>'extracted_at') as extracted_at
    FROM proto_events
    WHERE news_id = $1
  `;
  const result = await query(sql, [newsId]);
  return result.rows[0];
}

/**
 * 补充存储 LLM 解析结果
 */
async function backfillLlmResult(newsItem) {
  const { news_id, title, content } = newsItem;

  // 获取 proto_events 统计
  const stats = await getProtoEventStats(news_id);

  // 构建 prompt（用于记录）
  const prompt = buildEventExtractionPrompt(title, content);

  // 存储结果
  await saveLlmParseResult({
    news_id: news_id,
    prompt: prompt,
    raw_response: { note: 'backfilled from existing proto_events', proto_events: [] },
    proto_event_count: parseInt(stats.proto_event_count) || 0,
    model_used: stats.model_used || 'unknown',
    parse_duration_ms: null,
    status: 'success',
    error_message: null
  });

  console.log(`[Backfill] Saved LLM result for news ${news_id}, proto_events: ${stats.proto_event_count}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('补充存储 LLM 解析结果');
  console.log('='.repeat(60));

  // 获取需要补充的新闻
  console.log('\n[1] 查找需要补充的新闻...');
  const newsList = await getNewsNeedingLlmRecord();
  console.log(`找到 ${newsList.length} 条有 proto_events 但没有 LLM 记录的新闻`);

  if (newsList.length === 0) {
    console.log('没有需要补充的新闻');
    return;
  }

  // 筛选出 LLM 解析的新闻
  console.log('\n[2] 筛选 LLM 解析的新闻...');
  const llmParsedNews = newsList.filter(item => isLlmParsed(item.metadata));
  console.log(`其中 ${llmParsedNews.length} 条是 LLM 解析的`);

  if (llmParsedNews.length === 0) {
    console.log('没有 LLM 解析的新闻需要补充');
    return;
  }

  // 统计
  let success = 0;
  let failed = 0;

  // 补充存储
  console.log('\n[3] 开始补充存储...');
  for (let i = 0; i < llmParsedNews.length; i++) {
    const newsItem = llmParsedNews[i];

    try {
      await backfillLlmResult(newsItem);
      success++;

      // 进度显示
      if ((i + 1) % 50 === 0 || i === llmParsedNews.length - 1) {
        console.log(`\n进度: ${i + 1}/${llmParsedNews.length} (成功: ${success}, 失败: ${failed})`);
      }

      // 延迟
      if (i < llmParsedNews.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS));
      }
    } catch (error) {
      console.error(`[Backfill] Failed for news ${newsItem.news_id}:`, error.message);
      failed++;
    }
  }

  // 汇总
  console.log('\n' + '='.repeat(60));
  console.log('补充完成');
  console.log('='.repeat(60));
  console.log(`总计: ${llmParsedNews.length}`);
  console.log(`成功: ${success}`);
  console.log(`失败: ${failed}`);

  // 检查最终结果
  const finalCount = await query(`SELECT COUNT(*) as count FROM llm_parse_results`);
  console.log(`\nllm_parse_results 表当前记录数: ${finalCount.rows[0].count}`);
}

main()
  .then(() => {
    console.log('\n脚本执行完毕');
    process.exit(0);
  })
  .catch(err => {
    console.error('执行失败:', err);
    process.exit(1);
  });
