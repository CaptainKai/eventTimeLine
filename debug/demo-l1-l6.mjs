#!/usr/bin/env node
/**
 * L1-L6 全链路聚类演示
 * 使用真实中英文新闻案例，展示从新闻采集到假设推理的完整流程
 *
 * 运行方式: node debug/demo-l1-l6.mjs
 */

// ============================================================
// 真实新闻案例库（中英文对照，均为公众关注的热点事件）
// ============================================================

const NEWS_CASES = {
  // ===================== 故事线 A: 中美贸易战升级 =====================
  tradeWar: [
    // EN-1
    {
      lang: 'en',
      id: 'TW-EN-1',
      title: 'US imposes 100% tariffs on Chinese electric vehicles, escalating trade tensions',
      content: 'The White House announced sweeping new tariffs on Chinese imports including electric vehicles, semiconductors, and solar panels. The trade representative called it a necessary response to unfair trade practices. Markets reacted negatively with the S&P 500 dropping 2.3% in afternoon trading.',
      expectedActor: 'United States',
      expectedAction: 'sanction',
      expectedObject: 'China',
      expectedLocation: 'Washington',
      source: 'Reuters',
      timestamp: '2026-04-20T14:30:00Z',
    },
    // CN-1
    {
      lang: 'zh',
      id: 'TW-CN-1',
      title: '中国宣布对美国商品加征关税，中美贸易摩擦升级',
      content: '北京时间4月20日晚间，商务部发表声明称将对原产于美国的进口商品加征25%的关税，作为对美国最新关税措施的反制。外交部发言人表示这是必要的应对措施。',
      expectedActor: 'China',
      expectedAction: 'retaliate',
      expectedObject: 'United States',
      expectedLocation: 'Beijing',
      source: '新华社',
      timestamp: '2026-04-20T22:00:00Z',
    },
    // EN-2: Same event, different wording — should cluster with TW-EN-1
    {
      lang: 'en',
      id: 'TW-EN-2',
      title: 'Washington slaps 100 percent duty on Chinese EVs amid rising trade war',
      content: 'President announced the highest tariffs yet on Beijing, targeting green technology sectors. The move sent shockwaves through global markets.',
      expectedActor: 'United States',
      expectedAction: 'sanction',
      expectedObject: 'China',
      expectedLocation: 'Washington',
      source: 'Bloomberg',
      timestamp: '2026-04-20T15:00:00Z',
    },
    // EN-3: Related but different actor — Entity Veto should prevent merge
    {
      lang: 'en',
      id: 'TW-EN-3',
      title: 'EU launches anti-dumping investigation into Chinese solar panel exports',
      content: 'The European Commission opened a formal probe into alleged subsidies for Chinese solar manufacturers. Brussels said the investigation could lead to tariffs within six months.',
      expectedActor: 'European Union',
      expectedAction: 'investigate',
      expectedObject: 'China',
      expectedLocation: 'Brussels',
      source: 'Financial Times',
      timestamp: '2026-04-21T09:00:00Z',
    },
    // CN-2: Related economic impact
    {
      lang: 'zh',
      id: 'TW-CN-2',
      title: '美股大跌，标普500指数创三个月最大跌幅，科技股领跌',
      content: '受中美贸易摩擦升级影响，华尔街三大指数全线下跌。纳斯达克综合指数下跌3.1%，道琼斯工业平均指数下跌800点。苹果公司股价下跌4.2%，特斯拉下跌5.8%。',
      expectedActor: 'S&P 500',
      expectedAction: 'price_decrease',
      expectedObject: '',
      expectedLocation: 'New York',
      source: '财新网',
      timestamp: '2026-04-21T01:00:00Z',
    },
    // CN-3: Fed response — related story, different event
    {
      lang: 'zh',
      id: 'TW-CN-3',
      title: '美联储暗示可能降息以应对贸易摩擦带来的经济不确定性',
      content: '美联储主席鲍威尔在新闻发布会上表示，委员会正在密切关注贸易政策变化对经济前景的影响。市场普遍预期6月份可能降息25个基点。',
      expectedActor: 'Federal Reserve',
      expectedAction: 'cut_rate',
      expectedObject: '',
      expectedLocation: 'Washington',
      source: '华尔街日报中文网',
      timestamp: '2026-04-22T18:00:00Z',
    },
  ],

  // ===================== 故事线 B: 俄乌冲突 + 能源危机 =====================
  russiaUkraine: [
    // EN-4
    {
      lang: 'en',
      id: 'RU-EN-1',
      title: 'Russia launches massive missile strike on Kyiv power infrastructure',
      content: 'Moscow fired over 50 missiles and drones at Ukrainian energy facilities overnight, causing widespread blackouts across Kyiv and surrounding regions. Zelenskyy called it a war crime and urged allies to provide more air defense systems.',
      expectedActor: 'Russia',
      expectedAction: 'attack',
      expectedObject: 'Ukraine',
      expectedLocation: 'Kyiv',
      source: 'BBC',
      timestamp: '2026-04-18T06:00:00Z',
    },
    // CN-4
    {
      lang: 'zh',
      id: 'RU-CN-1',
      title: '俄罗斯对基辅发动大规模导弹袭击，乌克兰多地停电',
      content: '莫斯科向乌克兰能源设施发射了超过50枚导弹和无人机，造成基辅及周边地区大面积停电。泽连斯基谴责这是战争罪行，并呼吁盟国提供更多防空系统。',
      expectedActor: 'Russia',
      expectedAction: 'attack',
      expectedObject: 'Ukraine',
      expectedLocation: 'Kyiv',
      source: '央视新闻',
      timestamp: '2026-04-18T07:00:00Z',
    },
    // EN-5: EU response — related, should link via L4 relationships
    {
      lang: 'en',
      id: 'RU-EN-2',
      title: 'EU announces 14th sanctions package against Russia over Ukraine attacks',
      content: 'The European Union agreed on new sanctions targeting Russian energy exports and defense industry. Brussels said the measures would freeze assets of 120 individuals and entities. Germany and France backed the move.',
      expectedActor: 'European Union',
      expectedAction: 'sanction',
      expectedObject: 'Russia',
      expectedLocation: 'Brussels',
      source: 'AP News',
      timestamp: '2026-04-19T12:00:00Z',
    },
    // EN-6: Energy impact — oil price surge
    {
      lang: 'en',
      id: 'RU-EN-3',
      title: 'Brent crude surges 8% after Russian strikes on Ukrainian energy grid',
      content: 'Oil prices jumped to $95 per barrel as markets feared further disruption to energy supplies. The spike came after Russias overnight missile campaign against Ukrainian power plants raised concerns about global supply chain stability.',
      expectedActor: 'Crude Oil',
      expectedAction: 'price_increase',
      expectedObject: '',
      expectedLocation: 'London',
      source: 'CNBC',
      timestamp: '2026-04-18T10:00:00Z',
    },
    // CN-5: NATO response
    {
      lang: 'zh',
      id: 'RU-CN-2',
      title: '北约宣布向东欧增派部队，波兰罗马尼亚将部署新军事基地',
      content: '北约秘书长宣布将在波兰和罗马尼亚部署新的军事基地，并增派5000名士兵到东欧盟国。这是对俄罗斯持续袭击乌克兰基础设施的回应。',
      expectedActor: 'NATO',
      expectedAction: 'deploy',
      expectedObject: '',
      expectedLocation: 'Warsaw',
      source: '环球时报',
      timestamp: '2026-04-19T16:00:00Z',
    },
  ],

  // ===================== 故事线 C: 中东局势 =====================
  middleEast: [
    // EN-7
    {
      lang: 'en',
      id: 'ME-EN-1',
      title: 'Israel and Iran exchange missile strikes as Middle East tensions escalate',
      content: 'Israeli forces launched airstrikes on Iranian nuclear facilities in Natanz and Isfahan. Iran responded with ballistic missiles targeting Tel Aviv. The UN Security Council called an emergency session as civilian casualties mounted on both sides.',
      expectedActor: 'Israel',
      expectedAction: 'attack',
      expectedObject: 'Iran',
      expectedLocation: 'Jerusalem',
      source: 'Al Jazeera',
      timestamp: '2026-04-15T03:00:00Z',
    },
    // CN-6
    {
      lang: 'zh',
      id: 'ME-CN-1',
      title: '以色列与伊朗互相发动导弹袭击，中东局势急剧升级',
      content: '以色列对伊朗纳坦兹和伊斯法罕的核设施发动空袭。伊朗随后向特拉维夫发射弹道导弹作为回应。联合国安理会召开紧急会议，双方平民伤亡人数持续上升。',
      expectedActor: 'Israel',
      expectedAction: 'attack',
      expectedObject: 'Iran',
      expectedLocation: 'Jerusalem',
      source: '新华网',
      timestamp: '2026-04-15T04:00:00Z',
    },
    // EN-8: Oil impact from Middle East
    {
      lang: 'en',
      id: 'ME-EN-2',
      title: 'Oil prices spike 12% as Iran threatens to close Strait of Hormuz',
      content: 'Tehran warned that it could block the strategic waterway through which 20% of global oil passes. WTI crude futures surged above $98 per barrel. Saudi Arabia and the UAE called for calm.',
      expectedActor: 'Iran',
      expectedAction: 'threaten',
      expectedObject: '',
      expectedLocation: 'Tehran',
      source: 'Reuters',
      timestamp: '2026-04-16T08:00:00Z',
    },
  ],
};

