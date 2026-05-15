import { callLLM } from '../../apis/parsers/llm-parser.mjs';
import { ENTITY_TYPES } from '../config/event-taxonomy.mjs';
import {
  ensureEntityAlias,
  findExactEntityByName,
  getEntityById,
  getOrCreateEntityWithHierarchy,
  searchEntityCandidates
} from '../db/entity-queries.mjs';
import { upsertPendingNormalization } from '../db/pending-normalization-queries.mjs';

const DEFAULT_ENTITY_TYPE = 'organization';
const FALLBACK_CONFIDENCE = 0.45;

export async function resolveEntitiesForProtoEvents(protoEvents, context = {}) {
  if (!Array.isArray(protoEvents) || protoEvents.length === 0) {
    return protoEvents || [];
  }

  const cache = new Map();
  const resolvedEvents = [];

  for (const protoEvent of protoEvents) {
    resolvedEvents.push(await resolveEntitiesForSingleProtoEvent(protoEvent, context, cache));
  }

  return resolvedEvents;
}

async function resolveEntitiesForSingleProtoEvent(protoEvent, context, cache) {
  if (!protoEvent || typeof protoEvent !== 'object') {
    return protoEvent;
  }

  const actorResolution = await resolveEntityReference(buildEntityInput(protoEvent, 'actor', context), cache);
  const objectResolution = await resolveEntityReference(buildEntityInput(protoEvent, 'object', context), cache);
  const locationResolution = await resolveEntityReference(buildEntityInput(protoEvent, 'location', context), cache);

  return {
    ...protoEvent,
    actor: actorResolution?.canonicalName || protoEvent.actor || null,
    object: objectResolution?.canonicalName || protoEvent.object || null,
    location: locationResolution?.canonicalName || protoEvent.location || null,
    actor_entity_id: actorResolution?.entityId || null,
    object_entity_id: objectResolution?.entityId || null,
    location_entity_id: locationResolution?.entityId || null,
    actor_pending_id: actorResolution?.pendingId || null,
    object_pending_id: objectResolution?.pendingId || null,
    location_pending_id: locationResolution?.pendingId || null,
    metadata: {
      ...(protoEvent.metadata || {}),
      entity_resolution: {
        actor: actorResolution ? serializeResolution(actorResolution) : null,
        object: objectResolution ? serializeResolution(objectResolution) : null,
        location: locationResolution ? serializeResolution(locationResolution) : null
      }
    }
  };
}

function buildEntityInput(protoEvent, field, context) {
  const metadata = protoEvent.metadata && typeof protoEvent.metadata === 'object' ? protoEvent.metadata : {};
  const normalizedMap = metadata.entity_normalized && typeof metadata.entity_normalized === 'object'
    ? metadata.entity_normalized
    : {};

  if (field === 'actor' || field === 'object') {
    const rawValues = field === 'actor' ? metadata.raw_actors : metadata.raw_objects;
    const rawValue = firstNonEmpty(rawValues?.[0], protoEvent[field]);
    const normalizedInfo = rawValue ? normalizedMap[rawValue] : null;

    return {
      field,
      inputValue: protoEvent[field],
      rawValue,
      canonicalHint: firstNonEmpty(normalizedInfo?.canonicalName, protoEvent[field], rawValue),
      entityTypeHint: normalizeEntityType(normalizedInfo?.entityType) || inferEntityType(field, protoEvent),
      parentEntityHint: normalizedInfo?.parentEntity || null,
      entitySubtypeHint: normalizedInfo?.entitySubtype || normalizedInfo?.entity_subtype || null,
      action: protoEvent.action,
      peerEntity: field === 'actor' ? protoEvent.object : protoEvent.actor,
      title: context.title || protoEvent.title || '',
      newsId: context.newsId || null
    };
  }

  return {
    field,
    inputValue: protoEvent.location,
    rawValue: firstNonEmpty(protoEvent.location),
    canonicalHint: firstNonEmpty(protoEvent.location),
    entityTypeHint: 'location',
    parentEntityHint: null,
    entitySubtypeHint: null,
    action: protoEvent.action,
    peerEntity: protoEvent.actor || protoEvent.object || null,
    title: context.title || protoEvent.title || '',
    newsId: context.newsId || null
  };
}

async function resolveEntityReference(input, cache) {
  const inputValue = normalizeText(input?.inputValue);
  const rawValue = normalizeText(input?.rawValue) || inputValue;

  if (!inputValue && !rawValue) {
    return null;
  }

  const entityTypeHint = normalizeEntityType(input.entityTypeHint) || inferFallbackType(input.field);
  const cacheKey = JSON.stringify({ field: input.field, rawValue, inputValue, entityTypeHint });

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const resolved = await resolveEntityReferenceInternal({
    ...input,
    inputValue: inputValue || rawValue,
    rawValue,
    entityTypeHint,
    candidateTypes: getCandidateTypes(entityTypeHint, input.field)
  });

  cache.set(cacheKey, resolved);
  return resolved;
}

