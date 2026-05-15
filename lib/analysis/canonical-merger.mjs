import { query, queryOne } from '../db/connection.mjs';
import { getEntityById } from '../db/entity-queries.mjs';
import { getPendingNormalizationById } from '../db/pending-normalization-queries.mjs';

/**
 * 多层聚类配置
 * 融合 FinceptTerminal 的 TF-IDF 语义 + worldmonitor 的 Entity Veto + Union-Find
 */
const CLUSTERING_CONFIG = {
  // 时间窗口：±N天内的事件作为候选
  timeWindowDays: 7,

  // 各阶段阈值
  thresholds: {
    jaccardFilter: 0.15,      // Jaccard 初筛阈值（低于此值不进入后续计算）
    similarityMerge: 0.5,     // 综合相似度合并阈值
    batchMergeThreshold: 0.4, // 同新闻批次内候选合并阈值（更低，因为共享新闻源是强信号）
    storyThread: 0.45,        // 故事线语义分组阈值（更低，用于叙事连续）
    minEntityOverlap: 0.2,    // 实体重叠度最小值（候选筛选）
  },

  // 同新闻批次内候选的基础加分（共享新闻源但不同动作的原子事件）
  sameNewsBoost: 0.15,

  // 综合相似度权重（对应 FinceptTerminal 的加权求和策略）
  weights: {
    jaccard: 0.25,            // Jaccard 文本相似度
    tfidf: 0.25,              // TF-IDF 语义相似度
    entityOverlap: 0.25,      // 实体重叠度
    actionMatch: 0.15,        // 动作匹配度
    timeDecay: 0.1,           // 时间衰减
  },

  // Entity Veto 配置（来自 worldmonitor）
  entityVeto: {
    enabled: true,            // 启用实体否决机制
    // 共享地点但行为者不同时拒绝合并
    sharedLocationDifferentActor: true,
    // 完全无共享实体时拒绝（避免纯文本相似导致的错误合并）
    noSharedEntityVeto: false,
  },

  // 关联信号检测配置（来自 FinceptTerminal news_correlation.py）
  correlationSignals: {
    velocitySpike: 3.0,       // 报道量突增倍数（1小时内较前一时段增长）
    triangulationMin: 3,      // 多源交叉验证最少来源数
    keywordSpikeMin: 5,       // 威胁关键词出现次数阈值
  },

  // 金融领域停用词（来自 FinceptTerminal news_nlp.py）
  financialStopwords: new Set([
    'stock', 'market', 'company', 'shares', 'trading', 'price',
    'report', 'analysis', 'data', 'update', 'news', 'break',
  ]),

  // 同义词归一化（来自 FinceptTerminal）
  synonymMap: {
    'fed': 'federal_reserve',
    'federal reserve': 'federal_reserve',
    'sec': 'securities_exchange_commission',
    'secures exchange commission': 'securities_exchange_commission',
    'imf': 'international_monetary_fund',
    'ecb': 'european_central_bank',
    'boe': 'bank_of_england',
    'boj': 'bank_of_japan',
    'pboc': 'peoples_bank_of_china',
    'nato': 'north_atlantic_treaty_organization',
    'uk': 'united_kingdom',
    'usa': 'united_states',
    'us': 'united_states',
  },

  parentEntityBoost: 0.08,
};

/**
 * Union-Find 数据结构（来自 worldmonitor 的贪心聚类）
 */
class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  find(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      return x;
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x))); // 路径压缩
    }
    return this.parent.get(x);
  }

  union(x, y) {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;

    // 按秩合并
    if (this.rank.get(px) < this.rank.get(py)) {
      this.parent.set(px, py);
    } else if (this.rank.get(px) > this.rank.get(py)) {
      this.parent.set(py, px);
    } else {
      this.parent.set(py, px);
      this.rank.set(px, this.rank.get(px) + 1);
    }
  }

  clusters() {
    const groups = new Map();
    for (const [id] of this.parent) {
      const root = this.find(id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(id);
    }
    return [...groups.values()];
  }
}

/**
 * 手动实现 TF-IDF（来自 FinceptTerminal news_nlp.py，不依赖外部 NLP 库）
 */
class SimpleTFIDF {
  constructor() {
    this.documents = [];
    this.vocab = new Map(); // term -> Set<docIndex>
  }