// ============================================================
// 导入项目实际代码（实体提取、聚类引擎等）
// ============================================================

import { extractEntities, extractEntitiesByType, groupEntitiesByType } from '../lib/entities/entity-index.mjs';
import { getAllEntities } from '../lib/entities/entity-database.mjs';
import { ALL_STANDARD_ACTIONS, RAW_ACTION_PATTERNS, EVENT_TYPES } from '../lib/config/event-taxonomy.mjs';

// ============================================================
// 内联导入聚类引擎核心逻辑（复用 canonical-merger.mjs 中的算法）
// ============================================================

// TF-IDF 实现（与 canonical-merger.mjs 相同）
class SimpleTFIDF {
  constructor() {
    this.documents = [];
    this.vocab = new Map();
    this.synonymMap = {
      'fed': 'federal_reserve', 'federal reserve': 'federal_reserve',
      'sec': 'securities_exchange_commission', 'imf': 'international_monetary_fund',
      'ecb': 'european_central_bank', 'boj': 'bank_of_japan',
      'pboc': 'peoples_bank_of_china', 'nato': 'north_atlantic_treaty_organization',
      'uk': 'united_kingdom', 'usa': 'united_states', 'us': 'united_states',
    };
    this.financialStopwords = new Set([
      'stock', 'market', 'company', 'shares', 'trading', 'price',
      'report', 'analysis', 'data', 'update', 'news', 'break',
    ]);
  }

  tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
      .replace(/[^\w\s一-鿿]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !this.financialStopwords.has(t))
      .map(t => this.synonymMap[t] || t);
  }

  addDocument(text) {
    const tokens = this.tokenize(text);
    const docIndex = this.documents.length;
    this.documents.push(tokens);
    for (const token of tokens) {
      if (!this.vocab.has(token)) this.vocab.set(token, new Set());
      this.vocab.get(token).add(docIndex);
    }
    return docIndex;
  }

  _termFreq(tokens) {
    const freq = {};
    for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
    const len = tokens.length || 1;
    for (const k of Object.keys(freq)) freq[k] /= len;
    return freq;
  }

  cosineSimilarity(docIndexA, docIndexB) {
    const docA = this.documents[docIndexA];
    const docB = this.documents[docIndexB];
    if (!docA || !docB) return 0;
    const n = this.documents.length;
    const tfA = this._termFreq(docA);
    const tfB = this._termFreq(docB);
    const allTerms = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
    let dotProduct = 0, normA = 0, normB = 0;
    for (const term of allTerms) {
      const df = this.vocab.get(term)?.size || 1;
      const idf = Math.log(n / df);
      const wA = (tfA[term] || 0) * idf;
      const wB = (tfB[term] || 0) * idf;
      dotProduct += wA * wB;
      normA += wA * wA;
      normB += wB * wB;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dotProduct / denom : 0;
  }

  similarityToCorpus(newText, docIndex) {
    const tokens = this.tokenize(newText);
    const corpusDoc = this.documents[docIndex];
    if (!corpusDoc) return 0;
    const n = this.documents.length;
    const tfNew = this._termFreq(tokens);
    const tfCorpus = this._termFreq(corpusDoc);
    const allTerms = new Set([...Object.keys(tfNew), ...Object.keys(tfCorpus)]);
    let dotProduct = 0, normNew = 0, normCorpus = 0;
    for (const term of allTerms) {
      const df = this.vocab.get(term)?.size || 1;
      const idf = Math.log(n / df);
      const wNew = (tfNew[term] || 0) * idf;
      const wCorpus = (tfCorpus[term] || 0) * idf;
      dotProduct += wNew * wCorpus;
      normNew += wNew * wNew;
      normCorpus += wCorpus * wCorpus;
    }
    const denom = Math.sqrt(normNew) * Math.sqrt(normCorpus);
    return denom > 0 ? dotProduct / denom : 0;
  }
}

