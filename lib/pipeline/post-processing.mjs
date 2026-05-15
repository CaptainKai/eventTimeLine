/**
 * Unified post-processing pipeline for proto-events
 * All parser output goes through this pipeline before ingestion
 */
import {
  EVENT_TYPES,
  ALL_STANDARD_ACTIONS,
  ENTITY_NORMALIZATION_MAP,
  RAW_ACTION_PATTERNS,
  CAMEO_ACTIONS
} from '../config/event-taxonomy.mjs';
import { query } from '../db/connection.mjs';

/**
 * 记录无法识别的实体/动作，等待人工确认
 */
const pendingNormalizationCache = new Map();

export async function recordPendingNormalization(type, rawValue, context = {}) {
  const key = `${type}:${rawValue}`;

  // 避免重复记录
  if (pendingNormalizationCache.has(key)) return;

  const normalized_type = type === 'action' ? 'unknown_action'
    : type === 'actor' ? 'unknown_actor'
    : type === 'object' ? 'unknown_object'
    : type === 'location' ? 'unknown_location'
    : 'unknown';

  try {
    await query(`
      INSERT INTO pending_normalizations (normalized_type, raw_value, context, status)
      VALUES ($1, $2, $3::jsonb, 'pending')
      ON CONFLICT (normalized_type, raw_value) DO UPDATE SET
        occurrence_count = pending_normalizations.occurrence_count + 1,
        last_seen_at = CURRENT_TIMESTAMP,
        context = $3::jsonb
    `, [normalized_type, rawValue.toLowerCase(), JSON.stringify(context)]);

    pendingNormalizationCache.set(key, true);
    console.log(`[PendingNorm] Recorded ${type} "${rawValue}" for review`);
  } catch (error) {
    console.error(`[PendingNorm] Failed to record ${type} "${rawValue}":`, error.message);
  }
}

/**
 * Main pipeline: clean -> deduplicate -> normalize
 */
export async function processProtoEvents(extractionResult) {
  let { proto_events = [], ...rest } = extractionResult;

  if (!proto_events || proto_events.length === 0) {
    return extractionResult;
  }

  proto_events = await normalizeAndCleanProtoEvents(proto_events);
  proto_events = deduplicateWithinBatch(proto_events);

  return { proto_events, ...rest };
}

/**
 * LLM 专用后处理流程
 * 用于三阶段 LLM Pipeline 的结果，合并归一化数据并持久化实体
 *
 * @param {object} extractionResult - LLM 提取结果（已含归一化信息）
 * @param {object} options - 可选参数
 * @returns {object} 处理后的结果
 */
export async function processLlmProtoEvents(extractionResult, _options = {}) {
  let { proto_events = [], ...rest } = extractionResult;

  if (!proto_events || proto_events.length === 0) {
    return extractionResult;
  }

  // 调用 entity-normalizer 持久化实体（如果需要）
  // 注意：三阶段 LLM pipeline 已在 llm-parser.mjs 中完成了归一化
  // 这里只做最终的清理和去重

  proto_events = await normalizeAndCleanProtoEventsLlM(proto_events);
  proto_events = deduplicateWithinBatch(proto_events);

  return { proto_events, ...rest };
}

/**
 * LLM 专用清理（信任 LLM 的归一化结果，只做基础验证）
 */
async function normalizeAndCleanProtoEventsLlM(protoEvents) {
  const results = [];
  for (const proto of protoEvents) {
    const normalized = normalizeLlmProtoEvent(proto);
    if (normalized && isValidProtoEvent(normalized)) {
      results.push(normalized);
    }
  }
  return results;
}

/**
 * 清理单个 LLM proto-event
 * 信任 LLM 的 metadata.actors/objects 归一化结果
 */
