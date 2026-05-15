/**
 * LLM Parser Three-Stage Test Script
 *
 * 测试三阶段 LLM 提取效果，对比改进前后
 */

import { extractProtoEventsWithLLM } from '../apis/parsers/llm-parser.mjs';
import { processLlmProtoEvents } from '../lib/pipeline/post-processing.mjs';
import { query } from '../lib/db/connection.mjs';

async function testThreeStageExtraction() {
  console.log('=== LLM Parser Three-Stage Test ===\n');

  // 获取测试新闻
  const newsResult = await query(`
    SELECT id, title, content, source, importance, published_at
    FROM news
    WHERE LENGTH(content) > 300 AND source = 'jin10'
    ORDER BY published_at DESC
    LIMIT 3
  `);

  const testNews = newsResult.rows;

  for (const news of testNews) {
    console.log('========================================');
    console.log(`Testing News ID: ${news.id}`);
    console.log(`Title: ${news.title}`);
    console.log(`Source: ${news.source} | Importance: ${news.importance}`);
    console.log(`Content length: ${news.content.length}`);
    console.log('========================================\n');

    // 跳过内容太短的新闻
    if (news.content.length < 100) {
      console.log('Content too short, skipping...\n');
      continue;
    }

    try {
      // Step 1: 调用 LLM 三阶段提取
      console.log('[Step 1] Calling extractProtoEventsWithLLM...');
      const extractionResult = await extractProtoEventsWithLLM(news.title, news.content, {
        newsId: news.id,
        saveResult: true
      });

      console.log(`[Result] Extracted ${extractionResult.proto_events?.length || 0} proto-events`);
      console.log(`[Metadata] extraction_mode: ${extractionResult.metadata?.extraction_mode}`);
      console.log(`[Metadata] stage1_event_count: ${extractionResult.metadata?.stage1_event_count}`);
      console.log(`[Metadata] normalized_entity_count: ${extractionResult.metadata?.normalized_entity_count}`);
      console.log(`[Metadata] normalized_action_count: ${extractionResult.metadata?.normalized_action_count}`);
      console.log('');

      // 打印每个 proto-event
      for (let i = 0; i < (extractionResult.proto_events?.length || 0); i++) {
        const proto = extractionResult.proto_events[i];
        console.log(`--- ProtoEvent ${i + 1} ---`);
        console.log(`  Actor: ${proto.actor}`);
        console.log(`  Action: ${proto.action}`);
        console.log(`  Object: ${proto.object}`);
        console.log(`  Location: ${proto.location}`);
        console.log(`  Time: ${proto.time}`);
        console.log(`  Confidence: ${proto.confidence}`);
        if (proto.metadata?.details && Object.keys(proto.metadata.details).length > 0) {
          console.log(`  Details: ${JSON.stringify(proto.metadata.details)}`);
        }
        if (proto.metadata?.temporal_status) {
          console.log(`  Temporal Status: ${proto.metadata.temporal_status}`);
        }
        if (proto.metadata?.action_category) {
          console.log(`  Action Category: ${proto.metadata.action_category}`);
        }
        if (proto.metadata?.is_standard_action !== undefined) {
          console.log(`  Is Standard Action: ${proto.metadata.is_standard_action}`);
        }
        if (proto.metadata?.evidence_snippet) {
          console.log(`  Evidence: ${proto.metadata.evidence_snippet.substring(0, 80)}...`);
        }
        console.log('');
      }

      // Step 2: 调用 LLM 专用后处理
      console.log('[Step 2] Calling processLlmProtoEvents...');
      const processedResult = await processLlmProtoEvents(extractionResult, { newsId: news.id });
      console.log(`[Result] After processing: ${processedResult.proto_events?.length || 0} proto-events\n`);

    } catch (error) {
      console.error('[ERROR]', error.message);
      console.error(error.stack);
    }

    console.log('\n');
  }

  // 检查 entity_mapping 表中的层级关系
  console.log('========================================');
  console.log('=== Checking entity_mapping for parent_entity_id ===');
  console.log('========================================\n');

  const entityResult = await query(`
    SELECT id, raw_name, canonical_name, entity_type, parent_entity_id, entity_subtype
    FROM entity_mapping
    WHERE parent_entity_id IS NOT NULL
    ORDER BY id DESC
    LIMIT 20
  `);

  if (entityResult.rows.length === 0) {
    console.log('No entities with parent_entity_id found yet (expected - LLM has not normalized many yet)');
  } else {
    console.log(`Found ${entityResult.rows.length} entities with parent_entity_id:`);
    for (const row of entityResult.rows) {
      console.log(`  [${row.id}] ${row.raw_name} -> ${row.canonical_name} (${row.entity_type})`);
      console.log(`       parent_entity_id: ${row.parent_entity_id}`);
    }
  }

  process.exit(0);
}

testThreeStageExtraction().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});