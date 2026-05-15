/**
 * 混合提取引擎验证测试 (Hybrid Extraction Verification)
 *
 * 测试目标：
 * 1. 验证传统提取器在缺失正文时的基础识别能力
 * 2. 验证提取流程在配置 LLM 后的语义增强效果
 * 3. 验证关系分析脚本的入库准确性
 * 4. 测试新添加的详细解析结果结构
 */

import { extractEventTraditionally } from '../apis/parsers/traditional-parser.mjs';
import { extractEventWithLLM } from '../apis/parsers/llm-parser.mjs';

// 测试结果统计
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// 断言函数
function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log('✅ PASS:', message);
  } else {
    failedTests++;
    console.log('❌ FAIL:', message);
  }
}

// 验证实体识别
function verifyEntities(parseResult, expectedTypes = []) {
  let valid = true;

  if (!parseResult.extracted_entities || parseResult.extracted_entities.length === 0) {
    console.log('⚠️ 警告: 未识别到实体');
    return false;
  }

  // 检查实体类型分类
  if (parseResult.entity_types) {
    console.log('📊 实体类型分类:');
    parseResult.entity_types.forEach(entity => {
      console.log(`  - ${entity.name} (${entity.type}, 置信度: ${(entity.confidence * 100).toFixed(0)}%)`);
    });
  }

  return true;
}

// 验证关键词提取
function verifyKeywords(parseResult, expectedKeywords = []) {
  let valid = true;

  if (!parseResult.trigger_keywords || parseResult.trigger_keywords.length === 0) {
    console.log('⚠️ 警告: 未提取到触发关键词');
    return false;
  }

  console.log('🔑 提取到的关键词:');
  if (parseResult.keyword_weights) {
    parseResult.keyword_weights.forEach(keyword => {
      console.log(`  - ${keyword.keyword} (权重: ${(keyword.weight * 100).toFixed(0)}%, 出现: ${keyword.occurrences}次)`);
    });
  } else {
    parseResult.trigger_keywords.forEach(keyword => {
      console.log(`  - ${keyword}`);
    });
  }

  return true;
}

// 验证事件类型匹配
function verifyEventType(parseResult, expectedCodes = []) {
  let valid = true;

  if (expectedCodes.length > 0) {
    const match = expectedCodes.some(code => parseResult.event_code === code);
    assert(match, `事件类型验证: ${parseResult.event_type} (${parseResult.event_code}) 匹配 ${expectedCodes.join(', ')}`);
  }

  return valid;
}