async function resolveEntityReferenceInternal(input) {
  const exactRaw = await findExactEntityByName(input.rawValue, input.candidateTypes);
  if (exactRaw && normalizeText(exactRaw.raw_name).toLowerCase() === input.rawValue.toLowerCase()) {
    return buildResolvedEntity(exactRaw, input, 'exact_raw', exactRaw.confidence);
  }

  const exactCanonical = await findExactEntityByName(input.canonicalHint || input.inputValue, input.candidateTypes);
  if (exactCanonical) {
    const aliasEntity = await ensureEntityAlias(input.rawValue, exactCanonical, exactCanonical.confidence);
    return buildResolvedEntity(aliasEntity || exactCanonical, input, 'exact_canonical', exactCanonical.confidence);
  }

  const candidates = await searchEntityCandidates(input.canonicalHint || input.inputValue || input.rawValue, input.candidateTypes, 8);

  if (process.env.OPENAI_API_KEY && candidates.length > 0) {
    const decision = await resolveWithLLM(input, candidates);
    const resolvedByLLM = await applyLLMResolutionDecision(input, candidates, decision);
    if (resolvedByLLM) {
      return resolvedByLLM;
    }
  }

  if (isConcreteEntity(input.rawValue || input.inputValue)) {
    return createProvisionalEntity(input, {
      canonical_name: input.canonicalHint || input.inputValue || input.rawValue,
      entity_type: input.entityTypeHint,
      confidence: FALLBACK_CONFIDENCE,
      reason: 'Concrete entity without reliable standard mapping'
    }, 'create_provisional');
  }

  return createProvisionalEntity(input, {
    canonical_name: input.rawValue || input.inputValue,
    entity_type: 'noise_or_unknown',
    confidence: 0.25,
    reason: 'Entity text is too generic or noisy'
  }, 'reject_noise_candidate');
}

async function applyLLMResolutionDecision(input, candidates, decision) {
  if (!decision) return null;

  if (decision.decision === 'match_existing') {
    const matched = candidates.find((candidate) => candidate.id === decision.matched_entity_id);
    if (!matched) return null;
    const aliasEntity = await ensureEntityAlias(input.rawValue, matched, decision.confidence ?? matched.confidence);
    return buildResolvedEntity(aliasEntity || matched, input, 'llm_match_existing', decision.confidence, decision.reason);
  }

  if (decision.decision === 'create_new') {
    const created = await createResolvedEntity(input, decision);
    return buildResolvedEntity(created, input, 'llm_create_new', decision.confidence, decision.reason);
  }

  if (decision.decision === 'create_provisional') {
    return createProvisionalEntity(input, decision, 'llm_create_provisional');
  }

  if (decision.decision === 'keep_raw_fallback') {
    const fallback = await createProvisionalEntity(input, {
      canonical_name: input.canonicalHint || input.inputValue || input.rawValue,
      entity_type: input.entityTypeHint,
      parent_entity: input.parentEntityHint,
      confidence: Math.min(decision.confidence || FALLBACK_CONFIDENCE, 0.6)
    }, 'llm_keep_raw_fallback');
    return { ...fallback, reason: decision.reason || fallback.reason };
  }

  return null;
}

async function createProvisionalEntity(input, decision, resolutionMode) {
  const canonicalName = normalizeText(decision?.canonical_name) || input.canonicalHint || input.inputValue || input.rawValue;
  const entityType = normalizeEntityType(decision?.entity_type) || input.entityTypeHint || inferFallbackType(input.field);
  const parentEntity = normalizeNullableText(decision?.parent_entity) || input.parentEntityHint || null;
  const entitySubtype = normalizeNullableText(decision?.entity_subtype) || input.entitySubtypeHint || null;
  const confidence = clampConfidence(decision?.confidence, FALLBACK_CONFIDENCE);
  const pending = await upsertPendingNormalization({
    itemKind: 'entity',
    role: input.field,
    rawValue: input.rawValue,
    provisionalName: canonicalName,
    provisionalType: entityType,
    parentEntityName: parentEntity,
    entitySubtype,
    hierarchyConfidence: parentEntity ? confidence : null,
    context: {
      field_role: input.field,
      action: input.action || null,
      peer_entity: input.peerEntity || null,
      title: input.title || null,
      news_id: input.newsId || null,
      parent_entity_name: parentEntity,
      entity_subtype: entitySubtype
    },
    evidence: {
      raw_value: input.rawValue,
      current_value: input.inputValue,
      canonical_hint: input.canonicalHint || null,
      action: input.action || null,
      peer_entity: input.peerEntity || null,
      title: input.title || null,
      parent_entity_name: parentEntity,
      entity_subtype: entitySubtype,
      reason: decision?.reason || null
    },
    sourceRef: input.newsId ? { news_id: input.newsId } : null
  });

  const resolvedFromPending = await buildResolutionFromHandledPending(pending, input, resolutionMode, confidence, decision?.reason);
  if (resolvedFromPending) return resolvedFromPending;

  return {
    entityId: null,
    pendingId: pending?.id || null,
    rawValue: input.rawValue,
    inputValue: input.inputValue,
    canonicalName,
    entityType,
    parentEntity,
    entitySubtype,
    resolutionMode,
    confidence,
    reason: decision?.reason || null,
    identityKey: pending?.id ? `pending_entity:${pending.id}` : null
  };
}