// Jaccard 相似度
function calculateJaccard(textA, textB) {
  if (!textA || !textB) return 0;
  const tokenize = (text) => new Set(
    text.toLowerCase().replace(/[^\w\s一-鿿]/g, ' ').split(/\s+/).filter(t => t.length > 1)
  );
  const setA = tokenize(textA);
  const setB = tokenize(textB);
  if (setA.size === 0 && setB.size === 0) return 1.0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

// Entity Veto 检查（来自 worldmonitor）
function checkEntityVeto(proto, candidate) {
  const sharedLocation = proto.locationId && proto.locationId === candidate.locationId;
  const differentActor = proto.actorId && candidate.actorId && proto.actorId !== candidate.actorId;
  if (sharedLocation && differentActor) {
    return { vetoed: true, reason: 'shared_location_different_actor' };
  }
  return { vetoed: false };
}

// 实体重叠度计算
function calculateEntityOverlap(protoEntities, candidateEntities) {
  const protoSet = new Set([protoEntities.actorId, protoEntities.objectId, protoEntities.locationId].filter(Boolean));
  const candidateSet = new Set([candidateEntities.actorId, candidateEntities.objectId, candidateEntities.locationId].filter(Boolean));
  if (protoSet.size === 0 && candidateSet.size === 0) return 1.0;
  const intersection = [...protoSet].filter(x => candidateSet.has(x)).length;
  const union = new Set([...protoSet, ...candidateSet]).size;
  return union > 0 ? intersection / union : 0;
}

// 动作匹配
function calculateActionMatch(protoAction, candidateAction) {
  if (!protoAction || !candidateAction) return 0;
  const p = protoAction.toLowerCase().trim();
  const c = candidateAction.toLowerCase().trim();
  if (p === c) return 1.0;
  if (p.includes(c) || c.includes(p)) return 0.7;
  const pCategory = p.split(',')[0].split(' ')[0];
  const cCategory = c.split(',')[0].split(' ')[0];
  if (pCategory === cCategory) return 0.5;
  return 0;
}

// 时间衰减
function calculateTimeDecay(protoDate, candidateDate) {
  const p = new Date(protoDate);
  const c = new Date(candidateDate);
  const dayDiff = Math.abs((p - c) / (1000 * 60 * 60 * 24));
  if (dayDiff <= 1) return 1.0;
  if (dayDiff <= 7) return 0.9;
  if (dayDiff <= 14) return 0.6;
  if (dayDiff <= 30) return 0.3;
  return 0.1;
}

// Union-Find 数据结构
class UnionFind {
  constructor() { this.parent = new Map(); this.rank = new Map(); }
  find(x) {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); return x; }
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)));
    return this.parent.get(x);
  }
  union(x, y) {
    const px = this.find(x), py = this.find(y);
    if (px === py) return;
    if (this.rank.get(px) < this.rank.get(py)) this.parent.set(px, py);
    else if (this.rank.get(px) > this.rank.get(py)) this.parent.set(py, px);
    else { this.parent.set(py, px); this.rank.set(px, this.rank.get(px) + 1); }
  }
  clusters() {
    const groups = new Map();
    for (const [id] of this.parent) { const root = this.find(id); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(id); }
    return [...groups.values()];
  }
}

// 关联信号检测器
class CorrelationSignalDetector {
  detectVelocitySpike(currentCount, previousCount) {
    if (previousCount === 0) return currentCount > 0;
    return (currentCount / previousCount) >= 3.0;
  }
  detectTriangulation(uniqueSources) { return uniqueSources.length >= 3; }
  detectKeywordSpike(keywordCount) { return keywordCount >= 5; }
  anySignalActive({ currentCount, previousCount, uniqueSources, keywordCount }) {
    return this.detectVelocitySpike(currentCount, previousCount) ||
           this.detectTriangulation(uniqueSources) ||
           this.detectKeywordSpike(keywordCount);
  }
}

// ============================================================
// 模拟 L1-L6 管线
// ============================================================

class DemoPipeline {
  constructor() {
    this.tfidf = new SimpleTFIDF();
    this.signalDetector = new CorrelationSignalDetector();
    this.allNews = [];
    this.l1News = [];
    this.l2ProtoEvents = [];
    this.l3CanonicalEvents = [];
    this.l4Relationships = [];
    this.l5Stories = [];
    this.l6Hypotheses = [];
    this.nextEntityId = 1;
    this.nextEventId = 1;
    this.nextProtoId = 1;
    this.entityMap = new Map(); // name -> entity object
  }

