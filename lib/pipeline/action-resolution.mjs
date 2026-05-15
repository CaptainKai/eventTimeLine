import { callLLM } from '../../apis/parsers/llm-parser.mjs';
import { ALL_STANDARD_ACTIONS, ACTION_SYNONYM_MAP } from '../config/event-taxonomy.mjs';
import {
  ensureActionMapping,
  findStandardAction,
  searchActionCandidates,
  seedStandardActionsFromConfig,
  upsertStandardAction
} from '../db/action-queries.mjs';
import { upsertPendingNormalization } from '../db/pending-normalization-queries.mjs';

const ACTION_FALLBACK_CONFIDENCE = 0.5;
let actionSeeded = false;

export async function resolveActionsForProtoEvents(protoEvents, context = {}) {
  if (!Array.isArray(protoEvents) || protoEvents.length === 0) {
    return protoEvents || [];
  }

  if (context.mutate === false || context.resolveActions === false) {
    return protoEvents;
  }

  await ensureActionSeeded();

  const cache = new Map();
  const resolved = [];
  for (const proto of protoEvents) {
    const actionResolution = await resolveActionReference(buildActionInput(proto, context), cache);
    resolved.push(applyActionResolution(proto, actionResolution));
  }

  return resolved;
}

export async function resolveActionReference(input, cache = new Map()) {
  const rawAction = normalizeText(input?.rawAction || input?.action);
  if (!rawAction) return null;

  const cacheKey = rawAction.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const resolved = await resolveActionReferenceInternal({ ...input, rawAction });
  cache.set(cacheKey, resolved);
  return resolved;
}

async function resolveActionReferenceInternal(input) {
  const normalizedHint = normalizeText(input.normalizedHint) || rawConfigNormalize(input.rawAction);
  const exact = await findStandardAction(normalizedHint || input.rawAction);
  if (exact) {
    await ensureActionMapping(input.rawAction, exact.id, exact.mapping_confidence || exact.confidence || 1.0, 'resolver_exact');
    return buildStandardActionResolution(exact, input, 'exact_or_mapping');
  }

  const candidates = await searchActionCandidates(normalizedHint || input.rawAction, 8);
  if (process.env.OPENAI_API_KEY && candidates.length > 0) {
    const decision = await resolveActionWithLLM(input, candidates);
    const resolvedByLLM = await applyLLMActionDecision(input, candidates, decision);
    if (resolvedByLLM) return resolvedByLLM;
  }

  if (isConcreteAction(input.rawAction)) {
    return createPendingAction(input, {
      action_name: normalizedHint || input.rawAction,
      action_type: input.eventType || 'action',
      confidence: ACTION_FALLBACK_CONFIDENCE,
      reason: 'Concrete action without reliable standard mapping'
    }, 'create_provisional');
  }

  return createPendingAction(input, {
    action_name: input.rawAction,
    action_type: 'noise_or_unknown',
    confidence: 0.25,
    reason: 'Action text is too generic or noisy'
  }, 'reject_noise_candidate');
}

async function applyLLMActionDecision(input, candidates, decision) {
  if (!decision) return null;

  if (decision.decision === 'match_existing') {
    const matched = candidates.find((candidate) => Number(candidate.id) === Number(decision.matched_action_id));
    if (!matched) return null;
    await ensureActionMapping(input.rawAction, matched.id, decision.confidence ?? matched.confidence, 'llm_match');
    return buildStandardActionResolution(matched, input, 'llm_match_existing', decision.reason, decision.confidence);
  }

  if (decision.decision === 'create_new_standard') {
    const action = await upsertStandardAction({
      actionKey: decision.action_key || decision.action_name || input.rawAction,
      displayName: decision.action_name || decision.action_key || input.rawAction,
      actionCategory: decision.action_category || input.eventType || 'custom',
      confidence: decision.confidence || 0.75
    });
    await ensureActionMapping(input.rawAction, action.id, decision.confidence || 0.75, 'llm_create_standard');
    return buildStandardActionResolution(action, input, 'llm_create_new_standard', decision.reason, decision.confidence);
  }

  if (decision.decision === 'create_provisional') {
    return createPendingAction(input, {
      action_name: decision.action_name || input.rawAction,
      action_type: decision.action_category || input.eventType || 'action',
      confidence: decision.confidence || ACTION_FALLBACK_CONFIDENCE,
      reason: decision.reason
    }, 'llm_create_provisional');
  }

  if (decision.decision === 'reject_noise') {
    return createPendingAction(input, {
      action_name: input.rawAction,
      action_type: 'noise_or_unknown',
      confidence: Math.min(decision.confidence || 0.3, 0.4),
      reason: decision.reason || 'LLM marked as noise'
    }, 'llm_reject_noise_candidate');
  }

  return null;
}