async function createResolvedEntity(input, decision) {
  const canonicalName = normalizeText(decision?.canonical_name) || input.canonicalHint || input.inputValue || input.rawValue;
  const entityType = normalizeEntityType(decision?.entity_type) || input.entityTypeHint || inferFallbackType(input.field);
  const parentEntity = normalizeNullableText(decision?.parent_entity) || input.parentEntityHint || null;
  const confidence = clampConfidence(decision?.confidence, FALLBACK_CONFIDENCE);

  const { entity } = await getOrCreateEntityWithHierarchy(
    input.rawValue,
    canonicalName,
    entityType,
    parentEntity,
    confidence
  );

  return entity;
}

async function buildResolutionFromHandledPending(pending, input, resolutionMode, confidence, reason = null) {
  if (!pending || !['promoted', 'merged', 'rejected'].includes(pending.status)) return null;

  if ((pending.status === 'promoted' || pending.status === 'merged') && pending.target_entity_id) {
    const entity = await getEntityById(pending.target_entity_id);
    if (entity) {
      return buildResolvedEntity(
        entity,
        input,
        pending.status === 'merged' ? 'pending_merged_reuse' : 'pending_promoted_reuse',
        confidence,
        reason || pending.audit_reason || `Reused ${pending.status} pending normalization ${pending.id}`
      );
    }
  }

  return {
    entityId: null,
    pendingId: pending.id,
    rawValue: input.rawValue,
    inputValue: input.inputValue,
    canonicalName: pending.provisional_name || input.canonicalHint || input.inputValue || input.rawValue,
    entityType: pending.provisional_type || input.entityTypeHint || inferFallbackType(input.field),
    parentEntity: pending.parent_entity_name || input.parentEntityHint || null,
    entitySubtype: pending.entity_subtype || input.entitySubtypeHint || null,
    resolutionMode: pending.status === 'rejected' ? 'pending_rejected_seen_again' : resolutionMode,
    confidence: pending.status === 'rejected' ? 0.2 : confidence,
    reason: reason || pending.audit_reason || `Pending normalization status is ${pending.status}`,
    identityKey: `pending_entity:${pending.id}`
  };
}

async function resolveWithLLM(input, candidates) {
  try {
    const result = await callLLM(buildEntityResolutionPrompt(input, candidates));
    if (!result || typeof result !== 'object') return null;

    return {
      decision: normalizeText(result.decision),
      matched_entity_id: Number.isInteger(Number(result.matched_entity_id)) ? Number(result.matched_entity_id) : null,
      canonical_name: normalizeNullableText(result.canonical_name),
      entity_type: normalizeEntityType(result.entity_type),
      parent_entity: normalizeNullableText(result.parent_entity),
      entity_subtype: normalizeNullableText(result.entity_subtype),
      confidence: clampConfidence(result.confidence, 0.7),
      reason: normalizeNullableText(result.reason)
    };
  } catch (error) {
    console.error(`[EntityResolution] LLM resolution failed for "${input.rawValue}":`, error.message);
    return null;
  }
}

