/**
 * 解析器优化测试脚本
 */
import { extractProtoEventsTraditionally } from '../apis/parsers/traditional-parser.mjs';
import { extractProtoEventsEnhanced } from '../apis/parsers/enhanced-parser.mjs';
import { deduplicateWithinBatch } from '../lib/pipeline/post-processing.mjs';

async function testTraditionalParser() {
  console.log('=== 测试传统解析器 ===\n');

  const testCases = [
    {
      title: 'PRESIDENT Consult on military in Nkandla, KwaZulu-Natal, South Africa',
      content: 'The President of South Africa consulted with military officials about the situation in Nkandla.'
    },
    {
      title: '中国商务部：对美国进口商品征收关税',
      content: '中国商务部今日宣布，对美国进口商品征收关税。'
    }
  ];

  for (const tc of testCases) {
    console.log(`测试: ${tc.title}`);
    const result = await extractProtoEventsTraditionally(tc.title, tc.content);
    console.log(`  提取到 ${result.proto_events.length} 条原子事实:`);
    for (const proto of result.proto_events) {
      console.log(`    Actor: "${proto.actor}", Action: "${proto.action}", Object: "${proto.object}"`);
    }
    console.log('');
  }
}

async function testDeduplication() {
  console.log('\n=== 测试去重功能 ===\n');

  const protoEvents = [
    { actor: 'Consult', action: 'Exhibit force posture', object: 'Nkandla Kwa' },
    { actor: 'Consult', action: 'Exhibit force posture', object: 'Nkandla Kwa' },
    { actor: 'South Africa', action: 'Consult', object: 'military in' },
    { actor: 'South Africa', action: 'Consult', object: 'military in' },
    { actor: 'USA', action: 'Make statement', object: 'China' },
  ];

  console.log(`去重前: ${protoEvents.length} 条`);
  const deduped = deduplicateWithinBatch(protoEvents);
  console.log(`去重后: ${deduped.length} 条`);
  for (const p of deduped) {
    console.log(`  - ${p.actor} / ${p.action} / ${p.object}`);
  }
}

async function runTests() {
  try {
    await testTraditionalParser();
    await testDeduplication();
    console.log('\n测试完成!');
  } catch (error) {
    console.error('测试失败:', error);
  }
  process.exit(0);
}

runTests();