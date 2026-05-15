import { query as dbQuery } from '../db/connection.mjs';
import { getEventById } from '../db/events-queries.mjs';

class EventRelationshipAnalyzer {

    constructor() {
        this.relationshipTypes = {
            PARENT_CHILD: 'parent_child',
            CAUSE_EFFECT: 'cause_effect',
            EVOLUTION: 'evolution',
            TRIGGER: 'trigger',
            RELATED: 'related',
            TEMPORAL: 'temporal',
            SUB_EVENT: 'sub_event'
        };

        // 评分权重配置
        this.scores = {
            entityOverlap: 0.3,
            actionCompat: 0.15,
            semanticSim: 0.25,
            temporalProx: 0.2,
            spatialProx: 0.1
        };

        // 动作分类体系（动作兼容性）
        this.actionTaxonomy = {
            'cut_supply': { category: 'economic', score: 0.9 },
            'shortage': { category: 'economic', score: 0.85 },
            'sanction': { category: 'economic', score: 0.95 },
            'price_increase': { category: 'economic', score: 0.8 },
            'attack': { category: 'military', score: 0.95 },
            'retaliation': { category: 'military', score: 0.9 },
            'announcement': { category: 'political', score: 0.75 },
            'market_move': { category: 'economic', score: 0.8 },
            'negotiate': { category: 'political', score: 0.85 },
            'sign_treaty': { category: 'political', score: 0.9 },
            'protest': { category: 'social', score: 0.8 },
            'arrest': { category: 'law', score: 0.85 },
            'consult': { category: 'political', score: 0.8 },
            'threaten': { category: 'military', score: 0.85 }
        };

        // 因果关系模式匹配库
        this.causalPatterns = [
            { cause: 'cut_supply', effect: 'shortage', weight: 0.95 },
            { cause: 'sanction', effect: 'price_increase', weight: 0.9 },
            { cause: 'attack', effect: 'retaliation', weight: 0.95 },
            { cause: 'announcement', effect: 'market_move', weight: 0.85 },
            { cause: 'negotiate', effect: 'sign_treaty', weight: 0.9 },
            { cause: 'protest', effect: 'arrest', weight: 0.8 },
            { cause: 'threaten', effect: 'negotiate', weight: 0.8 }
        ];

        // 子事件模式库
        this.subEventPatterns = [
            ['军事冲突', '谈判'],
            ['军事冲突', '停火'],
            ['经济制裁', '谈判'],
            ['政治危机', '选举'],
            ['贸易谈判', '协议签署'],
            ['经济制裁', '协议'],
            ['抗议活动', '示威'],
            ['抗议', '逮捕'],
            ['第一轮谈判', '第二轮谈判'],
            ['军事冲突升级', '军事冲突缓和']
        ];
    }