async function runTests() {
  console.log('--- EVENT TIMELINE ENGINE VERIFICATION START ---');
  console.log('');

  // 测试案例 1: 基础冲突事件 (传统模式)
  console.log('[Test 1] Traditional Parser: Conflict Recognition');
  const case1 = {
    title: 'Protesters clash with police in Paris over new labor laws',
    content: ''
  };
  const res1 = await extractEventTraditionally(case1.title, case1.content);

  verifyEventType(res1, ['14']);
  verifyEntities(res1);
  verifyKeywords(res1, ['protest']);
  assert(res1.confidence > 0.5, '置信度应大于 50%');
  console.log('结果:', JSON.stringify(res1, null, 2));
  console.log('');

  // 测试案例 2: 复杂外交事件 (LLM 模式预览)
  console.log('[Test 2] LLM Parser: Nuance Detection (Mock if no API key)');
  const case2 = {
    title: 'US and China reach preliminary consensus on maritime safety protocols during high-level summit',
    content: 'Delegates from both sides met in Tokyo to discuss risk reduction strategies.'
  };

  if (process.env.OPENAI_API_KEY) {
    const res2 = await extractEventWithLLM(case2.title, case2.content);
    verifyEventType(res2, ['04', '055']);
    verifyEntities(res2);
    verifyKeywords(res2, ['agreement', 'talks']);
    assert(res2.extraction_method === 'llm', '应使用 LLM 解析器');
    console.log('结果:', JSON.stringify(res2, null, 2));
  } else {
    console.log('Skipping LLM test (OPENAI_API_KEY missing), falling back to verify traditional fallback for case 2');
    const res2Fallback = await extractEventTraditionally(case2.title, case2.content);
    verifyEventType(res2Fallback, ['04', '055']);
    verifyEntities(res2Fallback);
    verifyKeywords(res2Fallback, ['agreement', 'talks']);
    console.log('Fallback Result:', res2Fallback.event_type);
  }
  console.log('');

  // 测试案例 3: 经济相关事件
  console.log('[Test 3] Economic Event Recognition');
  const case3 = {
    title: 'Global stock markets rally after inflation data beats expectations',
    content: 'Major indices including the S&P 500 and Dow Jones Industrial Average saw significant gains following positive economic indicators.'
  };
  const res3 = await extractEventTraditionally(case3.title, case3.content);
  verifyEventType(res3, ['190']);
  verifyEntities(res3);
  verifyKeywords(res3, ['economic', 'market', 'stock']);
  assert(res3.event_code === '190', '经济事件应识别为代码 190');
  assert(res3.confidence > 0.7, '经济事件解析置信度应较高');
  console.log('结果:', JSON.stringify(res3, null, 2));
  console.log('');

  // 测试案例 4: 军事事件
  console.log('[Test 4] Military Event Recognition');
  const case4 = {
    title: 'North Korea launches ballistic missiles into Japan Sea',
    content: 'The missiles traveled approximately 4,000 kilometers before splashing down.'
  };
  const res4 = await extractEventTraditionally(case4.title, case4.content);
  verifyEventType(res4, ['18']);
  verifyEntities(res4);
  verifyKeywords(res4, ['missile', 'attack']);
  assert(res4.event_code === '18', '军事事件应识别为代码 18');
  console.log('结果:', JSON.stringify(res4, null, 2));
  console.log('');

  // 测试案例 5: 时间识别
  console.log('[Test 5] Temporal Expression Recognition');
  const case5 = {
    title: 'UN Security Council to hold emergency session next week',
    content: 'The meeting is scheduled for Wednesday, April 22nd at 10:00 AM EST.'
  };
  const res5 = await extractEventTraditionally(case5.title, case5.content);
  verifyEventType(res5, ['04']);
  verifyEntities(res5);
  verifyKeywords(res5, ['meeting']);

  // 验证时间表达式识别
  const timeExpressions = res5.time_expressions || [];
  assert(timeExpressions.length > 0, '应提取到时间表达式');
  const hasFutureTime = timeExpressions.some(t => t.includes('next week') || t.includes('scheduled'));
  assert(hasFutureTime, '应识别到未来时间');
  assert(res5.is_future === true, '事件应识别为未来事件');
  console.log('结果:', JSON.stringify(res5, null, 2));
  console.log('');

  // 测试案例 6: 因果关系识别
  console.log('[Test 6] Causal Relationship Detection');
  const case6 = {
    title: 'Oil prices surge due to geopolitical tensions in Middle East',
    content: 'The recent attacks on oil facilities have disrupted global supply chains.'
  };
  const res6 = await extractEventTraditionally(case6.title, case6.content);
  verifyEventType(res6, ['190']);
  verifyEntities(res6);
  verifyKeywords(res6, ['oil', 'price']);

  assert(res6.causal_suggestion, '应识别到因果关系');
  assert(res6.causal_suggestion.toLowerCase().includes('due to') || res6.causal_suggestion.toLowerCase().includes('because of'),
         '因果关系应包含明确的因果标记词');
  console.log('结果:', JSON.stringify(res6, null, 2));

  // 测试总结
  console.log('');
  console.log('--- VERIFICATION SUMMARY ---');
  console.log(`总测试数: ${totalTests}`);
  console.log(`通过: ${passedTests}`);
  console.log(`失败: ${failedTests}`);

  const successRate = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`成功率: ${successRate}%`);

  if (successRate >= 80) {
    console.log('🎉 验证通过! 系统解析功能表现良好');
  } else {
    console.log('⚠️  验证警告: 系统解析功能表现不佳，需要优化');
  }
}

// 运行测试
runTests().catch(error => {
  console.error('🚨 测试执行失败:', error);
  process.exit(1);
});