function normalizeLlmProtoEvent(proto) {
  if (!proto || typeof proto !== 'object') return null;

  const metadata = proto.metadata && typeof proto.metadata === 'object' ? { ...proto.metadata } : {};

  // 使用 LLM 归一化后的 actors/objects
  const rawActors = Array.isArray(metadata.actors) ? metadata.actors
    : Array.isArray(proto.actors) ? proto.actors : [];
  const rawObjects = Array.isArray(metadata.objects) ? metadata.objects
    : Array.isArray(proto.objects) ? proto.objects : [];
  const actors = expandCompositeEntityList(rawActors);
  const objects = expandCompositeEntityList(rawObjects);

  const primaryActor = actors[0] || null;
  const inferredObject = !objects[0] && actors.length > 1 ? actors[1] : null;
  const primaryObject = objects[0] || inferredObject || null;

  const location = cleanEntity(proto.location);
  const rawAction = metadata.raw_action || proto.action;
  const normalizedAction = metadata.normalized_action || proto.action;
  const eventType = normalizeEventType(proto.event_type || metadata.event_type);
  const time = normalizeText(proto.time) || null;
  const confidence = normalizeConfidence(proto.confidence);
  const temporalStatus = metadata.temporal_status;
  const details = metadata.details || {};

  // 动作必须是已归一化的或标准动作
  if (!normalizedAction) return null;

  return {
    ...proto,
    actor: primaryActor,
    object: primaryObject,
    location,
    time,
    action: normalizedAction,
    confidence,
    metadata: {
      ...metadata,
      actors,
      objects: primaryObject && !objects[0] ? [primaryObject, ...objects] : objects,
      raw_action: rawAction,
      normalized_action: normalizedAction,
      action_category: metadata.action_category || null,
      is_standard_action: metadata.is_standard_action !== false,
      event_type: eventType,
      temporal_status: temporalStatus,
      details,
      evidence_snippet: metadata.evidence_snippet || null,
      needs_action_review: !metadata.is_standard_action && !ALL_STANDARD_ACTIONS.includes(normalizedAction?.toLowerCase()),
      composite_entity_split: inferredObject ? { mode: 'actor_to_object', actor: primaryActor, object: inferredObject } : null
    }
  };
}

/**
 * Stage 1: Normalize + clean proto-events
 */
async function normalizeAndCleanProtoEvents(protoEvents) {
  const results = [];
  for (const proto of protoEvents) {
    const normalized = await normalizeProtoEvent(proto);
    if (normalized && isValidProtoEvent(normalized)) {
      results.push(normalized);
    }
  }
  return results;
}

async function normalizeProtoEvent(proto) {
  if (!proto || typeof proto !== 'object') return null;

  const metadata = proto.metadata && typeof proto.metadata === 'object' ? { ...proto.metadata } : {};
  const actors = getNormalizedEntities(proto, 'actors', 'actor');
  const objects = getNormalizedEntities(proto, 'objects', 'object');
  const primaryActor = actors[0] || cleanEntity(proto.actor) || null;
  const inferredObject = !cleanEntity(proto.object) && !objects[0] && actors.length > 1 ? actors[1] : null;
  const primaryObject = objects[0] || cleanEntity(proto.object) || inferredObject || null;
  const location = cleanEntity(proto.location);
  const rawAction = normalizeText(metadata.raw_action || proto.action);
  const normalizedAction = normalizeAction(metadata.normalized_action || proto.action);
  const eventType = normalizeEventType(proto.event_type || metadata.event_type);
  const time = normalizeText(proto.time) || null;
  const confidence = normalizeConfidence(proto.confidence);
  const temporalStatus = metadata.temporal_status;

  // 记录无法标准化的动作
  if (rawAction && !normalizedAction) {
    await recordPendingNormalization('action', rawAction, {
      source: metadata.source,
      event_type: eventType,
      temporal_status: temporalStatus
    });
  }

  // 记录无法标准化的 actor
  const rawActor = proto.actor || metadata.actor;
  if (rawActor && !primaryActor) {
    await recordPendingNormalization('actor', rawActor, {
      source: metadata.source,
      event_type: eventType
    });
  }

  // 记录无法标准化的 object
  const rawObject = proto.object || metadata.object;
  if (rawObject && !primaryObject) {
    await recordPendingNormalization('object', rawObject, {
      source: metadata.source,
      event_type: eventType
    });
  }

  // 移除未来事件过滤：保留未来事件，标记 temporal_status
  // if (!isOccurredOrOngoing(rawAction, time, temporalStatus)) return null;
  // if (!normalizedAction) return null;

  // 如果没有标准化的 action，使用原始 action 但标记为待审核
  const finalAction = normalizedAction || (rawAction || 'unknown_action');
  const needsActionReview = !normalizedAction;

  return {
    ...proto,
    actor: primaryActor || (rawActor ? `PENDING:${rawActor}` : null),
    object: primaryObject || (rawObject ? `PENDING:${rawObject}` : null),
    location,
    time,
    action: finalAction,
    confidence,
    metadata: {
      ...metadata,
      actors,
      objects,
      raw_action: rawAction,
      normalized_action: normalizedAction,
      event_type: eventType,
      temporal_status: temporalStatus,
      needs_action_review: needsActionReview,
      is_future_event: temporalStatus === 'future',
      composite_entity_split: inferredObject ? { mode: 'actor_to_object', actor: primaryActor, object: inferredObject } : null
    }
  };
}

