import { initDB, closeDB } from '../lib/db/connection.mjs';
import { getEvents, getEventById } from '../lib/db/events-queries.mjs';
import { getEventAllRelationships } from '../lib/db/event-relationships-queries.mjs';
import { eventRelationshipAnalyzer } from '../lib/analysis/event-relationship-analyzer.mjs';

async function testEventGraph() {
  console.log('=== 测试事件图功能 ===\n');

  try {
    await initDB();

    // 1. 获取一些现有事件进行测试
    console.log('1. 获取事件列表...');
    const events = await getEvents(1, 10, {});
    console.log(`  找到 ${events.length} 个事件`);

    if (events.length < 2) {
      console.log('  事件太少，无法测试关系分析');
      return;
    }

    // 2. 测试评分函数
    console.log('\n2. 测试多特征评分函数...');
    for (let i = 0; i < Math.min(5, events.length - 1); i++) {
      const event1 = events[i];
      const event2 = events[i + 1];

      console.log(`\n  事件对 ${i + 1}:`);
      console.log(`    Event1: [${event1.id}] ${event1.event_type}`);
      console.log(`    Event2: [${event2.id}] ${event2.event_type}`);

      const entityOverlap = eventRelationshipAnalyzer.calculateEntityOverlap(event1, event2);
      const actionCompat = eventRelationshipAnalyzer.calculateActionCompatibility(event1, event2);
      const semanticSim = eventRelationshipAnalyzer.calculateSemanticSimilarity(event1, event2);
      const temporalProx = eventRelationshipAnalyzer.calculateTemporalProximity(event1, event2);
      const spatialProx = eventRelationshipAnalyzer.calculateSpatialProximity(event1, event2);
      const totalScore = eventRelationshipAnalyzer.calculateTotalScore(event1, event2);

      console.log(`    实体重叠: ${entityOverlap.toFixed(3)}`);
      console.log(`    动作兼容: ${actionCompat.toFixed(3)}`);
      console.log(`    语义相似: ${semanticSim.toFixed(3)}`);
      console.log(`    时间接近: ${temporalProx.toFixed(3)}`);
      console.log(`    空间接近: ${spatialProx.toFixed(3)}`);
      console.log(`    综合评分: ${totalScore.toFixed(3)}`);
    }

    // 3. 测试候选集检索
    console.log('\n3. 测试候选集检索...');
    const testEvent = events[0];
    console.log(`  目标事件: [${testEvent.id}] ${testEvent.event_type}`);

    const candidates = await eventRelationshipAnalyzer.findCandidateEvents(testEvent);
    console.log(`  找到 ${candidates.length} 个候选事件:`);
    candidates.forEach(c => {
      console.log(`    - [${c.id}] ${c.event_type}`);
    });

    // 4. 测试关系分析
    console.log('\n4. 测试事件关系分析...');
    const relationships = [];

    for (let i = 0; i < Math.min(5, events.length); i++) {
      const event1 = events[i];
      for (let j = i + 1; j < Math.min(6, events.length); j++) {
        const event2 = events[j];
        const rels = await eventRelationshipAnalyzer.analyzeEventRelationship(event1, event2);
        if (rels.length > 0) {
          relationships.push(...rels);
        }
      }
    }

    console.log(`  检测到 ${relationships.length} 个关系:`);
    relationships.forEach(rel => {
      console.log(`    [${rel.source_event_id}] → [${rel.target_event_id}] ${rel.relationship_type} (conf: ${rel.confidence.toFixed(2)}, weight: ${rel.weight.toFixed(2)})`);
    });

    // 5. 测试新事件关系分析
    console.log('\n5. 测试新事件关系分析...');
    if (events.length > 0) {
      const newRelationships = await eventRelationshipAnalyzer.analyzeNewEventRelationships(events[0].id);
      console.log(`  为事件 ${events[0].id} 找到 ${newRelationships.length} 个新关系`);
    }

    // 6. 显示现有关系
    console.log('\n6. 检查数据库中的现有关系...');
    for (const event of events.slice(0, 3)) {
      const rels = await getEventAllRelationships(event.id);
      const total = rels.outgoing.length + rels.incoming.length;
      console.log(`  事件 [${event.id}] ${event.event_type}:`);
      console.log(`    出边: ${rels.outgoing.length}`);
      console.log(`    入边: ${rels.incoming.length}`);
      console.log(`    总计: ${total}`);
    }

    console.log('\n=== 测试完成 ===');
  } catch (error) {
    console.error('测试失败:', error);
    throw error;
  } finally {
    await closeDB();
  }
}

testEventGraph().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