async function createPendingAction(input, decision, resolutionMode) {
  const pending = await upsertPendingNormalization({
    itemKind: 'action',
    role: 'action',
    rawValue: input.rawAction,
    provisionalName: decision.action_name || input.rawAction,
    provisionalType: decision.action_type || 'action',
    context: {
      action: input.rawAction,
      event_type: input.eventType || null,
      actor: input.actor || null,
      object: input.object || null,
      title: input.title || null,
      news_id: input.newsId || null
    },
    evidence: {
      action: input.rawAction,
      actor: input.actor || null,
      object: input.object || null,
      title: input.title || null,
      reason: decision.reason || null
    },
    sourceRef: input.newsId ? { news_id: input.newsId } : null
  });

  const resolvedFromPending = await buildResolutionFromHandledPending(pending, input, decision, resolutionMode);
  if (resolvedFromPending) return resolvedFromPending;

  return {
    actionId: null,
    pendingId: pending?.id || null,
    rawAction: input.rawAction,
    canonicalAction: decision.action_name || input.rawAction,
    actionType: decision.action_type || 'action',
    resolutionMode,
    confidence: decision.confidence ?? ACTION_FALLBACK_CONFIDENCE,
    reason: decision.reason || null,
    identityKey: pending?.id ? `pending_action:${pending.id}` : null
  };
}

function buildResolutionFromHandledPending(pending, input, decision, resolutionMode) {
  if (!pending || !['promoted', 'merged', 'rejected'].includes(pending.status)) return null;

  if ((pending.status === 'promoted' || pending.status === 'merged') && pending.target_action_id) {
    return {
      actionId: pending.target_action_id,
      pendingId: null,
      rawAction: input.rawAction,
      canonicalAction: pending.suggested_normalization || pending.provisional_name || decision.action_name || input.rawAction,
      actionType: pending.provisional_type || decision.action_type || input.eventType || 'action',
      resolutionMode: pending.status === 'merged' ? 'pending_merged_reuse' : 'pending_promoted_reuse',
      confidence: decision.confidence ?? ACTION_FALLBACK_CONFIDENCE,
      reason: pending.audit_reason || decision.reason || `Reused ${pending.status} pending normalization ${pending.id}`,
      identityKey: `action:${pending.target_action_id}`
    };
  }

  return {
    actionId: null,
    pendingId: pending.id,
    rawAction: input.rawAction,
    canonicalAction: pending.provisional_name || decision.action_name || input.rawAction,
    actionType: pending.provisional_type || decision.action_type || 'action',
    resolutionMode: pending.status === 'rejected' ? 'pending_rejected_seen_again' : resolutionMode,
    confidence: pending.status === 'rejected' ? 0.2 : (decision.confidence ?? ACTION_FALLBACK_CONFIDENCE),
    reason: pending.audit_reason || decision.reason || `Pending normalization status is ${pending.status}`,
    identityKey: `pending_action:${pending.id}`
  };
}

function buildStandardActionResolution(action, input, resolutionMode, reason = null, confidence = null) {
  return {
    actionId: action.id,
    pendingId: null,
    rawAction: input.rawAction,
    canonicalAction: action.action_key || action.display_name || input.rawAction,
    actionType: action.action_category || input.eventType || 'action',
    resolutionMode,
    confidence: confidence ?? action.mapping_confidence ?? action.confidence ?? 1.0,
    reason,
    identityKey: `action:${action.id}`
  };
}