  /**
   * 文本预处理：分词 + 停用词过滤 + 同义词归一化
   */
  tokenize(text, stopwords = CLUSTERING_CONFIG.financialStopwords, synonyms = CLUSTERING_CONFIG.synonymMap) {
    if (!text) return [];
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !stopwords.has(t))
      .map(t => synonyms[t] || t);
  }

  /**
   * 添加文档
   */
  addDocument(text) {
    const tokens = this.tokenize(text);
    const docIndex = this.documents.length;
    this.documents.push(tokens);

    for (const token of tokens) {
      if (!this.vocab.has(token)) {
        this.vocab.set(token, new Set());
      }
      this.vocab.get(token).add(docIndex);
    }
    return docIndex;
  }

  /**
   * 计算两个文档的 TF-IDF 余弦相似度
   */
  cosineSimilarity(docIndexA, docIndexB) {
    const docA = this.documents[docIndexA];
    const docB = this.documents[docIndexB];
    if (!docA || !docB) return 0;

    const n = this.documents.length;

    // TF: term frequency
    const tfA = this._termFreq(docA);
    const tfB = this._termFreq(docB);

    // IDF: inverse document frequency
    const allTerms = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const term of allTerms) {
      const df = this.vocab.get(term)?.size || 1;
      const idf = Math.log(n / df);

      const wA = (tfA[term] || 0) * idf;
      const wB = (tfB[term] || 0) * idf;

      dotProduct += wA * wB;
      normA += wA * wA;
      normB += wB * wB;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  _termFreq(tokens) {
    const freq = {};
    for (const t of tokens) {
      freq[t] = (freq[t] || 0) + 1;
    }
    // 归一化 TF
    const len = tokens.length || 1;
    for (const k of Object.keys(freq)) {
      freq[k] /= len;
    }
    return freq;
  }

  /**
   * 为新文本计算与已有文档的相似度（不添加到语料库）
   */
  similarityToCorpus(newText, docIndex) {
    const tokens = this.tokenize(newText);
    const corpusDoc = this.documents[docIndex];
    if (!corpusDoc) return 0;

    const n = this.documents.length;
    const tfNew = this._termFreq(tokens);
    const tfCorpus = this._termFreq(corpusDoc);

    const allTerms = new Set([...Object.keys(tfNew), ...Object.keys(tfCorpus)]);
    let dotProduct = 0;
    let normNew = 0;
    let normCorpus = 0;

    for (const term of allTerms) {
      const df = this.vocab.get(term)?.size || 1;
      const idf = Math.log(n / df);

      const wNew = (tfNew[term] || 0) * idf;
      const wCorpus = (tfCorpus[term] || 0) * idf;

      dotProduct += wNew * wCorpus;
      normNew += wNew * wNew;
      normCorpus += wCorpus * wCorpus;
    }

    const denominator = Math.sqrt(normNew) * Math.sqrt(normCorpus);
    return denominator > 0 ? dotProduct / denominator : 0;
  }
}

/**
 * 关联信号检测器（来自 FinceptTerminal news_correlation.py）
 */
class CorrelationSignalDetector {
  constructor(config = CLUSTERING_CONFIG.correlationSignals) {
    this.config = config;
  }

  /**
   * velocity_spike: 检测报道量突增
   * 当前时段报道数 / 前一时段报道数 >= velocitySpike
   */
  detectVelocitySpike(currentCount, previousCount) {
    if (previousCount === 0) return currentCount > 0;
    const ratio = currentCount / previousCount;
    return ratio >= this.config.velocitySpike;
  }

  /**
   * triangulation: 同一故事被多来源报道
   */
  detectTriangulation(uniqueSources) {
    return uniqueSources.length >= this.config.triangulationMin;
  }

  /**
   * keyword_spike: 威胁关键词出现次数
   */
  detectKeywordSpike(keywordCount) {
    return keywordCount >= this.config.keywordSpikeMin;
  }

  /**
   * 综合评估：任一信号触发则提升聚类优先级
   */
  anySignalActive({ currentCount, previousCount, uniqueSources, keywordCount }) {
    return (
      this.detectVelocitySpike(currentCount, previousCount) ||
      this.detectTriangulation(uniqueSources) ||
      this.detectKeywordSpike(keywordCount)
    );
  }
}

/**
 * 标准事件在线聚类引擎 (L3 Canonical Merger)
 * 融合：Jaccard 初筛 + TF-IDF 语义 + Entity Veto + Union-Find + 关联信号
 */
export class CanonicalMerger {
  constructor() {
    this.tfidf = new SimpleTFIDF();
    this.signalDetector = new CorrelationSignalDetector();
    this.clusterCache = new Map(); // canonicalId -> 代表文本（用于 TF-IDF）
  }

  /**
   * 将 ProtoEvents 合并到标准事件中（在线聚类）
   */
  async mergeProtoEvents(protoEvents, newsId) {
    const results = [];

    for (const proto of protoEvents) {
      const merged = await this.mergeSingleProtoEvent(proto, newsId);
      results.push(merged);
    }

    return results;
  }

