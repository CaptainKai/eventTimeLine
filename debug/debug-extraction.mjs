#!/usr/bin/env node
/**
 * 调试实体提取和时间标准化 - 增强版本
 */

import { extractProtoEventsTraditionally, detectTopic } from '../apis/parsers/traditional-parser.mjs';
import { extractProtoEventsEnhanced } from '../apis/parsers/enhanced-parser.mjs';
import { extractAndLinkEntities } from '../lib/entities/entity-linking.mjs';
import { mapCameoCode } from '../apis/utils/parser.mjs';

const testCases = [
  {
    title: 'Protesters clash with police in Paris over new labor laws',
    content: 'Demonstrators threw stones and set fire to vehicles while police responded with tear gas on Saturday.'
  },
  {
    title: 'US and China reach preliminary consensus on maritime safety protocols during high-level summit',
    content: 'Delegates from both sides met in Tokyo to discuss risk reduction strategies. The meeting was held on April 15, 2026.'
  },
  {
    title: 'Global stock markets rally after inflation data beats expectations',
    content: 'Major indices including the S&P 500 and Dow Jones Industrial Average saw significant gains following positive economic indicators. Trading started at 9:30 AM yesterday.'
  },
  {
    title: 'North Korea launches ballistic missiles into Japan Sea',
    content: 'The missiles traveled approximately 4,000 kilometers before splashing down. Japan\'s defense ministry reported the launch early this morning.'
  },
  {
    title: 'UN Security Council to hold emergency session next week',
    content: 'The meeting is scheduled for Wednesday, April 22nd at 10:00 AM EST to discuss the ongoing crisis.'
  },
  {
    title: '中国宣布对美国商品加征关税，外交部回应相关问题',
    content: '北京时间4月18日下午，商务部发表声明称将对原产于美国的进口商品加征25%的关税。外交部发言人在今天的记者会上表示这是必要的反制措施。'
  }
];

console.log('=== 调试实体提取和时间标准化 (传统 vs 增强) ===\n');

for (let i = 0; i < testCases.length; i++) {
  const testCase = testCases[i];
  console.log(`\n【测试案例 ${i + 1}】`);
  console.log(`标题: ${testCase.title}`);
  console.log(`内容: ${testCase.content}`);
  console.log('---');

  try {
    // 传统解析器
    const traditionalResult = await extractProtoEventsTraditionally(testCase.title, testCase.content);
    console.log('\n【传统解析器结果】:');
    if (traditionalResult.proto_events && traditionalResult.proto_events.length > 0) {
      const pe = traditionalResult.proto_events[0];
      console.log(`  Actor: ${pe.actor}`);
      console.log(`  Action: ${pe.action}`);
      console.log(`  Object: ${pe.object}`);
      console.log(`  Location: ${pe.location}`);
      console.log(`  Time: ${pe.time}`);
    }

    // 增强解析器
    const enhancedResult = await extractProtoEventsEnhanced(testCase.title, testCase.content);
    console.log('\n【增强解析器结果】:');
    if (enhancedResult.proto_events && enhancedResult.proto_events.length > 0) {
      const pe = enhancedResult.proto_events[0];
      console.log(`  Actor: ${pe.actor}`);
      console.log(`  Action: ${pe.action}`);
      console.log(`  Object: ${pe.object}`);
      console.log(`  Location: ${pe.location}`);
      console.log(`  Time: ${pe.time}`);
      console.log(`  Matched Entities: ${pe.metadata.matched_entities?.map(e => e.name).join(', ') || 'none'}`);
    }

    console.log('\n【实体对齐结果】:');
    const linkedEntities = extractAndLinkEntities(testCase.title + ' ' + testCase.content);
    linkedEntities.slice(0, 5).forEach(({ original, entity }) => {
      if (entity) {
        console.log(`  "${original}" → ${entity.name} (${entity.type})`);
      }
    });

  } catch (error) {
    console.error('提取失败:', error);
  }

  console.log('='.repeat(80));
}
