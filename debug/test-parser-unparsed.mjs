import { extractWithSelectedParser } from '../lib/pipeline/parser-selector.mjs';
import { extractProtoEventsWithLLM } from '../apis/parsers/llm-parser.mjs';
import { query } from '../lib/db/connection.mjs';

async function testParser() {
  // 获取几条未解析的 jin10 新闻
  const sql = `
    SELECT n.id, n.title, n.content, n.importance
    FROM news n
    LEFT JOIN proto_events pe ON n.id = pe.news_id
    WHERE pe.id IS NULL AND n.source = 'jin10'
    ORDER BY n.created_at DESC
    LIMIT 3
  `;

  const result = await query(sql);
  console.log('测试解析器对未解析新闻的效果:\n');

  for (const row of result.rows) {
    console.log('='.repeat(60));
    console.log(`新闻 ID: ${row.id}`);
    console.log(`标题: ${row.title}`);
    console.log(`内容: ${row.content?.slice(0, 100)}...`);
    console.log(`重要性: ${row.importance}`);
    console.log();

    // 测试默认解析器
    console.log('[Enhanced Parser 结果]');
    const enhancedResult = await extractWithSelectedParser(row.title, row.content, { source: 'jin10', importance: row.importance });
    console.log(`  proto_events 数量: ${enhancedResult.proto_events?.length || 0}`);
    if (enhancedResult.proto_events?.length > 0) {
      enhancedResult.proto_events.forEach((pe, i) => {
        console.log(`  [${i + 1}] ${pe.actor} ${pe.action} ${pe.object || ''}`);
      });
    }
    console.log();

    // 测试 LLM 解析器
    console.log('[LLM Parser 结果]');
    const llmResult = await extractProtoEventsWithLLM(row.title, row.content, { saveResult: false });
    console.log(`  proto_events 数量: ${llmResult.proto_events?.length || 0}`);
    if (llmResult.proto_events?.length > 0) {
      llmResult.proto_events.forEach((pe, i) => {
        console.log(`  [${i + 1}] ${pe.actor} ${pe.action} ${pe.object || ''}`);
      });
    }
    console.log();
  }

  process.exit(0);
}

testParser().catch(console.error);