  /**
   * 处理单个原子事件的合并逻辑
   */
  async mergeSingleProtoEvent(proto, newsId, batchCanonicals = []) {
    // 1. 优先消费上游已解析出的实体 ID；仅在缺失时按语义类型兜底
    const actorRef = await this.resolveProtoEntity(proto, 'actor');
    const objectRef = await this.resolveProtoEntity(proto, 'object');
    const locationRef = await this.resolveProtoEntity(proto, 'location');
    const actionRef = this.resolveProtoAction(proto);

    const eventTime = this._sanitizeDate(proto.time);
    const dateStr = eventTime.split('T')[0];

    // 2. 存入 proto_events 表
    const protoId = await this.saveProtoEvent({
      news_id: newsId,
      actor_raw: proto.actor,
      action_raw: proto.action,
      object_raw: proto.object,
      location_raw: proto.location,
      actor_entity_id: actorRef?.entityId,
      object_entity_id: objectRef?.entityId,
      location_id: locationRef?.entityId,
      actor_pending_id: actorRef?.pendingId,
      object_pending_id: objectRef?.pendingId,
      location_pending_id: locationRef?.pendingId,
      action_id: actionRef?.actionId,
      action_pending_id: actionRef?.pendingId,
      event_time: eventTime,
      confidence: proto.confidence,
      metadata: proto.metadata
    });

    // 3. 多层聚类：Jaccard 初筛 → TF-IDF 语义 → Entity Veto
    const clusterResult = await this.onlineClustering({
      actorRef,
      objectRef,
      locationRef,
      parentEntityKeys: this.collectParentEntityKeys(actorRef, objectRef, locationRef),
      actionRef,
      action: proto.action,
      dateStr,
      newsTitle: proto.title || `${proto.actor} ${proto.action}`,
      batchCanonicals,
    });

    let canonicalEventId;
    let isNew = false;

    if (clusterResult.bestMatch) {
      canonicalEventId = clusterResult.bestMatch.id;
      await this.mergeToExisting(protoId, canonicalEventId, newsId, clusterResult);
    } else {
      const result = await this.createCanonicalEvent({
        event_hash: clusterResult.eventHash,
        event_type: proto.action,
        start_time: eventTime,
        actor1_id: actorRef?.entityId,
        actor2_id: objectRef?.entityId,
        location_id: locationRef?.entityId,
        actor1_pending_id: actorRef?.pendingId,
        actor2_pending_id: objectRef?.pendingId,
        location_pending_id: locationRef?.pendingId,
        action_id: actionRef?.actionId,
        action_pending_id: actionRef?.pendingId,
        status: 'active'
      });
      canonicalEventId = result.id;
      isNew = result.isNew;

      if (isNew) {
        // 注册到 TF-IDF 语料库
        const titleText = proto.title || `${proto.actor} ${proto.action}`;
        this.tfidf.addDocument(titleText);
        this.clusterCache.set(canonicalEventId, titleText);
      }

      // 始终建立关联：无论是新事件还是已有事件
      await this.linkProtoToCanonical(protoId, canonicalEventId, newsId);
    }

    return { protoId, canonicalEventId, isNew };
  }

  /**
   * 多层在线聚类
   * Layer 1: Jaccard 初筛（快速排除不相关候选）
   * Layer 2: TF-IDF 语义相似度（FinceptTerminal 策略）
   * Layer 3: Entity Veto 否决（worldmonitor 策略）
   * Layer 4: 关联信号检测（提升高优先级事件的聚类权重）
   */
  async onlineClustering({ actorRef, objectRef, locationRef, parentEntityKeys = [], actionRef, action, dateStr, newsTitle, batchCanonicals = [] }) {
    // Step 1: 候选选择
    const candidates = await this.selectCandidates({
      actorKey: actorRef?.identityKey,
      objectKey: objectRef?.identityKey,
      locationKey: locationRef?.identityKey,
      dateStr,
    });

    // 合并同新闻批次中已创建的 canonical events 作为额外候选
    for (const canonical of batchCanonicals) {
      const titleText = canonical.title || canonical.event_type || '';
      const docIndex = this.tfidf.addDocument(titleText);
      candidates.push({
        id: canonical.id,
        event_type: canonical.event_type,
        start_time: canonical.start_time,
        actor1_id: canonical.actor1_id,
        actor2_id: canonical.actor2_id,
        location_id: canonical.location_id,
        actor1_pending_id: canonical.actor1_pending_id,
        actor2_pending_id: canonical.actor2_pending_id,
        location_pending_id: canonical.location_pending_id,
        action_id: canonical.action_id,
        action_pending_id: canonical.action_pending_id,
        parent_entity_keys: canonical.parent_entity_keys || [],
        actor1_key: this.buildEntityIdentityKey(canonical.actor1_id, canonical.actor1_pending_id),
        actor2_key: this.buildEntityIdentityKey(canonical.actor2_id, canonical.actor2_pending_id),
        location_key: this.buildEntityIdentityKey(canonical.location_id, canonical.location_pending_id),
        action_key: this.buildActionIdentityKey(canonical.action_id, canonical.action_pending_id, canonical.event_type),
        title: titleText,
        docIndex,
        isBatchCandidate: true,
      });
    }

    if (candidates.length === 0) {
      const eventHash = this.generateClusterHash({
        actor1Key: actorRef?.identityKey,
        actor2Key: objectRef?.identityKey,
        actionKey: actionRef?.identityKey || action,
        dateStr,
        locationKey: locationRef?.identityKey,
      });
      return { bestMatch: null, eventHash };
    }

    // Step 2: 多层评分
    let bestCandidate = null;
    let bestSimilarity = 0;
    let bestScores = null;

    for (const candidate of candidates) {
      // Layer 1: Jaccard 初筛
      const jaccard = this.calculateJaccard(newsTitle, candidate.title || candidate.event_type);
      if (jaccard < CLUSTERING_CONFIG.thresholds.jaccardFilter) continue;

      // Layer 2: Entity Veto 检查（来自 worldmonitor）
      const vetoResult = this.checkEntityVeto(
        { actorKey: actorRef?.identityKey, locationKey: locationRef?.identityKey },
        { actorKey: candidate.actor1_key, locationKey: candidate.location_key }
      );
      if (vetoResult.vetoed) continue; // 被否决，跳过此候选

      // Layer 3: TF-IDF 语义相似度
      const tfidfScore = this.tfidf.similarityToCorpus(newsTitle, candidate.docIndex);

      // Layer 4: 综合相似度计算
      let similarity = this.calculateSimilarity({
        jaccard,
        tfidf: tfidfScore,
        protoActorKey: actorRef?.identityKey,
        protoObjectKey: objectRef?.identityKey,
        protoLocationKey: locationRef?.identityKey,
        protoParentEntityKeys: parentEntityKeys,
        protoActionKey: actionRef?.identityKey || action,
        protoAction: actionRef?.canonicalAction || action,
        protoDate: dateStr,
        candidate,
      });

      // 同新闻批次内候选：额外加分
      if (candidate.isBatchCandidate) {
        similarity += CLUSTERING_CONFIG.sameNewsBoost;
      }

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestCandidate = candidate;
        bestScores = { jaccard, tfidf: tfidfScore, entityOverlap: this.calculateEntityOverlap(
          { actorKey: actorRef?.identityKey, objectKey: objectRef?.identityKey, locationKey: locationRef?.identityKey },
          { actorKey: candidate.actor1_key, objectKey: candidate.actor2_key, locationKey: candidate.location_key }
        )};
      }
    }