  // ----- L1: 新闻采集 -----
  async runL1Ingestion(newsCases) {
    console.log('\n' + '═'.repeat(80));
    console.log('L1: 新闻采集 (NEWS INGESTION)');
    console.log('═'.repeat(80));

    for (const news of newsCases) {
      const newsItem = {
        id: `news-${this.allNews.length + 1}`,
        caseId: news.id,
        lang: news.lang,
        title: news.title,
        content: news.content,
        source: news.source,
        timestamp: news.timestamp,
        expectedActor: news.expectedActor,
        expectedAction: news.expectedAction,
        expectedObject: news.expectedObject,
        expectedLocation: news.expectedLocation,
        entities: extractEntities(news.title + ' ' + news.content),
        actors: extractEntitiesByType(news.title + ' ' + news.content, ['country', 'organization', 'institution', 'person']),
        locations: extractEntitiesByType(news.title + ' ' + news.content, ['city', 'country', 'region']),
      };
      this.allNews.push(newsItem);
      this.l1News.push(newsItem);

      console.log(`\n  [${newsItem.id}] (${newsItem.lang.toUpperCase()}) ${newsItem.caseId}`);
      console.log(`  来源: ${newsItem.source} | 时间: ${newsItem.timestamp}`);
      console.log(`  标题: ${newsItem.title}`);
      console.log(`  提取实体: ${newsItem.entities.map(e => `${e.name}(${e.type}, ${e.match_score.toFixed(2)})`).join(', ')}`);
    }

    console.log(`\n  L1 完成: 采集 ${this.l1News.length} 条新闻`);
    return this.l1News;
  }

  // ----- L2: 原子事件提取 -----
  async runL2Extraction() {
    console.log('\n' + '═'.repeat(80));
    console.log('L2: 原子事件提取 (PROTO-EVENT EXTRACTION)');
    console.log('═'.repeat(80));

    for (const news of this.l1News) {
      // 模拟解析器提取 proto event
      const actor = this.resolveEntity(news.expectedActor);
      const object = news.expectedObject ? this.resolveEntity(news.expectedObject) : null;
      const location = this.resolveEntity(news.expectedLocation);

      // 匹配动作
      const action = this.normalizeAction(news.expectedAction);

      const protoEvent = {
        id: `proto-${this.nextProtoId++}`,
        newsId: news.id,
        actor,
        action,
        object,
        location,
        actorId: actor?.id,
        objectId: object?.id,
        locationId: location?.id,
        time: news.timestamp,
        confidence: 0.85,
        source: news.source,
        lang: news.lang,
        caseId: news.caseId,
      };

      this.l2ProtoEvents.push(protoEvent);

      console.log(`\n  [${protoEvent.id}] ← ${news.id} (${news.caseId})`);
      console.log(`  Actor: ${actor?.name || '(none)'} (${actor?.type || '-'})`);
      console.log(`  Action: ${action || '(none)'}`);
      console.log(`  Object: ${object?.name || '(none)'}`);
      console.log(`  Location: ${location?.name || '(none)'}`);
    }

    console.log(`\n  L2 完成: 提取 ${this.l2ProtoEvents.length} 个原子事件`);
    return this.l2ProtoEvents;
  }

  // ----- L3: 标准事件聚类 (核心) -----
  async runL3Clustering() {
    console.log('\n' + '═'.repeat(80));
    console.log('L3: 标准事件在线聚类 (CANONICAL EVENT CLUSTERING)');
    console.log('═'.repeat(80));
    console.log('  算法: Jaccard初筛 → TF-IDF语义 → Entity Veto → 综合相似度加权');

    // 先将所有 proto event 的标题加入 TF-IDF 语料库
    const corpus = [];
    for (const proto of this.l2ProtoEvents) {
      const title = `${proto.actor?.name || ''} ${proto.action} ${proto.object?.name || ''}`;
      corpus.push({ proto, title, docIndex: this.tfidf.addDocument(title) });
    }

    // 在线聚类：逐个处理
    for (const entry of corpus) {
      const { proto, title } = entry;
      const candidates = this.l3CanonicalEvents.filter(ce => {
        const dayDiff = Math.abs((new Date(proto.time) - new Date(ce.startTime)) / (1000 * 60 * 60 * 24));
        return dayDiff <= 7;
      });

      if (candidates.length === 0) {
        // 无候选，创建新事件
        const newEvent = {
          id: `event-${this.nextEventId++}`,
          type: proto.action,
          startTime: proto.time,
          actor1Id: proto.actorId,
          actor2Id: proto.objectId,
          locationId: proto.locationId,
          actor1: proto.actor,
          actor2: proto.object,
          location: proto.location,
          protoEvents: [proto.id],
          newsCount: 1,
          sources: [proto.source],
          lang: proto.lang,
          docIndex: entry.docIndex,
          title: title,
        };
        this.l3CanonicalEvents.push(newEvent);
        console.log(`\n  ✨ 新建事件 [${newEvent.id}]: "${title}"`);
        console.log(`     ← ${proto.caseId} (${proto.source})`);
      } else {
        // 寻找最佳匹配
        let bestMatch = null;
        let bestSimilarity = 0;
        let bestScores = {};

        for (const candidate of candidates) {
          // Layer 1: Jaccard 初筛
          const candidateTitle = candidate.title;
          const jaccard = calculateJaccard(title, candidateTitle);
          if (jaccard < 0.15) continue;

          // Layer 2: Entity Veto
          const veto = checkEntityVeto(
            { actorId: proto.actorId, locationId: proto.locationId },
            { actorId: candidate.actor1Id, locationId: candidate.locationId }
          );
          if (veto.vetoed) {
            console.log(`  🚫 Entity Veto 阻止合并到 [${candidate.id}]: ${veto.reason}`);
            continue;
          }

          // Layer 3: TF-IDF 语义相似度
          const tfidf = this.tfidf.similarityToCorpus(title, candidate.docIndex);

          // Layer 4: 综合相似度
          const entityOverlap = calculateEntityOverlap(
            { actorId: proto.actorId, objectId: proto.objectId, locationId: proto.locationId },
            { actorId: candidate.actor1Id, objectId: candidate.actor2Id, locationId: candidate.locationId }
          );
          const actionMatch = calculateActionMatch(proto.action, candidate.type);
          const timeDecay = calculateTimeDecay(proto.time, candidate.startTime);

          const similarity = 0.25 * jaccard + 0.25 * tfidf + 0.25 * entityOverlap + 0.15 * actionMatch + 0.1 * timeDecay;

          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = candidate;
            bestScores = { jaccard, tfidf, entityOverlap, actionMatch, timeDecay };
          }
        }

        if (bestMatch && bestSimilarity >= 0.5) {
          // 合并到现有事件
          bestMatch.protoEvents.push(proto.id);
          bestMatch.newsCount++;
          if (!bestMatch.sources.includes(proto.source)) {
            bestMatch.sources.push(proto.source);
          }
          console.log(`\n  🔗 合并到 [${bestMatch.id}]: "${bestMatch.title}" (similarity: ${bestSimilarity.toFixed(3)})`);
          console.log(`     ← ${proto.caseId} (${proto.source})`);
          console.log(`     得分: Jaccard=${bestScores.jaccard.toFixed(3)} TF-IDF=${bestScores.tfidf.toFixed(3)} Entity=${bestScores.entityOverlap.toFixed(3)} Action=${bestScores.actionMatch.toFixed(3)} Time=${bestScores.timeDecay.toFixed(3)}`);
        } else {
          // 创建新事件
          const newEvent = {
            id: `event-${this.nextEventId++}`,
            type: proto.action,
            startTime: proto.time,
            actor1Id: proto.actorId,
            actor2Id: proto.objectId,
            locationId: proto.locationId,
            actor1: proto.actor,
            actor2: proto.object,
            location: proto.location,
            protoEvents: [proto.id],
            newsCount: 1,
            sources: [proto.source],
            lang: proto.lang,
            docIndex: entry.docIndex,
            title: title,
          };
          this.l3CanonicalEvents.push(newEvent);
          console.log(`\n  ✨ 新建事件 [${newEvent.id}]: "${title}" (no match above 0.5)`);
          console.log(`     ← ${proto.caseId} (${proto.source})`);
          if (bestMatch) {
            console.log(`     最佳候选: [${bestMatch.id}] similarity=${bestSimilarity.toFixed(3)} (below threshold)`);
          }
        }
      }
    }