function buildEntityResolutionPrompt(input, candidates) {
  const payload = {
    entity: {
      raw_value: input.rawValue,
      current_value: input.inputValue,
      canonical_hint: input.canonicalHint || null,
      field_role: input.field,
      entity_type_hint: input.entityTypeHint || null,
      action: input.action || null,
      peer_entity: input.peerEntity || null,
      title: input.title || null
    },
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      raw_name: candidate.raw_name,
      canonical_name: candidate.canonical_name,
      entity_type: candidate.entity_type,
      parent_entity_id: candidate.parent_entity_id || null,
      confidence: candidate.confidence
    }))
  };

  return `You are an entity resolution system.

Task: align one event entity value to an existing database entity, or decide that a new entity should be created.

Allowed decisions:
- match_existing
- create_new
- create_provisional
- keep_raw_fallback

Rules:
1. Prefer reusing an existing candidate entity.
2. Only use create_new when no candidate is suitable and the entity is stable enough for the standard entity table.
3. If the text points to a concrete actor, organization, person, company, location, or region but cannot be safely standardized yet, use create_provisional. Do not call it unknown.
4. If the input is a placeholder, pronoun, fragment, or extraction noise and cannot be mapped reliably, use keep_raw_fallback.
5. matched_entity_id must be selected from the provided candidate list.
6. create_new, create_provisional, and keep_raw_fallback must include canonical_name and entity_type.
7. entity_type must be one of: ${ENTITY_TYPES.join(', ')}
8. For hierarchical entities, keep the concrete entity as canonical_name and put the broader owner/country/parent organization in parent_entity.
9. entity_subtype should describe the concrete subtype when useful, such as foreign_minister, ministry, military_unit, subsidiary, branch, agency, or office.
10. Return JSON only. Do not include markdown or explanatory text.

Output schema:
{
  "decision": "match_existing|create_new|create_provisional|keep_raw_fallback",
  "matched_entity_id": 123,
  "canonical_name": "canonical name or raw value",
  "entity_type": "country|organization|person|location|military_unit|company|international_org|region",
  "parent_entity": "parent entity name or null",
  "entity_subtype": "specific subtype or null",
  "confidence": 0.0,
  "reason": "short reason"
}

Input data:
${JSON.stringify(payload, null, 2)}`;
}

function buildResolvedEntity(entity, input, resolutionMode, confidence = null, reason = null) {
  return {
    entityId: entity.id,
    pendingId: null,
    rawValue: input.rawValue,
    inputValue: input.inputValue,
    canonicalName: entity.canonical_name,
    entityType: entity.entity_type,
    parentEntity: input.parentEntityHint || entity.parent_entity_id || null,
    entitySubtype: entity.entity_subtype || input.entitySubtypeHint || null,
    resolutionMode,
    confidence: confidence ?? entity.confidence ?? FALLBACK_CONFIDENCE,
    reason: reason || null,
    identityKey: `entity:${entity.id}`
  };
}

function serializeResolution(resolution) {
  return {
    raw_value: resolution.rawValue,
    input_value: resolution.inputValue,
    canonical_name: resolution.canonicalName,
    entity_type: resolution.entityType,
    entity_id: resolution.entityId,
    pending_id: resolution.pendingId || null,
    identity_key: resolution.identityKey || (resolution.entityId ? `entity:${resolution.entityId}` : null),
    parent_entity: resolution.parentEntity || null,
    entity_subtype: resolution.entitySubtype || null,
    resolution_mode: resolution.resolutionMode,
    confidence: resolution.confidence,
    llm_reason: resolution.reason || null
  };
}

function isConcreteEntity(value) {
  const cleaned = normalizeText(value).toLowerCase();
  if (!cleaned || cleaned.length <= 1) return false;
  if (/^(unknown|n\/a|null|none|it|they|he|she|them|someone|something)$/i.test(cleaned)) return false;
  if (/^(the|a|an|this|that|these|those)$/i.test(cleaned)) return false;
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return false;
  return true;
}

function getCandidateTypes(typeHint, field) {
  const preferred = field === 'location'
    ? [typeHint, 'location', 'region', 'country', 'organization']
    : [typeHint, 'organization', 'company', 'international_org', 'person', 'country', 'region', 'location'];

  return [...new Set(preferred.map(normalizeEntityType).filter(Boolean))];
}

function inferEntityType(field, protoEvent) {
  if (field === 'location') return 'location';

  const value = normalizeText(field === 'actor' ? protoEvent.actor : protoEvent.object);
  if (/\b(?:mr|mrs|ms|president|minister|chairman|ceo|general|prime minister)\b/i.test(value)) return 'person';
  if (/(company|corp|inc|ltd|group|co\.?|corporation)$/i.test(value)) return 'company';
  return inferFallbackType(field);
}

function inferFallbackType(field) {
  return field === 'location' ? 'location' : DEFAULT_ENTITY_TYPE;
}

function normalizeEntityType(value) {
  const cleaned = normalizeText(value);
  return ENTITY_TYPES.includes(cleaned) ? cleaned : null;
}

function normalizeNullableText(value) {
  const cleaned = normalizeText(value);
  return !cleaned || cleaned.toLowerCase() === 'null' ? null : cleaned;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function clampConfidence(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const cleaned = normalizeText(value);
    if (cleaned) return cleaned;
  }
  return '';
}

export async function getParentEntityName(entity) {
  if (!entity?.parent_entity_id) return null;
  const parent = await getEntityById(entity.parent_entity_id);
  return parent?.canonical_name || null;
}