function applyActionResolution(proto, resolution) {
  if (!resolution) return proto;
  return {
    ...proto,
    action: resolution.canonicalAction || proto.action,
    action_id: resolution.actionId || null,
    action_pending_id: resolution.pendingId || null,
    metadata: {
      ...(proto.metadata || {}),
      action_resolution: serializeActionResolution(resolution)
    }
  };
}

function serializeActionResolution(resolution) {
  return {
    raw_action: resolution.rawAction,
    canonical_action: resolution.canonicalAction,
    action_type: resolution.actionType,
    action_id: resolution.actionId,
    pending_id: resolution.pendingId,
    identity_key: resolution.identityKey,
    resolution_mode: resolution.resolutionMode,
    confidence: resolution.confidence,
    llm_reason: resolution.reason || null
  };
}

async function resolveActionWithLLM(input, candidates) {
  try {
    const result = await callLLM(buildActionResolutionPrompt(input, candidates));
    if (!result || typeof result !== 'object') return null;
    return {
      decision: normalizeText(result.decision),
      matched_action_id: Number.isInteger(Number(result.matched_action_id)) ? Number(result.matched_action_id) : null,
      action_key: normalizeNullableText(result.action_key),
      action_name: normalizeNullableText(result.action_name),
      action_category: normalizeNullableText(result.action_category),
      confidence: clampConfidence(result.confidence, 0.65),
      reason: normalizeNullableText(result.reason)
    };
  } catch (error) {
    console.error(`[ActionResolution] LLM resolution failed for "${input.rawAction}":`, error.message);
    return null;
  }
}

function buildActionResolutionPrompt(input, candidates) {
  const payload = {
    action: {
      raw_action: input.rawAction,
      normalized_hint: input.normalizedHint || null,
      event_type: input.eventType || null,
      actor: input.actor || null,
      object: input.object || null,
      title: input.title || null
    },
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      action_key: candidate.action_key,
      display_name: candidate.display_name,
      action_category: candidate.action_category,
      raw_action: candidate.raw_action || null,
      confidence: candidate.confidence
    }))
  };

  return `You are an action normalization system.

Task: align one event action to an existing standard action, or decide whether it should become a concrete provisional action for later audit.

Allowed decisions:
- match_existing
- create_new_standard
- create_provisional
- reject_noise

Rules:
1. Prefer match_existing when a candidate has the same real-world event meaning.
2. Use create_new_standard only when the action is clearly reusable as a stable standard action.
3. If the action text is concrete but cannot be safely standardized yet, you must return create_provisional. Do not call it unknown.
4. Use reject_noise only for empty, placeholder, malformed, or non-action text.
5. matched_action_id must be selected from candidates.
6. Return JSON only.

Output schema:
{
  "decision": "match_existing|create_new_standard|create_provisional|reject_noise",
  "matched_action_id": 123,
  "action_key": "snake_case_key_or_null",
  "action_name": "canonical or provisional action name",
  "action_category": "category or action type",
  "confidence": 0.0,
  "reason": "short reason"
}

Standard action fallback list:
${ALL_STANDARD_ACTIONS.join(', ')}

Input data:
${JSON.stringify(payload, null, 2)}`;
}

function buildActionInput(proto, context) {
  const metadata = proto.metadata && typeof proto.metadata === 'object' ? proto.metadata : {};
  return {
    rawAction: metadata.raw_action || proto.action,
    normalizedHint: metadata.normalized_action || proto.action,
    eventType: proto.event_type || metadata.event_type || null,
    actor: proto.actor || null,
    object: proto.object || null,
    title: context.title || proto.title || '',
    newsId: context.newsId || null
  };
}

async function ensureActionSeeded() {
  if (actionSeeded) return;
  await seedStandardActionsFromConfig();
  actionSeeded = true;
}

function rawConfigNormalize(value) {
  const text = normalizeText(value).toLowerCase();
  return ACTION_SYNONYM_MAP[text] || (ALL_STANDARD_ACTIONS.includes(text) ? text : null);
}

function isConcreteAction(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text || text.length < 2) return false;
  if (/^(unknown|n\/a|null|none|action|event)$/i.test(text)) return false;
  if (!/[\p{L}\p{N}]/u.test(text)) return false;
  return true;
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