    console.log(`\n  L3 完成: ${this.l3CanonicalEvents.length} 个标准事件（来自 ${this.l2ProtoEvents.length} 个原子事件）`);
    return this.l3CanonicalEvents;
  }

  // ----- L3.5: Union-Find 批量聚类展示 -----
  async runUnionFindBatchCluster() {
    console.log('\n' + '═'.repeat(80));
    console.log('L3.5: Union-Find 批量聚类 (离线模式)');
    console.log('═'.repeat(80));

    const uf = new UnionFind();
    for (let i = 0; i < this.l2ProtoEvents.length; i++) {
      uf.find(i);
      for (let j = i + 1; j < this.l2ProtoEvents.length; j++) {
        uf.find(j);
        const a = this.l2ProtoEvents[i];
        const b = this.l2ProtoEvents[j];
        const titleA = `${a.actor?.name} ${a.action} ${a.object?.name}`;
        const titleB = `${b.actor?.name} ${b.action} ${b.object?.name}`;

        const jaccard = calculateJaccard(titleA, titleB);
        if (jaccard < 0.15) continue;

        const veto = checkEntityVeto(
          { actorId: a.actorId, locationId: a.locationId },
          { actorId: b.actorId, locationId: b.locationId }
        );
        if (veto.vetoed) continue;

        const entityOverlap = calculateEntityOverlap(
          { actorId: a.actorId, objectId: a.objectId, locationId: a.locationId },
          { actorId: b.actorId, objectId: b.objectId, locationId: b.locationId }
        );
        const actionMatch = calculateActionMatch(a.action, b.action);
        const timeDecay = calculateTimeDecay(a.time, b.time);
        const similarity = 0.25 * jaccard + 0.25 * 0 + 0.25 * entityOverlap + 0.15 * actionMatch + 0.1 * timeDecay;

        if (similarity >= 0.5) {
          uf.union(i, j);
        }
      }
    }

    const clusters = uf.clusters();
    console.log(`\n  批量聚类结果: ${clusters.length} 个簇`);
    clusters.forEach((cluster, idx) => {
      const events = cluster.map(i => this.l2ProtoEvents[i]);
      console.log(`\n  簇 ${idx + 1}: ${events.length} 个原子事件`);
      events.forEach(e => {
        console.log(`    - [${e.id}] ${e.caseId}: ${e.actor?.name} ${e.action} ${e.object?.name} (${e.source})`);
      });
    });

    return clusters;
  }

  // ----- L4: 事件关系分析 -----
  async runL4Relationships() {
    console.log('\n' + '═'.repeat(80));
    console.log('L4: 事件关系图谱 (EVENT RELATIONSHIP GRAPH)');
    console.log('═'.repeat(80));

    const relationshipTypes = [
      'cause_effect', 'trigger', 'evolution', 'related', 'sub_event'
    ];

    for (let i = 0; i < this.l3CanonicalEvents.length; i++) {
      for (let j = 0; j < this.l3CanonicalEvents.length; j++) {
        if (i === j) continue;
        const eventA = this.l3CanonicalEvents[i];
        const eventB = this.l3CanonicalEvents[j];

        const rel = this.detectRelationship(eventA, eventB);
        if (rel) {
          this.l4Relationships.push(rel);
        }
      }
    }

    // 打印关系图
    for (const rel of this.l4Relationships) {
      console.log(`\n  ${rel.source} ──[${rel.type} (confidence: ${rel.confidence.toFixed(2)})]──> ${rel.target}`);
      console.log(`    描述: ${rel.description}`);
    }

    console.log(`\n  L4 完成: 检测到 ${this.l4Relationships.length} 条关系边`);
    return this.l4Relationships;
  }

  detectRelationship(eventA, eventB) {
    const dayDiff = Math.abs((new Date(eventA.startTime) - new Date(eventB.startTime)) / (1000 * 60 * 60 * 24));
    if (dayDiff > 7) return null;

    // 检测 cause_effect: 制裁 → 价格变化
    if (eventA.type === 'sanction' && (eventB.type === 'price_increase' || eventB.type === 'price_decrease')) {
      const timeOrder = new Date(eventA.startTime) <= new Date(eventB.startTime);
      if (timeOrder && dayDiff <= 5) {
        return {
          source: eventA.id, target: eventB.id, type: 'cause_effect',
          confidence: 0.85,
          description: `制裁事件 → 市场价格变化: "${eventA.title}" → "${eventB.title}"`
        };
      }
    }

    // 检测 trigger: 军事攻击 → 制裁回应/部署
    if (eventA.type === 'attack' && (eventB.type === 'deploy' || eventB.type === 'sanction')) {
      if (new Date(eventA.startTime) < new Date(eventB.startTime) && dayDiff <= 5) {
        // 只有当事件B的制裁对象与事件A的参与方有关时才触发
        const isRelated =
          (eventB.actor1 && eventA.actor2 && eventB.actor1.id === eventA.actor2.id) || // 制裁攻击方
          (eventB.actor2 && eventA.actor1 && eventB.actor2.id === eventA.actor1.id);
        if (isRelated) {
          return {
            source: eventA.id, target: eventB.id, type: 'trigger',
            confidence: 0.85,
            description: `军事攻击触发应对行动: "${eventA.title}" → "${eventB.title}"`
          };
        }
      }
    }

    // 检测 evolution: 互相攻击
    if (eventA.type === 'attack' && eventB.type === 'attack' &&
        eventA.actor1Id === eventB.actor2Id && eventA.actor2Id === eventB.actor1Id) {
      if (dayDiff <= 1) {
        return {
          source: eventA.id, target: eventB.id, type: 'evolution',
          confidence: 0.95,
          description: `互相攻击: "${eventA.title}" ↔ "${eventB.title}"`
        };
      }
    }

    // 检测 related: 严格共享两个以上实体
    const sharedEntities = new Set();
    if (eventA.actor1Id && [eventB.actor1Id, eventB.actor2Id].includes(eventA.actor1Id)) sharedEntities.add(eventA.actor1Id);
    if (eventA.actor2Id && [eventB.actor1Id, eventB.actor2Id].includes(eventA.actor2Id)) sharedEntities.add(eventA.actor2Id);
    if (eventA.locationId && eventB.locationId && eventA.locationId === eventB.locationId) sharedEntities.add(eventA.locationId);
    if (sharedEntities.size >= 2 && eventA.id !== eventB.id) {
      return {
        source: eventA.id, target: eventB.id, type: 'related',
        confidence: 0.5 + sharedEntities.size * 0.15,
        description: `共享多个实体: "${eventA.title}" ↔ "${eventB.title}"`
      };
    }

    return null;
  }

  // ----- L5: 故事线聚合 -----
  async runL5StoryThreading() {
    console.log('\n' + '═'.repeat(80));
    console.log('L5: 故事线聚合 (STORY THREADING)');
    console.log('═'.repeat(80));

    // 使用 Union-Find + 低阈值语义分组
    const uf = new UnionFind();
    for (let i = 0; i < this.l3CanonicalEvents.length; i++) {
      uf.find(i);
      for (let j = i + 1; j < this.l3CanonicalEvents.length; j++) {
        uf.find(j);

        const eventA = this.l3CanonicalEvents[i];
        const eventB = this.l3CanonicalEvents[j];

        // 检查是否有 L4 关系连接
        const hasRelationship = this.l4Relationships.some(r =>
          (r.source === eventA.id && r.target === eventB.id) ||
          (r.source === eventB.id && r.target === eventA.id)
        );

        // Jaccard 语义分组（低阈值）
        const jaccard = calculateJaccard(eventA.title, eventB.title);

        // 有关系或语义相似 → 同一故事线
        if (hasRelationship || jaccard >= 0.3) {
          uf.union(i, j);
        }
      }
    }

    const clusters = uf.clusters();
    clusters.forEach((cluster, idx) => {
      const events = cluster.map(i => this.l3CanonicalEvents[i]);
      const theme = this.inferTheme(events);
      this.l5Stories.push({
        id: `story-${idx + 1}`,
        theme,
        events: events.map(e => e.id),
        eventCount: events.length,
        escalationLevel: Math.min(10, events.length * 2 + events.reduce((s, e) => s + (e.newsCount || 1), 0)),
      });
    });

    for (const story of this.l5Stories) {
      console.log(`\n  📖 [${story.id}] 主题: ${story.theme}`);
      console.log(`     事件数: ${story.eventCount} | 升级等级: ${story.escalationLevel}/10`);
      story.events.forEach(eid => {
        const event = this.l3CanonicalEvents.find(e => e.id === eid);
        if (event) {
          console.log(`     └─ [${eid}] ${event.title} (${event.newsCount} 篇报道)`);
        }
      });
    }

    console.log(`\n  L5 完成: 聚合为 ${this.l5Stories.length} 条故事线`);
    return this.l5Stories;
  }

  inferTheme(events) {
    const actions = events.map(e => e.type).join(' ');
    if (actions.includes('sanction') || actions.includes('retaliate')) return '贸易冲突 / Trade Conflict';
    if (actions.includes('attack')) return '军事冲突 / Military Conflict';
    if (actions.includes('price')) return '市场波动 / Market Volatility';
    if (actions.includes('cut_rate')) return '货币政策 / Monetary Policy';
    if (actions.includes('deploy')) return '军事部署 / Military Deployment';
    if (actions.includes('threaten')) return '地缘威胁 / Geopolitical Threat';
    return '综合事件 / Mixed Events';
  }

  // ----- L6: 假设推理 -----
  async runL6Inference() {
    console.log('\n' + '═'.repeat(80));
    console.log('L6: 假设推理与预测 (HYPOTHESIS & PREDICTION)');
    console.log('═'.repeat(80));

    const hypotheses = [];

    for (const story of this.l5Stories) {
      const storyEvents = story.events.map(eid => this.l3CanonicalEvents.find(e => e.id === eid));
      const actions = storyEvents.map(e => e.type);

      // 规则驱动的假设生成
      if (story.theme.includes('贸易冲突')) {
        hypotheses.push({
          storyId: story.id,
          prediction: '其他国家可能加入关税战，全球经济衰退风险上升',
          probability: 0.72,
          evidence: storyEvents.map(e => `${e.id}: ${e.title}`),
          status: 'pending',
          timeHorizon: '30天',
        });
        hypotheses.push({
          storyId: story.id,
          prediction: '央行可能采取宽松货币政策对冲贸易影响',
          probability: 0.68,
          evidence: storyEvents.filter(e => e.type === 'price_increase').map(e => `${e.id}: ${e.title}`),
          status: 'pending',
          timeHorizon: '14天',
        });
      }

      if (story.theme.includes('军事冲突')) {
        hypotheses.push({
          storyId: story.id,
          prediction: '冲突可能升级为更大规模军事行动',
          probability: 0.65,
          evidence: storyEvents.map(e => `${e.id}: ${e.title}`),
          status: 'pending',
          timeHorizon: '7天',
        });
        hypotheses.push({
          storyId: story.id,
          prediction: '能源价格将因供应中断风险持续上涨',
          probability: 0.78,
          evidence: storyEvents.filter(e => e.type === 'price_increase').map(e => `${e.id}: ${e.title}`),
          status: 'pending',
          timeHorizon: '14天',
        });
      }

      if (story.theme.includes('市场波动')) {
        hypotheses.push({
          storyId: story.id,
          prediction: '如果贸易紧张持续，股市可能继续下跌',
          probability: 0.7,
          evidence: storyEvents.map(e => `${e.id}: ${e.title}`),
          status: 'pending',
          timeHorizon: '30天',
        });
      }
    }

    this.l6Hypotheses = hypotheses;

    for (const hyp of this.l6Hypotheses) {
      console.log(`\n  🔮 [假设] ${hyp.prediction}`);
      console.log(`     概率: ${(hyp.probability * 100).toFixed(0)}% | 时间范围: ${hyp.timeHorizon}`);
      console.log(`     基于故事: ${hyp.storyId}`);
      console.log(`     证据:`);
      hyp.evidence.forEach(e => console.log(`       └─ ${e}`));
    }

    console.log(`\n  L6 完成: 生成 ${this.l6Hypotheses.length} 个假设`);
    return this.l6Hypotheses;
  }

  // ----- 关联信号检测展示 -----
  async runSignalDetection() {
    console.log('\n' + '═'.repeat(80));
    console.log('关联信号检测 (CORRELATION SIGNALS) — FinceptTerminal 策略');
    console.log('═'.repeat(80));

    // velocity_spike: 统计每个时间段的报道量
    const timeBuckets = new Map();
    for (const news of this.l1News) {
      const hour = news.timestamp.split('T')[0]; // 按天分组
      if (!timeBuckets.has(hour)) timeBuckets.set(hour, []);
      timeBuckets.get(hour).push(news);
    }

    const dates = [...timeBuckets.keys()].sort();
    for (let i = 1; i < dates.length; i++) {
      const current = timeBuckets.get(dates[i]).length;
      const previous = timeBuckets.get(dates[i - 1]).length;
      const spike = this.signalDetector.detectVelocitySpike(current, previous);
      console.log(`\n  日期 ${dates[i - 1]}→${dates[i]}: ${previous}→${current} 篇报道 ${spike ? '⚡ VELOCITY SPIKE!' : '(normal)'}`);
    }

    // triangulation: 多源交叉验证
    for (const event of this.l3CanonicalEvents) {
      const tri = this.signalDetector.detectTriangulation(event.sources);
      if (tri) {
        console.log(`\n  🔺 三角验证 [${event.id}]: ${event.sources.length} 个独立来源报道 — ${event.sources.join(', ')}`);
      }
    }

    // keyword_spike: 威胁关键词
    const threatKeywords = ['attack', 'strike', 'missile', 'war', 'crisis', 'sanction', 'tariff', 'threat', 'escalat'];
    for (const news of this.l1News) {
      const text = (news.title + ' ' + news.content).toLowerCase();
      const keywordCount = threatKeywords.reduce((count, kw) => count + (text.includes(kw) ? 1 : 0), 0);
      if (keywordCount >= 3) {
        console.log(`\n  ⚠️ 威胁关键词 [${news.caseId}]: ${keywordCount} 个关键词 (${threatKeywords.filter(kw => text.includes(kw)).join(', ')})`);
      }
    }
  }

  // ----- 工具方法 -----
  resolveEntity(name) {
    if (!name) return null;
    // 规范化名称以匹配白名单
    const normalized = name.trim().toLowerCase();
    if (this.entityMap.has(normalized)) return this.entityMap.get(normalized);

    const entity = {
      id: `entity-${this.nextEntityId++}`,
      name,
      type: this.guessEntityType(normalized),
    };
    this.entityMap.set(normalized, entity);
    return entity;
  }

  guessEntityType(name) {
    // name is already lowercased
    if (['china', 'united states', 'russia', 'ukraine', 'israel', 'iran'].includes(name)) return 'country';
    if (['european union', 'nato', 'un', 'opec', 'asean'].includes(name)) return 'organization';
    if (['federal reserve', 'ecb', 'boj', 'pboc'].includes(name)) return 'institution';
    if (['s&p 500', 'dow jones', 'nasdaq'].includes(name)) return 'index';
    if (['crude oil', 'gold', 'bitcoin'].includes(name)) return 'commodity';
    if (['kyiv', 'washington', 'beijing', 'brussels', 'jerusalem', 'tehran', 'moscow', 'new york', 'london', 'warsaw'].includes(name)) return 'city';
    return 'unknown';
  }

  normalizeAction(action) {
    return action || '';
  }

  // ----- 生成报告 -----
  generateReport() {
    const report = [];
    const sep = '='.repeat(80);

    report.push(sep);
    report.push('L1-L6 全链路聚类演示报告');
    report.push('Event Timeline Engine — 多层聚类策略演示');
    report.push('日期: 2026-04-26');
    report.push(sep);

    // 摘要
    report.push('\n## 系统摘要');
    report.push(`- 输入新闻: ${this.l1News.length} 条`);
    report.push(`- 英文新闻: ${this.l1News.filter(n => n.lang === 'en').length} 条`);
    report.push(`- 中文新闻: ${this.l1News.filter(n => n.lang === 'zh').length} 条`);
    report.push(`- 原子事件: ${this.l2ProtoEvents.length} 个`);
    report.push(`- 标准事件: ${this.l3CanonicalEvents.length} 个（聚类压缩率: ${((1 - this.l3CanonicalEvents.length / this.l2ProtoEvents.length) * 100).toFixed(1)}%）`);
    report.push(`- 关系边: ${this.l4Relationships.length} 条`);
    report.push(`- 故事线: ${this.l5Stories.length} 条`);
    report.push(`- 假设: ${this.l6Hypotheses.length} 个`);

    // 聚类效果分析
    report.push('\n## 聚类效果分析');
    for (const event of this.l3CanonicalEvents) {
      if (event.newsCount > 1) {
        report.push(`\n### ✅ 成功聚类: [${event.id}] "${event.title}"`);
        report.push(`  - 聚合 ${event.newsCount} 篇报道`);
        report.push(`  - 来源: ${event.sources.join(', ')}`);
        report.push(`  - 涉及语言: ${event.lang}`);
        report.push(`  - 原子事件: ${event.protoEvents.join(', ')}`);
      }
    }

    // Entity Veto 分析
    report.push('\n## Entity Veto 机制效果');
    report.push('Entity Veto 防止了"同地点不同行为者"的错误合并');
    // 找出本应相似但被 Veto 阻止的案例
    for (let i = 0; i < this.l3CanonicalEvents.length; i++) {
      for (let j = i + 1; j < this.l3CanonicalEvents.length; j++) {
        const a = this.l3CanonicalEvents[i];
        const b = this.l3CanonicalEvents[j];
        const veto = checkEntityVeto(
          { actorId: a.actor1Id, locationId: a.locationId },
          { actorId: b.actor1Id, locationId: b.locationId }
        );
        if (veto.vetoed) {
          report.push(`\n### 🚫 被 Veto 阻止的合并`);
          report.push(`  - [${a.id}] ${a.actor1?.name} ${a.type} at ${a.location?.name}`);
          report.push(`  - [${b.id}] ${b.actor1?.name} ${b.type} at ${b.location?.name}`);
          report.push(`  - 原因: ${veto.reason}`);
        }
      }
    }

    // 故事线总结
    report.push('\n## 故事线总结');
    for (const story of this.l5Stories) {
      report.push(`\n### 📖 ${story.id}: ${story.theme}`);
      report.push(`  - 事件数: ${story.eventCount}`);
      report.push(`  - 升级等级: ${story.escalationLevel}/10`);
      story.events.forEach(eid => {
        const event = this.l3CanonicalEvents.find(e => e.id === eid);
        if (event) {
          report.push(`  - [${eid}] ${event.title}`);
        }
      });
    }

    // 假设总结
    report.push('\n## 假设与预测');
    for (const hyp of this.l6Hypotheses) {
      report.push(`\n### 🔮 ${(hyp.probability * 100).toFixed(0)}% 概率: ${hyp.prediction}`);
      report.push(`  - 时间范围: ${hyp.timeHorizon}`);
      report.push(`  - 状态: ${hyp.status}`);
    }

    // 聚类算法对比
    report.push('\n## 聚类算法对比');
    report.push('| 算法 | 来源项目 | 作用 | 阈值 |');
    report.push('|------|---------|------|------|');
    report.push('| Jaccard 初筛 | 两者都有 | 快速排除不相关候选 | ≥0.15 |');
    report.push('| TF-IDF 语义 | FinceptTerminal | 语义相似度计算 | 加权 0.25 |');
    report.push('| Entity Overlap | 原有 | 实体集合重叠度 | 加权 0.25 |');
    report.push('| Entity Veto | worldmonitor | 防止错误合并 | 硬性规则 |');
    report.push('| Action Match | 原有 | 动作分类匹配 | 加权 0.15 |');
    report.push('| Time Decay | 原有 | 时间衰减因子 | 加权 0.10 |');
    report.push('| Union-Find | worldmonitor | 批量贪心聚类 | ≥0.5 |');
    report.push('| Story Thread | worldmonitor | 低阈值叙事分组 | ≥0.30 |');

    // 关联信号
    report.push('\n## 关联信号检测');
    report.push('| 信号类型 | 来源 | 说明 |');
    report.push('|---------|------|------|');
    report.push('| velocity_spike | FinceptTerminal | 报道量突增检测 |');
    report.push('| triangulation | FinceptTerminal | 多源交叉验证 |');
    report.push('| keyword_spike | FinceptTerminal | 威胁关键词激增 |');

    report.push('\n' + sep);
    report.push('报告生成完毕');
    report.push(sep);

    return report.join('\n');
  }
}