    normalizeStringList(values) {
        if (!Array.isArray(values)) {
            return [];
        }
        return [...new Set(values.map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
    }

    getEventMetadata(event) {
        return event?.normalized_data && typeof event.normalized_data === 'object'
            ? event.normalized_data
            : {};
    }

    getEventSignals(event) {
        const metadata = this.getEventMetadata(event);
        const evidence = metadata.extracted_evidence || {};

        return {
            triggerKeywords: this.normalizeStringList([
                ...(metadata.trigger_keywords || []),
                ...(evidence.trigger_keywords || []),
            ]),
            evidenceSnippets: this.normalizeStringList([
                ...(metadata.evidence_snippets || []),
                ...(evidence.evidence_snippets || []),
            ]),
            timeExpressions: this.normalizeStringList([
                ...(metadata.time_expressions || []),
                ...(evidence.time_expressions || []),
            ]),
            causalSuggestion: String(metadata.causal_suggestion || '').trim().toLowerCase(),
            temporalStatus: String(metadata.temporal_status || '').trim().toLowerCase(),
            summaryText: [
                event.event_type,
                event.title,
                event.description,
                metadata.title,
                metadata.description,
                metadata.causal_suggestion,
                ...(metadata.evidence_snippets || []),
            ].filter(Boolean).join(' ').toLowerCase(),
        };
    }

    haveLexicalOverlap(left, right) {
        if (!left || !right || left.length === 0 || right.length === 0) return false;
        return left.some(item => right.includes(item));
    }

    haveStringOverlap(str1, str2, minOverlap = 2) {
        const s1 = String(str1 || '').toLowerCase();
        const s2 = String(str2 || '').toLowerCase();

        if (s1.length < minOverlap || s2.length < minOverlap) return false;

        for (let i = 0; i <= s1.length - minOverlap; i++) {
            const chunk = s1.substring(i, i + minOverlap);
            if (s2.includes(chunk)) return true;
        }
        return false;
    }

    containsSignalText(text, keywords) {
        const normalizedText = String(text || '').toLowerCase();
        return keywords.some(keyword => normalizedText.includes(keyword));
    }

    hasSharedContext(event1, event2) {
        const actorIds1 = [event1.actor1_id, event1.actor2_id].filter(Boolean);
        const actorIds2 = [event2.actor1_id, event2.actor2_id].filter(Boolean);
        const hasCommonActor = actorIds1.some(actorId => actorIds2.includes(actorId));
        const hasCommonLocation =
            Boolean(event1.location_id) &&
            Boolean(event2.location_id) &&
            event1.location_id === event2.location_id;

        return hasCommonActor || hasCommonLocation;
    }

    buildRelationship(sourceEventId, targetEventId, relationshipType, confidence, weight, description) {
        return {
            source_event_id: sourceEventId,
            target_event_id: targetEventId,
            relationship_type: relationshipType,
            confidence,
            weight,
            description,
        };
    }

    // === 多特征评分函数 ===

    /**
     * 实体重叠评分（Jaccard相似度）
     */
    calculateEntityOverlap(event1, event2) {
        const entities1 = new Set([
            ...[event1.actor1_id, event1.actor2_id].filter(Boolean),
            ...(event1.location_id ? [event1.location_id] : [])
        ]);

        const entities2 = new Set([
            ...[event2.actor1_id, event2.actor2_id].filter(Boolean),
            ...(event2.location_id ? [event2.location_id] : [])
        ]);

        if (entities1.size === 0 || entities2.size === 0) return 0;

        const intersection = new Set([...entities1].filter(x => entities2.has(x)));
        const union = new Set([...entities1, ...entities2]);

        return intersection.size / union.size;
    }

    /**
     * 动作兼容性评分
     */
    calculateActionCompatibility(event1, event2) {
        const type1 = event1.event_type.toLowerCase();
        const type2 = event2.event_type.toLowerCase();

        // 查找动作分类
        const action1 = Object.keys(this.actionTaxonomy).find(key =>
            type1.includes(key.toLowerCase())
        );
        const action2 = Object.keys(this.actionTaxonomy).find(key =>
            type2.includes(key.toLowerCase())
        );

        if (!action1 || !action2) return 0.3; // 默认相似度

        // 相同分类得分较高
        if (this.actionTaxonomy[action1].category === this.actionTaxonomy[action2].category) {
            return (this.actionTaxonomy[action1].score + this.actionTaxonomy[action2].score) / 2 * 0.9;
        }

        return 0.3; // 不同分类得分较低
    }

    /**
     * 时间接近度评分（指数衰减）
     */
    calculateTemporalProximity(event1, event2) {
        const t1 = new Date(event1.start_time);
        const t2 = new Date(event2.start_time);
        const delta = Math.abs(t1 - t2);
        const days = delta / (1000 * 60 * 60 * 24);

        const tau = 7; // 衰减常数（天）
        return Math.exp(-days / tau);
    }

    /**
     * 空间接近度评分
     */
    calculateSpatialProximity(event1, event2) {
        if (!event1.location_id || !event2.location_id) return 0;

        if (event1.location_id === event2.location_id) {
            return 1.0;
        }

        // 简化的相邻区域判断（实际项目中需要地理信息系统支持）
        // 这里使用简单的启发式：如果location_id差值较小，视为相邻
        const idDiff = Math.abs(event1.location_id - event2.location_id);
        if (idDiff <= 3) {
            return 0.7;
        }

        return 0;
    }

    /**
     * 语义相似度评分（预留）
     */
    calculateSemanticSimilarity(event1, event2) {
        // 预留接口：未来可以接入Embedding模型（如BERT、Sentence-BERT）
        // 目前返回基于文本重叠的简单相似度
        const text1 = [event1.event_type, event1.title, event1.description].filter(Boolean).join(' ').toLowerCase();
        const text2 = [event2.event_type, event2.title, event2.description].filter(Boolean).join(' ').toLowerCase();

        const words1 = new Set(text1.split(/\s+/));
        const words2 = new Set(text2.split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        if (union.size === 0) return 0;
        return intersection.size / union.size * 0.5; // 缩放因子
    }

    /**
     * 统一评分函数
     */
    calculateTotalScore(event1, event2) {
        const entityOverlap = this.calculateEntityOverlap(event1, event2);
        const actionCompat = this.calculateActionCompatibility(event1, event2);
        const semanticSim = this.calculateSemanticSimilarity(event1, event2);
        const temporalProx = this.calculateTemporalProximity(event1, event2);
        const spatialProx = this.calculateSpatialProximity(event1, event2);

        const totalScore =
            this.scores.entityOverlap * entityOverlap +
            this.scores.actionCompat * actionCompat +
            this.scores.semanticSim * semanticSim +
            this.scores.temporalProx * temporalProx +
            this.scores.spatialProx * spatialProx;

        return Math.max(0, Math.min(1, totalScore));
    }

    // === 候选集检索优化 ===

    async findCandidateEvents(event) {
        const sql = `
            SELECT DISTINCT e.*
            FROM events e
            WHERE
                -- 时间相近（7天内，可调）
                ABS(EXTRACT(DAY FROM e.start_time - $1)) < 7
                AND (
                    -- 必须有实质性关联
                    (
                        -- 相同的参与者（且参与者不是 Unknown）
                        (e.actor1_id IS NOT NULL AND e.actor1_id IN ($2, $3))
                        OR (e.actor2_id IS NOT NULL AND e.actor2_id IN ($2, $3))
                    )
                    -- 或相同位置（且位置明确）
                    OR (e.location_id IS NOT NULL AND e.location_id = $4)
                    -- 如果没有实体关联，则至少要求类型相同且时间极度接近（2天内）
                    OR (e.event_type = $5 AND ABS(EXTRACT(DAY FROM e.start_time - $1)) < 2)
                )
                AND e.id != $6
            LIMIT 50
        `;

        const result = await dbQuery(sql, [
            event.start_time,
            event.actor1_id,
            event.actor2_id,
            event.location_id,
            event.event_type,
            event.id
        ]);

        return result.rows;
    }

    // === 边类型判定规则 ===

    /**
     * Temporal（时间边）
     */
    isTemporalRelationship(event1, event2) {
        if (!event1.end_time || !event2.start_time) return false;
        return new Date(event1.end_time) <= new Date(event2.start_time);
    }

    /**
     * Sub Event（子事件）
     */
    isSubEventRelationship(subEvent, parentEvent) {
        const startTimeGap = (new Date(subEvent.start_time) - new Date(parentEvent.start_time)) /
                        (1000 * 60 * 60 * 24);

        // 子事件必须在父事件之后开始
        if (startTimeGap < 0) return false;

        // 子事件必须完全包含在父事件的时间范围内
        if (parentEvent.end_time && subEvent.start_time > parentEvent.end_time) return false;

        // 实体高度重叠
        const entityOverlap = this.calculateEntityOverlap(subEvent, parentEvent);
        if (entityOverlap < 0.7) return false;

        // 动作语义匹配
        const subType = subEvent.event_type.toLowerCase();
        const parentType = parentEvent.event_type.toLowerCase();

        const matchingPair = this.subEventPatterns.find(pair =>
            (parentType.includes(pair[0]) && subType.includes(pair[1]))
        );

        return !!matchingPair;
    }

    /**
     * 因果关系模式匹配
     */
    findCausalPattern(causeEvent, effectEvent) {
        const causeType = causeEvent.event_type.toLowerCase();
        const effectType = effectEvent.event_type.toLowerCase();

        return this.causalPatterns.find(pattern => {
            return causeType.includes(pattern.cause) && effectType.includes(pattern.effect);
        });
    }

    // 判断是否为父子关系
    isParentChildRelationship(child, parent) {
        const timeGap = (new Date(child.start_time) - new Date(parent.start_time)) /
                        (1000 * 60 * 60 * 24);

        if (timeGap < 0) return false;
        if (parent.end_time && child.start_time > parent.end_time) return false;

        const parentActors = [parent.actor1_id, parent.actor2_id].filter(Boolean);
        const childActors = [child.actor1_id, child.actor2_id].filter(Boolean);
        if (childActors.length > 0 && parentActors.length > 0) {
            const hasCommonActor = childActors.some(actor => parentActors.includes(actor));
            if (!hasCommonActor) return false;
        }

        const parentChildTypePairs = [
            ['军事冲突', '谈判'],
            ['军事冲突', '停火'],
            ['经济制裁', '谈判'],
            ['政治危机', '选举'],
            ['贸易谈判', '协议签署'],
            ['经济制裁', '协议'],
            ['抗议活动', '示威'],
            ['抗议', '逮捕'],
            ['Fight', 'Negotiate'],
            ['Fight', 'Consult'],
            ['Threaten', 'Negotiate'],
            ['Consult', 'Sign a treaty or agreement']
        ];

        const matchingPair = parentChildTypePairs.find(pair =>
            (parent.event_type.includes(pair[0]) && child.event_type.includes(pair[1]))
        );

        return !!matchingPair;
    }

    // 判断是否为因果关系
    isCauseEffectRelationship(cause, effect) {
        const timeGap = (new Date(effect.start_time) - new Date(cause.start_time)) /
                        (1000 * 60 * 60 * 24);

        if (timeGap < 0 || timeGap > 30) return false; // 限制在30天内

        const causeActors = [cause.actor1_id, cause.actor2_id].filter(Boolean);
        const effectActors = [effect.actor1_id, effect.actor2_id].filter(Boolean);
        if (causeActors.length > 0 && effectActors.length > 0) {
            const hasCommonActor = causeActors.some(actor => effectActors.includes(actor));
            if (!hasCommonActor) return false;
        }

        // 模式匹配
        const pattern = this.findCausalPattern(cause, effect);
        if (pattern) return true;

        const causeSignals = this.getEventSignals(cause);
        const effectSignals = this.getEventSignals(effect);

        // 证据驱动的因果关系
        const evidenceDriven =
            this.hasSharedContext(cause, effect) &&
            (
                (effectSignals.causalSuggestion &&
                    (
                        effectSignals.causalSuggestion.includes(cause.event_type.toLowerCase()) ||
                        this.containsSignalText(effectSignals.causalSuggestion, causeSignals.triggerKeywords)
                    )) ||
                (/(after|following|due to|because of|in response to|amid|triggered by|由于|因为|基于|导致|引起|在.*之后|响应)/.test(effectSignals.summaryText) &&
                    (
                        effectSignals.summaryText.includes(cause.event_type.toLowerCase()) ||
                        this.containsSignalText(effectSignals.summaryText, causeSignals.triggerKeywords)
                    ))
            );

        return evidenceDriven;
    }

    // 判断是否为演变关系
    isEvolutionRelationship(earlier, later) {
        const timeGap = (new Date(later.start_time) - new Date(earlier.start_time)) /
                        (1000 * 60 * 60 * 24);

        if (timeGap < 1) return false;

        if (earlier.actor1_id !== later.actor1_id || earlier.actor2_id !== later.actor2_id) {
            return false;
        }

        if (earlier.location_id !== later.location_id) {
            return false;
        }

        const earlierSignals = this.getEventSignals(earlier);
        const laterSignals = this.getEventSignals(later);

        const similarTypes = [
            ['第一轮谈判', '第二轮谈判'],
            ['军事冲突升级', '军事冲突缓和'],
            ['抗议活动', '抗议升级'],
            ['Consult', 'Consult'],
            ['Protest', 'Protest'],
            ['Fight', 'Fight']
        ];

        const isSimilarType = similarTypes.some(pair =>
            earlier.event_type.includes(pair[0]) && later.event_type.includes(pair[1]) ||
            earlier.event_type === later.event_type
        );

        const temporalSeries =
            (laterSignals.summaryText.includes('second round') && earlierSignals.summaryText.includes('first round')) ||
            (laterSignals.summaryText.includes('phase two') && earlierSignals.summaryText.includes('phase one')) ||
            (laterSignals.timeExpressions.some(item => item.includes('next week')) && earlierSignals.timeExpressions.some(item => item.includes('this week')));

        return isSimilarType || temporalSeries;
    }

    isTriggerRelationship(triggerEvent, responseEvent) {
        const timeGap = (new Date(responseEvent.start_time) - new Date(triggerEvent.start_time)) /
                        (1000 * 60 * 60 * 24);

        if (timeGap < 0 || timeGap > 21) return false;
        if (!this.hasSharedContext(triggerEvent, responseEvent)) return false;

        const triggerSignals = this.getEventSignals(triggerEvent);
        const responseSignals = this.getEventSignals(responseEvent);
        const responseLanguage = /(after|following|in response to|retaliation|retaliatory|triggered by|sparked by|amid|由于|因为|基于|导致|引起|在.*之后|响应|报复)/;

        return responseLanguage.test(responseSignals.summaryText) &&
            (
                responseSignals.summaryText.includes(triggerEvent.event_type.toLowerCase()) ||
                this.containsSignalText(responseSignals.summaryText, triggerSignals.triggerKeywords) ||
                this.haveLexicalOverlap(triggerSignals.triggerKeywords, responseSignals.triggerKeywords)
            );
    }

    // 判断是否为一般相关关系
    isRelated(event1, event2) {
        const totalScore = this.calculateTotalScore(event1, event2);
        return totalScore >= 0.7;
    }

    // === 事件关系分析 ===

    async analyzeNewEventRelationships(newEventId) {
        const newEvent = await getEventById(newEventId);
        if (!newEvent) {
            return [];
        }

        const candidateEvents = await this.findCandidateEvents(newEvent);
        const relationships = [];

        for (const candidate of candidateEvents) {
            const detected = await this.analyzeEventRelationship(newEvent, candidate);
            if (detected.length > 0) {
                relationships.push(...detected);
            }
        }

        return relationships;
    }

    async analyzeEventRelationship(event1, event2) {
        if (!event1 || !event2 || event1.id === event2.id) {
            return [];
        }

        const relationships = [];
        const seen = new Set();

        const pushRelationship = relationship => {
            const key = `${relationship.source_event_id}:${relationship.target_event_id}:${relationship.relationship_type}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            relationships.push(relationship);
        };

        const totalScore = this.calculateTotalScore(event1, event2);

        // 1. 时间边
        if (this.isTemporalRelationship(event1, event2)) {
            pushRelationship(this.buildRelationship(
                event1.id,
                event2.id,
                this.relationshipTypes.TEMPORAL,
                totalScore * 0.9,
                this.calculateTemporalProximity(event1, event2),
                `${event1.event_type} 在 ${event2.event_type} 之前发生`
            ));
        }

        if (this.isTemporalRelationship(event2, event1)) {
            pushRelationship(this.buildRelationship(
                event2.id,
                event1.id,
                this.relationshipTypes.TEMPORAL,
                totalScore * 0.9,
                this.calculateTemporalProximity(event2, event1),
                `${event2.event_type} 在 ${event1.event_type} 之前发生`
            ));
        }

        // 2. 子事件边
        if (this.isSubEventRelationship(event1, event2)) {
            pushRelationship(this.buildRelationship(
                event2.id,
                event1.id,
                this.relationshipTypes.SUB_EVENT,
                0.85,
                totalScore * 0.9,
                `${event1.event_type} 是 ${event2.event_type} 的一部分`
            ));
        }

        if (this.isSubEventRelationship(event2, event1)) {
            pushRelationship(this.buildRelationship(
                event1.id,
                event2.id,
                this.relationshipTypes.SUB_EVENT,
                0.85,
                totalScore * 0.9,
                `${event2.event_type} 是 ${event1.event_type} 的一部分`
            ));
        }

        // 3. 因果关系
        if (this.isCauseEffectRelationship(event1, event2)) {
            const patternWeight = this.findCausalPattern(event1, event2)?.weight || 0.8;
            pushRelationship(this.buildRelationship(
                event1.id,
                event2.id,
                this.relationshipTypes.CAUSE_EFFECT,
                0.78,
                totalScore * patternWeight,
                `${event1.event_type} 可能导致了 ${event2.event_type}`
            ));
        }

        if (this.isCauseEffectRelationship(event2, event1)) {
            const patternWeight = this.findCausalPattern(event2, event1)?.weight || 0.8;
            pushRelationship(this.buildRelationship(
                event2.id,
                event1.id,
                this.relationshipTypes.CAUSE_EFFECT,
                0.78,
                totalScore * patternWeight,
                `${event2.event_type} 可能导致了 ${event1.event_type}`
            ));
        }

        // 4. 父子关系
        if (this.isParentChildRelationship(event1, event2)) {
            pushRelationship(this.buildRelationship(
                event2.id,
                event1.id,
                this.relationshipTypes.PARENT_CHILD,
                0.85,
                totalScore * 0.9,
                `${event1.event_type} 是 ${event2.event_type} 的一部分`
            ));
        }

        if (this.isParentChildRelationship(event2, event1)) {
            pushRelationship(this.buildRelationship(
                event1.id,
                event2.id,
                this.relationshipTypes.PARENT_CHILD,
                0.85,
                totalScore * 0.9,
                `${event2.event_type} 是 ${event1.event_type} 的一部分`
            ));
        }

        // 5. 演变关系
        if (this.isEvolutionRelationship(event1, event2)) {
            pushRelationship(this.buildRelationship(
                event1.id,
                event2.id,
                this.relationshipTypes.EVOLUTION,
                0.8,
                totalScore * 0.85,
                `${event2.event_type} 是 ${event1.event_type} 的发展或演变`
            ));
        }

        if (this.isEvolutionRelationship(event2, event1)) {
            pushRelationship(this.buildRelationship(
                event2.id,
                event1.id,
                this.relationshipTypes.EVOLUTION,
                0.8,
                totalScore * 0.85,
                `${event1.event_type} 是 ${event2.event_type} 的发展或演变`
            ));
        }

        // 6. 触发关系
        if (this.isTriggerRelationship(event1, event2)) {
            pushRelationship(this.buildRelationship(
                event1.id,
                event2.id,
                this.relationshipTypes.TRIGGER,
                0.74,
                totalScore * 0.82,
                `${event2.event_type} 可能由 ${event1.event_type} 触发`
            ));
        }

        if (this.isTriggerRelationship(event2, event1)) {
            pushRelationship(this.buildRelationship(
                event2.id,
                event1.id,
                this.relationshipTypes.TRIGGER,
                0.74,
                totalScore * 0.82,
                `${event1.event_type} 可能由 ${event2.event_type} 触发`
            ));
        }

        // 7. 一般相关关系
        if (relationships.length === 0 && this.isRelated(event1, event2)) {
            pushRelationship(this.buildRelationship(
                Math.min(event1.id, event2.id),
                Math.max(event1.id, event2.id),
                this.relationshipTypes.RELATED,
                0.62,
                totalScore * 0.5,
                `${event1.event_type} 和 ${event2.event_type} 相关`
            ));
        }

        return relationships;
    }

    // === 增量图更新 ===

    /**
     * 更新事件图（增量方式）
     */
    async updateGraphForNewEvent(eventId) {
        console.log(`正在为事件 ${eventId} 更新事件图...`);

        const relationships = await this.analyzeNewEventRelationships(eventId);

        if (relationships.length === 0) {
            console.log(`事件 ${eventId} 没有检测到新的关系`);
            return [];
        }

        // 这里可以添加保存关系的逻辑（调用 event-relationships-queries.mjs）
        console.log(`为事件 ${eventId} 检测到 ${relationships.length} 个新关系`);
        console.log('关系详情:', relationships);

        return relationships;
    }

    /**
     * 定期再平衡（清理弱边）
     */
    async rebalanceGraph() {
        console.log('开始图再平衡...');

        const sql = `
            DELETE FROM event_relationships
            WHERE weight < 0.3
            RETURNING id;
        `;

        const result = await dbQuery(sql);
        console.log(`删除了 ${result.rows.length} 条弱边`);

        return result.rows.length;
    }
}

export const eventRelationshipAnalyzer = new EventRelationshipAnalyzer();