function getNormalizedEntities(proto, pluralKey, singularKey) {
  const candidates = [];
  const metadata = proto.metadata && typeof proto.metadata === 'object' ? proto.metadata : {};
  if (Array.isArray(proto[pluralKey])) candidates.push(...proto[pluralKey]);
  if (Array.isArray(metadata[pluralKey])) candidates.push(...metadata[pluralKey]);
  if (proto[singularKey]) candidates.push(proto[singularKey]);
  if (metadata[singularKey]) candidates.push(metadata[singularKey]);

  const expanded = candidates.flatMap((value) => expandCompositeEntityText(value));
  const normalized = expanded
    .map((value) => normalizeEntity(value))
    .filter(Boolean);

  return [...new Set(normalized)];
}

function expandCompositeEntityList(values = []) {
  return [...new Set((values || []).flatMap((value) => expandCompositeEntityText(value)).filter(Boolean))];
}

function expandCompositeEntityText(value) {
  const cleaned = cleanEntity(value);
  if (!cleaned) return [];

  const compact = cleaned.replace(/\s+/g, '');
  if (/^(中美|美中)(两国)?(元首|领导人)$/.test(compact)) {
    return ['中国国家主席', '美国总统'];
  }

  if (/^(中俄|俄中)(两国)?(元首|领导人)$/.test(compact)) {
    return ['中国国家主席', '俄罗斯总统'];
  }

  return [cleaned];
}

function normalizeEntity(value) {
  const cleaned = cleanEntity(value);
  if (!cleaned) return null;
  if (ENTITY_NORMALIZATION_MAP[cleaned]) return ENTITY_NORMALIZATION_MAP[cleaned];

  const lowered = cleaned.toLowerCase();
  if (lowered.includes('united states') || lowered === 'us') return 'US';
  if (lowered.includes('european union')) return 'EU';
  if (lowered.includes('china')) return 'China';
  return cleaned;
}

function normalizeAction(raw) {
  const action = normalizeText(raw).toLowerCase();
  if (!action) return null;
  if (ALL_STANDARD_ACTIONS.includes(action)) return action;
  for (const { pattern, normalized } of RAW_ACTION_PATTERNS) {
    if (pattern.test(action)) return normalized;
  }
  return null;
}

function normalizeEventType(value) {
  const text = normalizeText(value).toLowerCase();
  return EVENT_TYPES.includes(text) ? text : null;
}

function normalizeConfidence(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 0.7;
  return Math.min(1, Math.max(0, num));
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Clean a single entity value
 */
function cleanEntity(value) {
  if (!value) return null;

  let text = normalizeText(value);

  if (!text || text.toLowerCase() === 'null') return null;
  if (text.toLowerCase().includes('null')) return null;

  if (/^(in|on|at|to|for|with|by|from|of)\s/i.test(text)) return null;
  if (/\s+(in|on|at|to|for|with|by|from|of)$/i.test(text)) return null;

  if (/^[^\w\u4e00-\u9fa5]+$/.test(text)) return null;
  if (text.includes('Actor1:') || text.includes('Actor2:')) return null;

  if (CAMEO_ACTIONS.some(a => text === a || text.startsWith(a + ' '))) return null;

  if (text.endsWith(' in') && !text.includes('China')) {
    const parts = text.split(' in ');
    if (parts.length >= 2 && parts[0].length > 2) {
      text = parts[0];
    }
  }

  const asNumber = parseFloat(text);
  if (!isNaN(asNumber) && String(asNumber) === text) return null;

  return text.length >= 2 ? text : null;
}

/**
 * Check if a proto-event has valid fields
 */
function isValidProtoEvent(proto) {
  if (!proto.actor && !proto.object) return false;

  const actorOk = proto.actor && proto.actor.length >= 2;
  const objectOk = !proto.object || proto.object.length >= 2;
  const actionOk = !!proto.action;

  return actorOk && objectOk && actionOk;
}

/**
 * Stage 2: Deduplicate within a single extraction batch
 */
export function deduplicateWithinBatch(protoEvents) {
  if (!protoEvents || protoEvents.length <= 1) {
    return protoEvents;
  }

  const seen = new Map();
  const result = [];

  for (const proto of protoEvents) {
    const key = buildDedupKey(proto);
    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(proto);
    }
  }

  return result;
}

/**
 * Build deduplication key from proto-event
 */
function buildDedupKey(proto) {
  const actor = String(proto.actor || 'null').toLowerCase();
  const action = String(proto.action || 'null').toLowerCase();
  const object = String(proto.object || 'null').toLowerCase();
  return `${actor}__${action}__${object}`;
}