// ============================================================
// 主执行流程
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Event Timeline Engine — L1-L6 全链路聚类演示          ║');
  console.log('║   融合 FinceptTerminal + worldmonitor 多层聚类策略      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const pipeline = new DemoPipeline();

  // 合并所有新闻案例
  const allNewsCases = [
    ...NEWS_CASES.tradeWar,
    ...NEWS_CASES.russiaUkraine,
    ...NEWS_CASES.middleEast,
  ];

  // L1: 新闻采集
  await pipeline.runL1Ingestion(allNewsCases);

  // L2: 原子事件提取
  await pipeline.runL2Extraction();

  // L3: 标准事件聚类
  await pipeline.runL3Clustering();

  // L3.5: Union-Find 批量聚类
  await pipeline.runUnionFindBatchCluster();

  // 关联信号检测
  await pipeline.runSignalDetection();

  // L4: 事件关系图谱
  await pipeline.runL4Relationships();

  // L5: 故事线聚合
  await pipeline.runL5StoryThreading();

  // L6: 假设推理
  await pipeline.runL6Inference();

  // 生成报告
  const report = pipeline.generateReport();
  console.log('\n\n');
  console.log(report);

  // 将报告写入文件
  const fs = await import('fs');
  const path = await import('path');
  const reportPath = path.join(process.cwd(), 'debug', 'l1-l6-demo-report.md');
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n报告已保存至: ${reportPath}`);
}

main().catch(console.error);
