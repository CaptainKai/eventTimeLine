/**
 * 测试 L1-L3 流程
 * 运行方式: node test/integration/l1-l3-flow.test.mjs
 */
import { initDB } from '../../lib/db/connection.mjs';
import { upsertNews, getNewsProtoEvents, isNewsParsed } from '../../lib/db/news-queries.mjs';
import { ingestExtractedNews } from '../../lib/pipeline/event-ingestion.mjs';

// 初始化数据库连接
initDB();

/**
 * 测试1: 测试新的新闻摄入流程
 */
async function testNewNewsIngestion() {
  console.log('\n========== 测试1: 新新闻摄入 ==========');

  const testNews = {
    title: '俄罗斯总统普京签署新的制裁法案',
    content: '俄罗斯总统弗拉基米尔·普京今日签署了一项新的经济制裁法案，该法案针对西方国家实施的反俄措施进行反击。普京表示，这将保护俄罗斯的国家利益。',
    source: 'test-source',
    source_url: 'https://example.com/test-news-' + Date.now(),
    published_at: new Date().toISOString(),
    lang: 'zh',
    importance: 0.8,
    reliability_score: 0.9,
  };

  // 模拟解析器输出的 proto_events
  const extractionResult = {
    proto_events: [
      {
        actor: '普京',
        action: 'Sign a treaty or agreement',
        object: '制裁法案',
        time: new Date().toISOString(),
        confidence: 0.9,
      },
      {
        actor: '俄罗斯',
        action: 'Make statement',
        object: '国家利益',
        time: new Date().toISOString(),
        confidence: 0.8,
      },
    ],
    topic: 'politics',
    sentiment: 0.5,
  };

  try {
    const result = await ingestExtractedNews(extractionResult, testNews);
    console.log('摄入结果:', result);
    console.log('新闻ID:', result.news_id);
    console.log('原子事件数:', result.proto_event_count);
    console.log('影响的标准事件:', result.affected_events);

    // 检查原子事件
    const protoEvents = await getNewsProtoEvents(result.news_id);
    console.log('\n查询到的原子事件:');
    protoEvents.forEach((pe, i) => {
      console.log(`  ${i + 1}. actor: ${pe.actor_raw}, action: ${pe.action_raw}, object: ${pe.object_raw}`);
      console.log(`     canonical_event_id: ${pe.canonical_event_id}`);
    });

    return result;
  } catch (error) {
    console.error('测试失败:', error);
    throw error;
  }
}

/**
 * 测试2: 验证数据完整性
 */
async function testDataIntegrity() {
  console.log('\n========== 测试2: 数据完整性验证 ==========');

  const { query } = await import('../../lib/db/connection.mjs');

  const result = await query(`
    SELECT
      n.id, n.title, n.source,
      COUNT(pe.id) as proto_count,
      COUNT(DISTINCT pe.canonical_event_id) as canonical_count
    FROM news n
    LEFT JOIN proto_events pe ON pe.news_id = n.id
    GROUP BY n.id, n.title, n.source
    HAVING COUNT(pe.id) > 0
    ORDER BY n.id DESC
    LIMIT 10
  `);

  console.log('最近有原子事件的新闻:');
  result.rows.forEach(row => {
    console.log(`  新闻ID: ${row.id}, 标题: ${row.title?.substring(0, 30)}...`);
    console.log(`    原子事件: ${row.proto_count}, 关联标准事件: ${row.canonical_count}`);
  });

  return result.rows;
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('开始 L1-L3 流程测试...');

  try {
    // 先检查数据完整性
    await testDataIntegrity();

    // 测试新新闻摄入
    await testNewNewsIngestion();

    // 再次检查数据完整性
    await testDataIntegrity();

    console.log('\n========== 所有测试完成 ==========');
  } catch (error) {
    console.error('测试异常:', error);
  }

  process.exit(0);
}

runTests();