const DAY_MS = 24 * 60 * 60 * 1000;

export class AtomicRelationshipAnalyzer {
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

    this.scores = {
      entityOverlap: 0.35,
      actionCompat: 0.15,
      semanticSim: 0.2,
      temporalProx: 0.2,
      spatialProx: 0.1
    };

    this.actionTaxonomy = {
      cut_supply: { category: 'economic', score: 0.9 },
      shortage: { category: 'economic', score: 0.85 },
      sanction: { category: 'economic', score: 0.95 },
      price_increase: { category: 'economic', score: 0.8 },
      attack: { category: 'military', score: 0.95 },
      retaliation: { category: 'military', score: 0.9 },
      announcement: { category: 'political', score: 0.75 },
      market_move: { category: 'economic', score: 0.8 },
      negotiate: { category: 'political', score: 0.85 },
      sign_treaty: { category: 'political', score: 0.9 },
      protest: { category: 'social', score: 0.8 },
      arrest: { category: 'law', score: 0.85 },
      consult: { category: 'political', score: 0.8 },
      threaten: { category: 'military', score: 0.85 }
    };

    this.causalPatterns = [
      { cause: 'cut_supply', effect: 'shortage', weight: 0.95 },
      { cause: 'sanction', effect: 'price_increase', weight: 0.9 },
      { cause: 'attack', effect: 'retaliation', weight: 0.95 },
      { cause: 'announcement', effect: 'market_move', weight: 0.85 },
      { cause: 'negotiate', effect: 'sign_treaty', weight: 0.9 },
      { cause: 'protest', effect: 'arrest', weight: 0.8 },
      { cause: 'threaten', effect: 'negotiate', weight: 0.8 }
    ];
  }

  analyzeProtoRelationship(protoA, protoB) {
    if (!protoA || !protoB || protoA.id === protoB.id) return [];

    const relationships = [];
    const seen = new Set();
    const pushRelationship = relationship => {
      const key = `${relationship.source_proto_event_id}:${relationship.target_proto_event_id}:${relationship.relationship_type}`;
      if (seen.has(key)) return;
      seen.add(key);
      relationships.push(relationship);
    };

    const totalScore = this.calculateTotalScore(protoA, protoB);

    // 快速剪枝：如果总分过低，直接跳过
    if (totalScore < 0.35) return [];

    if (this.isSubEventRelationship(protoA, protoB)) {
      pushRelationship(this.buildRelationship(
        protoB,
        protoA,
        this.relationshipTypes.SUB_EVENT,
        0.78,
        clamp(totalScore * 0.9, 0.35, 0.98),
        `${this.describeProto(protoA)} is part of ${this.describeProto(protoB)}`
      ));
    }

    if (this.isCauseEffectRelationship(protoA, protoB)) {
      const patternWeight = this.findCausalPattern(protoA, protoB)?.weight || 0.8;
      pushRelationship(this.buildRelationship(
        protoA,
        protoB,
        this.relationshipTypes.CAUSE_EFFECT,
        0.78,
        clamp(totalScore * patternWeight, 0.35, 0.98),
        `${this.describeProto(protoA)} may lead to ${this.describeProto(protoB)}`
      ));
    }

    if (this.isParentChildRelationship(protoA, protoB)) {
      pushRelationship(this.buildRelationship(
        protoB,
        protoA,
        this.relationshipTypes.PARENT_CHILD,
        0.78,
        clamp(totalScore * 0.9, 0.35, 0.98),
        `${this.describeProto(protoA)} belongs to ${this.describeProto(protoB)}`
      ));
    }

    if (this.isEvolutionRelationship(protoA, protoB)) {
      pushRelationship(this.buildRelationship(
        protoA,
        protoB,
        this.relationshipTypes.EVOLUTION,
        0.8,
        clamp(totalScore * 0.85, 0.35, 0.98),
        `${this.describeProto(protoB)} develops from ${this.describeProto(protoA)}`
      ));
    }

    if (this.isTriggerRelationship(protoA, protoB)) {
      pushRelationship(this.buildRelationship(
        protoA,
        protoB,
        this.relationshipTypes.TRIGGER,
        0.74,
        clamp(totalScore * 0.82, 0.35, 0.98),
        `${this.describeProto(protoA)} may trigger ${this.describeProto(protoB)}`
      ));
    }

    if (relationships.length === 0 && this.isRelated(protoA, protoB)) {
      const [source, target] = this.orderByTime(protoA, protoB);
      pushRelationship(this.buildRelationship(
        source,
        target,
        this.relationshipTypes.RELATED,
        clamp(totalScore, 0.35, 0.98),
        totalScore,
        `${this.describeProto(source)} is related to ${this.describeProto(target)}`
      ));
    }

    return relationships;
  }

  buildRelationship(source, target, relationshipType, confidence, weight, description) {
    return {
      source_proto_event_id: source.id,
      target_proto_event_id: target.id,
      relationship_type: relationshipType,
      is_direct: true,
      confidence,
      weight,
      description,
      evidence: {
        source: this.serializeEvidenceProto(source),
        target: this.serializeEvidenceProto(target),
        total_score: this.calculateTotalScore(source, target),
        entity_overlap: this.calculateEntityOverlap(source, target),
        temporal_proximity: this.calculateTemporalProximity(source, target),
        semantic_similarity: this.calculateSemanticSimilarity(source, target)
      }
    };
  }

  calculateEntityOverlap(protoA, protoB) {
    const entitiesA = new Set(this.collectEntityKeys(protoA));
    const entitiesB = new Set(this.collectEntityKeys(protoB));
    if (entitiesA.size === 0 || entitiesB.size === 0) return 0;

    const intersection = [...entitiesA].filter(item => entitiesB.has(item));
    const union = new Set([...entitiesA, ...entitiesB]);
    return intersection.length / union.size;
  }

  calculateActionCompatibility(protoA, protoB) {
    const actionA = this.normalizeActionText(protoA);
    const actionB = this.normalizeActionText(protoB);
    if (!actionA || !actionB) return 0;
    if (actionA === actionB) return 1;
    if (protoA.action_id && protoA.action_id === protoB.action_id) return 1;
    if (protoA.action_pending_id && protoA.action_pending_id === protoB.action_pending_id) return 0.85;

    const taxonomyA = this.findTaxonomyAction(actionA);
    const taxonomyB = this.findTaxonomyAction(actionB);
    if (!taxonomyA || !taxonomyB) return this.lexicalOverlap(actionA, actionB) ? 0.55 : 0.25;
    if (this.actionTaxonomy[taxonomyA].category === this.actionTaxonomy[taxonomyB].category) {
      return ((this.actionTaxonomy[taxonomyA].score + this.actionTaxonomy[taxonomyB].score) / 2) * 0.9;
    }
    return 0.25;
  }

  calculateTemporalProximity(protoA, protoB) {
    const days = Math.abs(this.daysBetween(protoA, protoB));
    return Math.exp(-days / 7);
  }

  calculateSpatialProximity(protoA, protoB) {
    if (protoA.location_id && protoB.location_id && protoA.location_id === protoB.location_id) return 1;
    if (protoA.location_pending_id && protoB.location_pending_id && protoA.location_pending_id === protoB.location_pending_id) return 0.85;
    const locA = normalizeText(protoA.location_raw);
    const locB = normalizeText(protoB.location_raw);
    return locA && locB && locA === locB ? 0.7 : 0;
  }

  calculateSemanticSimilarity(protoA, protoB) {
    const tokensA = new Set(this.tokenize(this.buildText(protoA)));
    const tokensB = new Set(this.tokenize(this.buildText(protoB)));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    const intersection = [...tokensA].filter(item => tokensB.has(item));
    const union = new Set([...tokensA, ...tokensB]);
    return intersection.length / union.size;
  }

  calculateTotalScore(protoA, protoB) {
    const scores = {
      entityOverlap: this.calculateEntityOverlap(protoA, protoB),
      actionCompat: this.calculateActionCompatibility(protoA, protoB),
      semanticSim: this.calculateSemanticSimilarity(protoA, protoB),
      temporalProx: this.calculateTemporalProximity(protoA, protoB),
      spatialProx: this.calculateSpatialProximity(protoA, protoB)
    };

    return Object.entries(this.scores).reduce((sum, [key, weight]) => sum + (scores[key] || 0) * weight, 0);
  }

  isTemporalRelationship(earlier, later) {
    const gapDays = this.daysBetween(earlier, later);
    return gapDays > 0 && gapDays <= 30 && this.hasSharedContext(earlier, later);
  }

  isSubEventRelationship(child, parent) {
    const gapDays = this.daysBetween(parent, child);
    if (gapDays > 30 || gapDays < -1) return false;
    if (!this.hasSharedContext(child, parent)) return false;
    const childText = this.buildText(child);
    const parentText = this.buildText(parent);
    return /(part of|subset|within|during|inside|一部分|期间|内部)/i.test(childText)
      || (this.calculateEntityOverlap(child, parent) >= 0.7 && parentText.length > childText.length * 1.5);
  }

  isParentChildRelationship(child, parent) {
    return this.isSubEventRelationship(child, parent);
  }

  isCauseEffectRelationship(cause, effect) {
    const gapDays = this.daysBetween(cause, effect);
    if (gapDays < 0 || gapDays > 30) return false;
    if (!this.hasSharedContext(cause, effect)) return false;
    if (this.findCausalPattern(cause, effect)) return true;

    const effectText = this.buildText(effect);
    const causeText = this.buildText(cause);
    const causalLanguage = /(due to|because|caused by|resulted from|following|after|in response to|amid|triggered by|sparked by|导致|因为|由于|引发|引起|回应|之后)/i;
    return causalLanguage.test(effectText) && this.haveLexicalOverlap(this.tokenize(causeText), this.tokenize(effectText));
  }

  isEvolutionRelationship(earlier, later) {
    const gapDays = this.daysBetween(earlier, later);
    if (gapDays < 1 || gapDays > 90) return false;
    if (!this.samePrimaryParticipants(earlier, later)) return false;
    if (this.calculateSpatialProximity(earlier, later) === 0 && (earlier.location_id || later.location_id)) return false;
    return this.calculateActionCompatibility(earlier, later) >= 0.65 || this.calculateSemanticSimilarity(earlier, later) >= 0.35;
  }

  isTriggerRelationship(trigger, response) {
    const gapDays = this.daysBetween(trigger, response);
    if (gapDays < 0 || gapDays > 21) return false;
    if (!this.hasSharedContext(trigger, response)) return false;
    const responseText = this.buildText(response);
    return /(after|following|in response to|retaliation|retaliatory|triggered by|sparked by|amid|由于|因为|导致|引起|之后|响应|报复)/i.test(responseText)
      && (this.calculateSemanticSimilarity(trigger, response) >= 0.15 || this.calculateEntityOverlap(trigger, response) >= 0.25);
  }

  isRelated(protoA, protoB) {
    return this.calculateTotalScore(protoA, protoB) >= 0.70;
  }

  findCausalPattern(cause, effect) {
    const causeAction = this.normalizeActionText(cause);
    const effectAction = this.normalizeActionText(effect);
    return this.causalPatterns.find(pattern => causeAction.includes(pattern.cause) && effectAction.includes(pattern.effect));
  }

  hasSharedContext(protoA, protoB) {
    return this.calculateEntityOverlap(protoA, protoB) > 0 || this.calculateSpatialProximity(protoA, protoB) > 0;
  }

  samePrimaryParticipants(protoA, protoB) {
    const actorA = protoA.actor_entity_id ? `entity:${protoA.actor_entity_id}` : normalizeText(protoA.actor_raw);
    const actorB = protoB.actor_entity_id ? `entity:${protoB.actor_entity_id}` : normalizeText(protoB.actor_raw);
    const objectA = protoA.object_entity_id ? `entity:${protoA.object_entity_id}` : normalizeText(protoA.object_raw);
    const objectB = protoB.object_entity_id ? `entity:${protoB.object_entity_id}` : normalizeText(protoB.object_raw);
    return Boolean(actorA && actorB && actorA === actorB) && (!objectA || !objectB || objectA === objectB);
  }

  collectEntityKeys(proto) {
    const keys = [];
    const add = value => {
      const cleaned = String(value || '').trim().toLowerCase();
      if (cleaned) keys.push(cleaned);
    };
    if (proto.actor_entity_id) add(`entity:${proto.actor_entity_id}`);
    if (proto.object_entity_id) add(`entity:${proto.object_entity_id}`);
    if (proto.location_id) add(`entity:${proto.location_id}`);
    if (proto.actor_pending_id) add(`pending_entity:${proto.actor_pending_id}`);
    if (proto.object_pending_id) add(`pending_entity:${proto.object_pending_id}`);
    if (proto.location_pending_id) add(`pending_entity:${proto.location_pending_id}`);
    if (proto.actor_raw) add(`raw_actor:${proto.actor_raw}`);
    if (proto.object_raw) add(`raw_object:${proto.object_raw}`);
    if (proto.location_raw) add(`raw_location:${proto.location_raw}`);
    return [...new Set(keys)];
  }

  orderByTime(protoA, protoB) {
    return this.getTime(protoA) <= this.getTime(protoB) ? [protoA, protoB] : [protoB, protoA];
  }

  daysBetween(earlier, later) {
    return (this.getTime(later) - this.getTime(earlier)) / DAY_MS;
  }

  getTime(proto) {
    const date = new Date(proto.effective_time || proto.event_time || proto.created_at || proto.news_published_at || Date.now());
    return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
  }

  normalizeActionText(proto) {
    return normalizeText(proto.action_key || proto.action_name || proto.action_raw);
  }

  findTaxonomyAction(actionText) {
    return Object.keys(this.actionTaxonomy).find(key => actionText.includes(key));
  }

  buildText(proto) {
    return [
      proto.actor_name || proto.actor_raw,
      proto.action_name || proto.action_key || proto.action_raw,
      proto.object_name || proto.object_raw,
      proto.location_name || proto.location_raw,
      proto.news_title,
      proto.raw_extraction?.summary,
      proto.raw_extraction?.description,
      proto.raw_extraction?.metadata?.event_type
    ].filter(Boolean).join(' ').toLowerCase();
  }

  describeProto(proto) {
    return [
      proto.actor_name || proto.actor_raw,
      proto.action_name || proto.action_key || proto.action_raw,
      proto.object_name || proto.object_raw
    ].filter(Boolean).join(' ') || `proto_event:${proto.id}`;
  }

  serializeEvidenceProto(proto) {
    return {
      id: proto.id,
      actor: proto.actor_name || proto.actor_raw || null,
      action: proto.action_name || proto.action_key || proto.action_raw || null,
      object: proto.object_name || proto.object_raw || null,
      location: proto.location_name || proto.location_raw || null,
      time: proto.effective_time || proto.event_time || proto.created_at || null,
      news_id: proto.news_id || null,
      news_title: proto.news_title || null
    };
  }

  tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_\-]/gu, ' ')
      .split(/\s+/)
      .map(item => item.trim())
      .filter(item => item.length > 1);
  }

  lexicalOverlap(textA, textB) {
    return this.haveLexicalOverlap(this.tokenize(textA), this.tokenize(textB));
  }

  haveLexicalOverlap(tokensA, tokensB) {
    const setB = new Set(tokensB || []);
    return (tokensA || []).some(token => setB.has(token));
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

export const atomicRelationshipAnalyzer = new AtomicRelationshipAnalyzer();