    // Step 3: 决策
    // 同新闻批次内候选使用更低的合并阈值（共享新闻源是强信号）
    const effectiveThreshold = bestCandidate?.isBatchCandidate
      ? CLUSTERING_CONFIG.thresholds.batchMergeThreshold
      : CLUSTERING_CONFIG.thresholds.similarityMerge;

    if (bestSimilarity >= effectiveThreshold) {
      return { bestMatch: bestCandidate, similarity: bestSimilarity, scores: bestScores };
    } else {
      const eventHash = this.generateClusterHash({
        actor1Key: actorRef?.identityKey,
        actor2Key: objectRef?.identityKey,
        actionKey: actionRef?.identityKey || action,
        dateStr,
        locationKey: locationRef?.identityKey,
      });
      return { bestMatch: null, eventHash };
    }
  }

  /**
   * Entity Veto 检查（来自 worldmonitor shouldVeto）
   * 规则：如果两个事件共享地点但行为者不同，则拒绝合并
   */
  checkEntityVeto(proto, candidate) {
    const { entityVeto } = CLUSTERING_CONFIG;
    if (!entityVeto.enabled) return { vetoed: false };

    // 规则 1: 共享地点 + 不同行为者 → 否决
    if (entityVeto.sharedLocationDifferentActor) {
      const sharedLocation = proto.locationKey && proto.locationKey === candidate.locationKey;
      const differentActor = proto.actorKey && candidate.actorKey && proto.actorKey !== candidate.actorKey;
      if (sharedLocation && differentActor) {
        return { vetoed: true, reason: 'shared_location_different_actor' };
      }
    }

    // 规则 2: 完全无共享实体 → 可选否决
    if (entityVeto.noSharedEntityVeto) {
      const hasSharedEntity =
        (proto.actorKey && proto.actorKey === candidate.actorKey) ||
        (proto.locationKey && proto.locationKey === candidate.locationKey);
      if (!hasSharedEntity) {
        return { vetoed: true, reason: 'no_shared_entity' };
      }
    }

    return { vetoed: false };
  }

  /**
   * Jaccard 相似度计算（标题分词后求交集/并集）
   * 来自 FinceptTerminal NewsClusterService.cpp 和 worldmonitor analysis-core.ts
   */
  calculateJaccard(textA, textB) {
    if (!textA || !textB) return 0;

    const tokenize = (text) => {
      const stopwords = CLUSTERING_CONFIG.financialStopwords;
      const synonyms = CLUSTERING_CONFIG.synonymMap;
      return new Set(
        text.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length > 1 && !stopwords.has(t))
          .map(t => synonyms[t] || t)
      );
    };

    const setA = tokenize(textA);
    const setB = tokenize(textB);

    if (setA.size === 0 && setB.size === 0) return 1.0;

    let intersection = 0;
    for (const t of setA) {
      if (setB.has(t)) intersection++;
    }

    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * 候选选择：时间窗口 + 实体重叠初筛
   */
  async selectCandidates({ actorKey, objectKey, locationKey, dateStr }) {
    const { timeWindowDays, minEntityOverlap } = CLUSTERING_CONFIG;

    // 查询时间窗口内的事件
    const sql = `
      SELECT
        e.id, e.event_type, e.start_time,
        e.actor1_id, e.actor2_id, e.location_id,
        e.actor1_pending_id, e.actor2_pending_id, e.location_pending_id,
        e.action_id, e.action_pending_id,
        em1.canonical_name as actor1_name,
        em2.canonical_name as actor2_name,
        em1.parent_entity_id as actor1_parent_entity_id,
        em2.parent_entity_id as actor2_parent_entity_id,
        eml.parent_entity_id as location_parent_entity_id,
        pn1.provisional_name as actor1_pending_name,
        pn2.provisional_name as actor2_pending_name
      FROM events e
      LEFT JOIN entity_mapping em1 ON e.actor1_id = em1.id
      LEFT JOIN entity_mapping em2 ON e.actor2_id = em2.id
      LEFT JOIN entity_mapping eml ON e.location_id = eml.id
      LEFT JOIN pending_normalizations pn1 ON e.actor1_pending_id = pn1.id
      LEFT JOIN pending_normalizations pn2 ON e.actor2_pending_id = pn2.id
      WHERE e.start_time >= $1::date - interval '${timeWindowDays} days'
        AND e.start_time <= $1::date + interval '${timeWindowDays} days'
        AND e.status = 'active'
      ORDER BY e.start_time DESC
      LIMIT 100
    `;

    const result = await query(sql, [dateStr]);
    const candidates = result.rows;
    for (const candidate of candidates) {
      candidate.actor1_key = this.buildEntityIdentityKey(candidate.actor1_id, candidate.actor1_pending_id);
      candidate.actor2_key = this.buildEntityIdentityKey(candidate.actor2_id, candidate.actor2_pending_id);
      candidate.location_key = this.buildEntityIdentityKey(candidate.location_id, candidate.location_pending_id);
      candidate.parent_entity_keys = this.collectParentEntityKeys(candidate);
      candidate.action_key = this.buildActionIdentityKey(candidate.action_id, candidate.action_pending_id, candidate.event_type);
    }

    // 为每个候选注册到 TF-IDF 语料库
    for (const candidate of candidates) {
      if (candidate.docIndex === undefined) {
        const titleText = candidate.title || `${candidate.actor1_name || candidate.actor1_pending_name || ''} ${candidate.event_type || ''}`;
        candidate.docIndex = this.tfidf.addDocument(titleText);
      }
    }

    // 过滤：实体重叠度 >= minEntityOverlap
    return candidates.filter(candidate => {
      const overlap = this.calculateEntityOverlap(
        { actorKey, objectKey, locationKey },
        { actorKey: candidate.actor1_key, objectKey: candidate.actor2_key, locationKey: candidate.location_key }
      );
      return overlap >= minEntityOverlap;
    });
  }

  /**
   * 计算实体重叠度 (Jaccard)
   */
  calculateEntityOverlap(protoEntities, candidateEntities) {
    const protoSet = new Set([
      protoEntities.actorKey || protoEntities.actorId,
      protoEntities.objectKey || protoEntities.objectId,
      protoEntities.locationKey || protoEntities.locationId,
    ].filter(Boolean));

    const candidateSet = new Set([
      candidateEntities.actorKey || candidateEntities.actorId,
      candidateEntities.objectKey || candidateEntities.objectId,
      candidateEntities.locationKey || candidateEntities.locationId,
    ].filter(Boolean));

    if (protoSet.size === 0 && candidateSet.size === 0) {
      return 1.0;
    }

    const intersection = [...protoSet].filter(x => candidateSet.has(x)).length;
    const union = new Set([...protoSet, ...candidateSet]).size;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * 综合相似度计算
   * 融合 Jaccard + TF-IDF + Entity Overlap + Action Match + Time Decay
   */
  calculateSimilarity({ jaccard, tfidf, protoActorKey, protoObjectKey, protoLocationKey, protoParentEntityKeys = [], protoActionKey, protoAction, protoDate, candidate }) {
    const { weights } = CLUSTERING_CONFIG;

    // 实体重叠度
    const entityOverlap = this.calculateEntityOverlap(
      { actorKey: protoActorKey, objectKey: protoObjectKey, locationKey: protoLocationKey },
      { actorKey: candidate.actor1_key, objectKey: candidate.actor2_key, locationKey: candidate.location_key }
    );

    // 动作匹配度
    const actionMatch = this.calculateActionMatch(protoAction, candidate.event_type);

    // 时间衰减
    const actionIdentityBonus = protoActionKey && candidate.action_key && protoActionKey === candidate.action_key ? 0.2 : 0;
    const parentEntityBonus = this.hasSharedParentEntity(protoParentEntityKeys, candidate.parent_entity_keys)
      ? CLUSTERING_CONFIG.parentEntityBoost
      : 0;
    const timeDecay = this.calculateTimeDecay(protoDate, candidate.start_time);

    // 加权求和
    const similarity =
      weights.jaccard * jaccard +
      weights.tfidf * tfidf +
      weights.entityOverlap * entityOverlap +
      weights.actionMatch * actionMatch +
      weights.timeDecay * timeDecay +
      actionIdentityBonus +
      parentEntityBonus;

    return similarity;
  }

  /**
   * 计算动作匹配度
   */
  calculateActionMatch(protoAction, candidateAction) {
    if (!protoAction || !candidateAction) return 0;

    const p = protoAction.toLowerCase().trim();
    const c = candidateAction.toLowerCase().trim();

    // 完全匹配
    if (p === c) return 1.0;

    // 包含关系
    if (p.includes(c) || c.includes(p)) return 0.7;

    // CAMEO 类别匹配
    const pCategory = p.split(',')[0].split(' ')[0];
    const cCategory = c.split(',')[0].split(' ')[0];
    if (pCategory === cCategory) return 0.5;

    return 0;
  }

  hasSharedParentEntity(protoParentEntityKeys = [], candidateParentEntityKeys = []) {
    const protoKeys = new Set((protoParentEntityKeys || []).filter(Boolean));
    if (protoKeys.size === 0) return false;
    return (candidateParentEntityKeys || []).some((key) => protoKeys.has(key));
  }

  /**
   * 计算时间衰减
   */
  calculateTimeDecay(protoDate, candidateDate) {
    const p = new Date(protoDate);
    const c = new Date(candidateDate);
    const dayDiff = Math.abs((p - c) / (1000 * 60 * 60 * 24));

    if (dayDiff <= 1) return 1.0;
    if (dayDiff <= 7) return 0.9;
    if (dayDiff <= 14) return 0.6;
    if (dayDiff <= 30) return 0.3;
    return 0.1;
  }

  /**
   * Union-Find 批量聚类（来自 worldmonitor）
   * 用于离线批量处理一批 proto events，而非逐条在线聚类
   */
  async batchCluster(protoEvents) {
    const uf = new UnionFind();

    // 两两比较，构建 Union-Find
    for (let i = 0; i < protoEvents.length; i++) {
      uf.find(i); // 确保初始化

      for (let j = i + 1; j < protoEvents.length; j++) {
        uf.find(j);

        const protoA = protoEvents[i];
        const protoB = protoEvents[j];

        // Jaccard 初筛
        const jaccard = this.calculateJaccard(
          `${protoA.actor} ${protoA.action}`,
          `${protoB.actor} ${protoB.action}`
        );
        if (jaccard < CLUSTERING_CONFIG.thresholds.jaccardFilter) continue;

        // Entity Veto
        const veto = this.checkEntityVeto(
          { actorKey: protoA.actorIdentityKey || this.buildEntityIdentityKey(protoA.actorEntityId, protoA.actorPendingId), locationKey: protoA.locationIdentityKey || this.buildEntityIdentityKey(protoA.locationEntityId, protoA.locationPendingId) },
          { actorKey: protoB.actorIdentityKey || this.buildEntityIdentityKey(protoB.actorEntityId, protoB.actorPendingId), locationKey: protoB.locationIdentityKey || this.buildEntityIdentityKey(protoB.locationEntityId, protoB.locationPendingId) }
        );
        if (veto.vetoed) continue;

        // 综合相似度
        const similarity = this.calculateSimilarity({
          jaccard,
          tfidf: 0, // 批量模式下简化，不做 TF-IDF
          protoActorKey: protoA.actorIdentityKey || this.buildEntityIdentityKey(protoA.actorEntityId, protoA.actorPendingId),
          protoObjectKey: protoA.objectIdentityKey || this.buildEntityIdentityKey(protoA.objectEntityId, protoA.objectPendingId),
          protoLocationKey: protoA.locationIdentityKey || this.buildEntityIdentityKey(protoA.locationEntityId, protoA.locationPendingId),
          protoActionKey: protoA.actionIdentityKey || this.buildActionIdentityKey(protoA.actionId, protoA.actionPendingId, protoA.action),
          protoAction: protoA.action,
          protoDate: protoA.dateStr,
          candidate: {
            actor1_id: protoB.actorEntityId,
            actor2_id: protoB.objectEntityId,
            location_id: protoB.locationEntityId,
            actor1_key: protoB.actorIdentityKey || this.buildEntityIdentityKey(protoB.actorEntityId, protoB.actorPendingId),
            actor2_key: protoB.objectIdentityKey || this.buildEntityIdentityKey(protoB.objectEntityId, protoB.objectPendingId),
            location_key: protoB.locationIdentityKey || this.buildEntityIdentityKey(protoB.locationEntityId, protoB.locationPendingId),
            action_key: protoB.actionIdentityKey || this.buildActionIdentityKey(protoB.actionId, protoB.actionPendingId, protoB.action),
            event_type: protoB.action,
            start_time: protoB.dateStr,
          },
        });

        if (similarity >= CLUSTERING_CONFIG.thresholds.similarityMerge) {
          uf.union(i, j);
        }
      }
    }

    return uf.clusters(); // 返回聚类分组 [[0, 3, 7], [1, 5], [2], ...]
  }

  /**
   * 故事线语义分组（来自 worldmonitor groupTopicsPostDedup）
   * 使用更低的阈值将已去重的事件按语义分组为连续叙事块
   */
  async storyThreadCanonicalEvents(canonicalEvents) {
    const uf = new UnionFind();

    for (let i = 0; i < canonicalEvents.length; i++) {
      uf.find(i);
      const eventA = canonicalEvents[i];
      const titleA = this.clusterCache.get(eventA.id) || eventA.event_type || '';

      for (let j = i + 1; j < canonicalEvents.length; j++) {
        uf.find(j);
        const eventB = canonicalEvents[j];
        const titleB = this.clusterCache.get(eventB.id) || eventB.event_type || '';

        // 使用更低的 Jaccard 阈值（叙事分组比合并更宽松）
        const jaccard = this.calculateJaccard(titleA, titleB);
        if (jaccard >= CLUSTERING_CONFIG.thresholds.storyThread) {
          uf.union(i, j);
        }
      }
    }

    const clusters = uf.clusters();
    // 返回按故事线分组的事件列表
    return clusters.map(indices => indices.map(i => canonicalEvents[i]));
  }

  /**
   * 生成聚类哈希
   */
  generateClusterHash({ actor1Key, actor2Key, actionKey, dateStr, locationKey, actor1Id = null, actor2Id = null, action = null, locationId = null }) {
    const key = [
      actor1Key || (actor1Id ? `entity:${actor1Id}` : ''),
      actor2Key || (actor2Id ? `entity:${actor2Id}` : ''),
      actionKey || action || '',
      dateStr,
      locationKey || (locationId ? `entity:${locationId}` : ''),
    ].join('|');

    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'cluster_' + Math.abs(hash).toString(36);
  }

  /**
   * 合并到现有事件
   */
  async mergeToExisting(protoId, canonicalEventId, newsId, clusterResult) {
    await this.linkProtoToCanonical(protoId, canonicalEventId, newsId);
    await this.updateEventStats(canonicalEventId);

    const scores = clusterResult.scores || {};
    console.log(
      `[Clustering] Merged proto_event ${protoId} to event ${canonicalEventId} ` +
      `(similarity: ${clusterResult.similarity.toFixed(2)}, ` +
      `jaccard: ${scores.jaccard?.toFixed(2) || 'n/a'}, ` +
      `tfidf: ${scores.tfidf?.toFixed(2) || 'n/a'}, ` +
      `entityOverlap: ${scores.entityOverlap?.toFixed(2) || 'n/a'})`
    );
  }

  /**
   * 更新事件统计信息
   */
  async updateEventStats(eventId) {
    const sql = `
      UPDATE events SET
        total_news_count = (SELECT COUNT(DISTINCT news_id) FROM proto_events WHERE canonical_event_id = $1),
        total_mentions = (SELECT COUNT(*) FROM proto_events WHERE canonical_event_id = $1),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    await query(sql, [eventId]);
  }

  /**
   * 确保日期字符串合法
   */
  _sanitizeDate(dateStr) {
    if (!dateStr) return new Date().toISOString();
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  async resolveProtoEntity(proto, field) {
    const idField = field === 'location' ? 'location_entity_id' : `${field}_entity_id`;
    const pendingField = field === 'location' ? 'location_pending_id' : `${field}_pending_id`;
    const existingId = proto?.[idField] || proto?.metadata?.entity_resolution?.[field]?.entity_id;
    const pendingId = proto?.[pendingField] || proto?.metadata?.entity_resolution?.[field]?.pending_id;
    const resolutionMeta = proto?.metadata?.entity_resolution?.[field] || {};

    if (existingId) {
      const existingEntity = await getEntityById(existingId);
      if (existingEntity) {
        return {
          entityId: existingEntity.id,
          pendingId: null,
          name: existingEntity.canonical_name,
          identityKey: `entity:${existingEntity.id}`,
          parentEntityId: existingEntity.parent_entity_id || null,
          entity: existingEntity
        };
      }
    }

    if (pendingId) {
      const pending = await getPendingNormalizationById(pendingId);
      if (pending) {
        return {
          entityId: null,
          pendingId: pending.id,
          name: pending.provisional_name || pending.raw_value,
          identityKey: `pending_entity:${pending.id}`,
          parentEntity: pending.parent_entity_name || null,
          parentEntityId: pending.parent_entity_id || null,
          pending
        };
      }
    }

    const value = typeof proto?.[field] === 'string' ? proto[field].trim() : '';
    if (!value) {
      return null;
    }

    const fallbackKey = `raw_${field}:${value.toLowerCase()}`;
    return {
      entityId: null,
      pendingId: null,
      name: resolutionMeta.canonical_name || value,
      identityKey: fallbackKey,
      pending: null
    };
  }

  resolveProtoAction(proto) {
    const actionId = proto?.action_id || proto?.metadata?.action_resolution?.action_id || null;
    const pendingId = proto?.action_pending_id || proto?.metadata?.action_resolution?.pending_id || null;
    const canonicalAction = proto?.metadata?.action_resolution?.canonical_action || proto?.action || null;
    return {
      actionId,
      pendingId,
      canonicalAction,
      identityKey: this.buildActionIdentityKey(actionId, pendingId, canonicalAction)
    };
  }

  normalizeSemanticEntityType(value, field) {
    const cleaned = String(value || '').trim();
    if (cleaned) {
      return cleaned;
    }
    return field === 'location' ? 'location' : 'organization';
  }

  buildEntityIdentityKey(entityId, pendingId) {
    if (entityId) return `entity:${entityId}`;
    if (pendingId) return `pending_entity:${pendingId}`;
    return null;
  }

  buildActionIdentityKey(actionId, pendingId, fallbackAction = null) {
    if (actionId) return `action:${actionId}`;
    if (pendingId) return `pending_action:${pendingId}`;
    const cleaned = String(fallbackAction || '').trim().toLowerCase();
    return cleaned ? `raw_action:${cleaned}` : null;
  }

  collectParentEntityKeys(...items) {
    const keys = [];
    for (const item of items.flat().filter(Boolean)) {
      const ids = [
        item.parentEntityId,
        item.entity?.parent_entity_id,
        item.pending?.parent_entity_id,
        item.actor1_parent_entity_id,
        item.actor2_parent_entity_id,
        item.location_parent_entity_id,
      ];
      for (const id of ids) {
        if (id) keys.push(`parent_entity:${id}`);
      }
      const names = [item.parentEntity, item.pending?.parent_entity_name];
      for (const name of names) {
        const cleaned = String(name || '').trim().toLowerCase();
        if (cleaned && !/^\d+$/.test(cleaned)) keys.push(`parent_entity_name:${cleaned}`);
      }
    }
    return [...new Set(keys)];
  }

  /**
   * 保存原子事件
   */
  async saveProtoEvent(data) {
    const sql = `
      INSERT INTO proto_events (
        news_id, actor_raw, action_raw, object_raw, location_raw,
        actor_entity_id, object_entity_id, location_id,
        actor_pending_id, object_pending_id, location_pending_id,
        action_id, action_pending_id,
        event_time, extraction_confidence, raw_extraction
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `;
    const result = await query(sql, [
      data.news_id, data.actor_raw, data.action_raw, data.object_raw, data.location_raw,
      data.actor_entity_id, data.object_entity_id, data.location_id,
      data.actor_pending_id, data.object_pending_id, data.location_pending_id,
      data.action_id, data.action_pending_id,
      data.event_time, data.confidence, JSON.stringify(data.metadata || {})
    ]);
    return result.rows[0].id;
  }

  /**
   * 创建标准事件
   * 如果 event_hash 冲突（已存在），返回已有事件的 ID（isNew = false）
   */
  async createCanonicalEvent(data) {
    // 先检查是否已存在相同 hash 的事件
    const existing = await queryOne(
      'SELECT id FROM events WHERE event_hash = $1',
      [data.event_hash]
    );

    if (existing) {
      console.log(`[CanonicalMerger] Event hash ${data.event_hash} already exists, using existing event ${existing.id}`);
      return { id: existing.id, isNew: false };
    }

    const sql = `
      INSERT INTO events (
        event_hash, event_type, start_time,
        actor1_id, actor2_id, location_id,
        actor1_pending_id, actor2_pending_id, location_pending_id,
        action_id, action_pending_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;
    const result = await query(sql, [
      data.event_hash, data.event_type, data.start_time,
      data.actor1_id, data.actor2_id, data.location_id,
      data.actor1_pending_id, data.actor2_pending_id, data.location_pending_id,
      data.action_id, data.action_pending_id, data.status
    ]);
    return { id: result.rows[0].id, isNew: true };
  }

  /**
   * 关联原子事件到标准事件
   */
  async linkProtoToCanonical(protoId, canonicalId, newsId) {
    await query(`
      UPDATE proto_events
      SET canonical_event_id = $1,
          raw_extraction = COALESCE(raw_extraction, '{}'::jsonb) || $2::jsonb
      WHERE id = $3
    `, [
      canonicalId,
      JSON.stringify({ canonical_id: canonicalId }),
      protoId
    ]);

    await query(`
      INSERT INTO event_news (event_id, news_id, confidence)
      VALUES ($1, $2, 0.8)
      ON CONFLICT (event_id, news_id) DO NOTHING
    `, [canonicalId, newsId]);
  }

  /**
   * 查找完全匹配的事件（用于去重）
   */
  async findExistingProtoEvent(proto, excludeNewsId) {
    if (!proto.actor || !proto.action) return null;

    const eventTime = proto.event_time ? new Date(proto.event_time) : new Date();
    const dateStr = eventTime.toISOString().split('T')[0];

    const sql = `
      SELECT pe.id FROM proto_events pe
      WHERE LOWER(pe.actor_raw) = LOWER($1)
        AND LOWER(pe.action_raw) = LOWER($2)
        AND pe.event_time::date = $3::date
        AND pe.news_id != $4
      LIMIT 1
    `;
    const res = await query(sql, [proto.actor, proto.action, dateStr, excludeNewsId]);
    return res.rows[0]?.id || null;
  }
}

export const canonicalMerger = new CanonicalMerger();
