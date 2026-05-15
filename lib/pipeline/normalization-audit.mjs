import { callLLM, extractProtoEventsWithLLM } from '../../apis/parsers/llm-parser.mjs';
import { parseChineseNews, parseEnglishNews } from '../../apis/parsers/enhanced-parser.mjs';
import { canonicalMerger } from '../analysis/canonical-merger.mjs';
import { inferenceEngine } from '../analysis/inference-engine.mjs';
import { storyManager } from '../analysis/story-manager.mjs';
import { calculateEventAttributes } from '../analysis/event-deduplication.mjs';
import { eventRelationshipAnalyzer } from '../analysis/event-relationship-analyzer.mjs';
import { query } from '../db/connection.mjs';
import { getNewsById } from '../db/news-queries.mjs';
import { getNewsForEvent } from '../db/event-news-queries.mjs';
import { updateEventSnapshot } from '../db/events-queries.mjs';
import { recordAttributeHistory } from '../db/event-history-queries.mjs';
import { bulkCreateEventRelationships } from '../db/event-relationships-queries.mjs';
import { getOrCreateEntityWithHierarchy, searchEntityCandidates } from '../db/entity-queries.mjs';
import { ensureActionMapping, searchActionCandidates, upsertStandardAction } from '../db/action-queries.mjs';
import { processLlmProtoEvents, processProtoEvents } from './post-processing.mjs';
import { resolveEntitiesForProtoEvents } from './entity-resolution.mjs';
import { resolveActionsForProtoEvents } from './action-resolution.mjs';
import {
  fetchPendingNormalizationContexts,
  getPendingNormalizationById,
  getPendingNormalizationImpact,
  listPendingNormalizations,
  recordNormalizationAuditLog,
  updatePendingNormalizationAudit
} from '../db/pending-normalization-queries.mjs';
import {
  claimNextNormalizationRebuildJob,
  createNormalizationRebuildJob,
  getNormalizationRebuildJob,
  listNormalizationRebuildJobs,
  markNormalizationRebuildJobDeferred,
  markNormalizationRebuildJobFailed,
  markNormalizationRebuildJobSuccess,
  recoverStaleNormalizationRebuildJobs,
  releaseNewsLocks,
  tryAcquireNewsLocks,
  withNewsLocks
} from '../db/normalization-rebuild-queries.mjs';

const DEFAULT_LIMIT = 20;
let rebuildWorkerRunning = false;
let rebuildWorkerStarted = false;

export async function listProvisionalNormalizations(options = {}) {
  return listPendingNormalizations(options);
}

export async function listNormalizationRebuildJobRecords(options = {}) {
  return listNormalizationRebuildJobs(options);
}

export async function getNormalizationRebuildJobRecord(id) {
  return getNormalizationRebuildJob(id);
}

export async function startNormalizationRebuildWorker(options = {}) {
  const recovered = await recoverStaleNormalizationRebuildJobs({
    runningOlderThanMs: Number(options.runningOlderThanMs || process.env.NORMALIZATION_REBUILD_STALE_MS || 60 * 60 * 1000)
  });
  if (recovered.length > 0) {
    console.log(`[NormalizationRebuild] Recovered stale running jobs count=${recovered.length}`);
  }

  rebuildWorkerStarted = true;
  kickNormalizationRebuildWorker();
  return { status: 'started', recovered_count: recovered.length };
}

export function kickNormalizationRebuildWorker() {
  if (rebuildWorkerRunning) return;
  setTimeout(runNextRebuildJob, 0);
}

export async function runNormalizationAudit(options = {}) {
  const startedAt = Date.now();
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const apply = options.apply === true;
  const rebuild = options.rebuild !== false;
  const candidates = await listPendingNormalizations({
    itemKind: options.itemKind || null,
    status: options.status || 'pending',
    limit,
    offset: Number(options.offset || 0)
  });

  console.log(`[NormalizationAudit] Start apply=${apply} rebuild=${rebuild} candidates=${candidates.length}`);

  const reviews = [];
  const summary = {
    candidate_count: candidates.length,
    reviewed_count: 0,
    promoted_count: 0,
    merged_count: 0,
    kept_count: 0,
    rejected_count: 0,
    affected_proto_count: 0,
    affected_event_count: 0,
    affected_story_count: 0,
    affected_news_count: 0,
    rebuild_results: []
  };

  for (const candidate of candidates) {
    const contexts = await fetchPendingNormalizationContexts(candidate.id, 5);
    const review = await reviewPendingNormalization(candidate, contexts);
    const item = { candidate, contexts, review };
    reviews.push(item);
    summary.reviewed_count++;
    console.log(`[NormalizationAudit] pending=${candidate.id} kind=${candidate.item_kind} decision=${review.decision} reason=${review.reason || ''}`);

    if (review.decision === 'promote_to_standard') summary.promoted_count++;
    else if (review.decision === 'merge_to_existing') summary.merged_count++;
    else if (review.decision === 'reject_noise') summary.rejected_count++;
    else summary.kept_count++;

    if (!apply) continue;

    const applied = await applyPendingNormalizationDecision(candidate, review, { rebuild });
    item.applied = applied;
    summary.affected_proto_count += applied?.impact?.proto_count || 0;
    summary.affected_event_count += applied?.impact?.event_count || 0;
    summary.affected_story_count += applied?.impact?.story_count || 0;
    summary.affected_news_count += applied?.impact?.news_count || 0;
    if (applied?.rebuild) summary.rebuild_results.push(applied.rebuild);
  }

  summary.duration_ms = Date.now() - startedAt;
  console.log(`[NormalizationAudit] Done reviewed=${summary.reviewed_count} promoted=${summary.promoted_count} merged=${summary.merged_count} rejected=${summary.rejected_count} durationMs=${summary.duration_ms}`);

  return { ...summary, apply, reviews };
}

export async function promotePendingNormalization(pendingId, options = {}) {
  const pending = await getPendingNormalizationById(pendingId);
  if (!pending) throw new Error(`Pending normalization ${pendingId} not found`);

  const decision = {
    decision: options.targetEntityId || options.targetActionId ? 'merge_to_existing' : 'promote_to_standard',
    target_entity_id: normalizePositiveId(options.targetEntityId),
    target_action_id: normalizePositiveId(options.targetActionId),
    canonical_name: options.canonicalName || pending.provisional_name || pending.raw_value,
    entity_type: options.entityType || pending.provisional_type,
    action_key: options.actionKey || pending.provisional_name || pending.raw_value,
    action_category: options.actionCategory || pending.provisional_type || 'custom',
    parent_entity: options.parentEntity || options.parent_entity || pending.parent_entity_name || null,
    parent_entity_id: normalizePositiveId(options.parentEntityId || options.parent_entity_id || pending.parent_entity_id),
    entity_subtype: options.entitySubtype || options.entity_subtype || pending.entity_subtype || null,
    hierarchy_confidence: options.hierarchyConfidence || options.hierarchy_confidence || pending.hierarchy_confidence || null,
    confidence: Number(options.confidence || 0.85),
    reason: options.reason || 'Manual promotion'
  };

  return applyPendingNormalizationDecision(pending, decision, {
    rebuild: options.rebuild !== false,
    manual: true,
    asyncRebuild: options.asyncRebuild === true
  });
}

export async function rejectPendingNormalization(pendingId, options = {}) {
  const pending = await getPendingNormalizationById(pendingId);
  if (!pending) throw new Error(`Pending normalization ${pendingId} not found`);

  const decision = {
    decision: 'reject_noise',
    reason: options.reason || 'Manual noise mark from pending normalizations dashboard (record retained)',
    confidence: Number(options.confidence || 0.95)
  };

  return applyPendingNormalizationDecision(pending, decision, {
    rebuild: false,
    manual: true,
    asyncRebuild: options.asyncRebuild === true
  });
}

export async function reviewSinglePendingNormalization(pendingId, options = {}) {
  const pending = await getPendingNormalizationById(pendingId);
  if (!pending) throw new Error(`Pending normalization ${pendingId} not found`);

  const contexts = await fetchPendingNormalizationContexts(pending.id, Number(options.contextLimit || 5));
  const review = await reviewPendingNormalization(pending, contexts);
  const result = { candidate: pending, contexts, review };

  if (options.apply === true) {
    result.applied = await applyPendingNormalizationDecision(pending, review, {
      rebuild: options.rebuild !== false,
      manual: options.manual === true,
      asyncRebuild: options.asyncRebuild === true
    });
  }

  return result;
}

export async function rebuildAffectedNormalizations(pendingId, options = {}) {
  const impact = await getPendingNormalizationImpact(pendingId);
  if (options.async === true || options.asyncRebuild === true) {
    return enqueueNormalizationRebuild(impact.news_ids, { reason: options.reason || `pending_normalization:${pendingId}:manual_rebuild` });
  }
  return rebuildAffectedNews(impact.news_ids, options);
}

async function reviewPendingNormalization(candidate, contexts) {
  if (isObviousNoise(candidate)) {
    return { decision: 'reject_noise', reason: 'Matched obvious noise heuristic', confidence: 0.9 };
  }

  try {
    const matches = await findCandidateMatches(candidate);
    const result = await callLLM(buildAuditPrompt(candidate, contexts, matches));
    if (!result || typeof result !== 'object') {
      return { decision: 'keep_pending', reason: 'Invalid LLM response', confidence: 0.5 };
    }
    return normalizeAuditDecision(result, candidate);
  } catch (error) {
    console.error(`[NormalizationAudit] LLM review failed for pending ${candidate.id}:`, error.message);
    return { decision: 'keep_pending', reason: `LLM review failed: ${error.message}`, confidence: 0.5 };
  }
}

async function applyPendingNormalizationDecision(candidate, decision, options = {}) {
  const impact = await getPendingNormalizationImpact(candidate.id);
  let targetEntityId = normalizePositiveId(decision.target_entity_id);
  let targetActionId = normalizePositiveId(decision.target_action_id);
  let parentEntityId = normalizePositiveId(decision.parent_entity_id || candidate.parent_entity_id);
  let status = 'pending';
  let rebuild = null;

  if (decision.decision === 'promote_to_standard') {
    if (candidate.item_kind === 'entity') {
      const { entity } = await getOrCreateEntityWithHierarchy(
        candidate.raw_value,
        decision.canonical_name || candidate.provisional_name || candidate.raw_value,
        decision.entity_type || candidate.provisional_type || 'organization',
        decision.parent_entity || candidate.parent_entity_name || null,
        decision.confidence || 0.85,
        {
          parentEntityId: parentEntityId || null,
          entitySubtype: decision.entity_subtype || candidate.entity_subtype || null,
          parentEntityType: inferParentEntityType(decision.parent_entity || candidate.parent_entity_name || '')
        }
      );
      targetEntityId = entity.id;
      parentEntityId = entity.parent_entity_id || parentEntityId || null;
      status = 'promoted';
    } else {
      const action = await upsertStandardAction({
        actionKey: decision.action_key || candidate.provisional_name || candidate.raw_value,
        displayName: decision.action_name || decision.action_key || candidate.provisional_name || candidate.raw_value,
        actionCategory: decision.action_category || candidate.provisional_type || 'custom',
        confidence: decision.confidence || 0.85
      });
      await ensureActionMapping(candidate.raw_value, action.id, decision.confidence || 0.85, 'normalization_audit');
      targetActionId = action.id;
      status = 'promoted';
    }
  } else if (decision.decision === 'merge_to_existing') {
    if (candidate.item_kind === 'action' && targetActionId) {
      await ensureActionMapping(candidate.raw_value, targetActionId, decision.confidence || 0.85, 'normalization_audit');
    }
    status = 'merged';
  } else if (decision.decision === 'reject_noise') {
    status = 'pending';
  } else {
    status = 'pending';
  }

  await updatePendingNormalizationAudit({
    pendingId: candidate.id,
    status,
    auditDecision: decision.decision,
    auditReason: decision.reason || null,
    targetEntityId,
    targetActionId,
    suggestedNormalization: decision.canonical_name || decision.action_key || null,
    parentEntityName: decision.parent_entity || candidate.parent_entity_name || null,
    parentEntityId,
    entitySubtype: decision.entity_subtype || candidate.entity_subtype || null,
    hierarchyConfidence: decision.hierarchy_confidence || decision.confidence || candidate.hierarchy_confidence || null,
    reviewedBy: options.manual ? 'manual' : 'normalization-audit'
  });

  const shouldRebuild = options.rebuild !== false && ['promote_to_standard', 'merge_to_existing'].includes(decision.decision) && impact.news_ids.length > 0;
  const asyncRebuild = options.asyncRebuild === true;
  if (shouldRebuild && asyncRebuild) {
    rebuild = await enqueueNormalizationRebuild(impact.news_ids, { reason: `pending_normalization:${candidate.id}:${decision.decision}` });
  } else if (shouldRebuild) {
    rebuild = await rebuildAffectedNews(impact.news_ids, { reason: `pending_normalization:${candidate.id}:${decision.decision}` });
  }

  await recordNormalizationAuditLog({
    pendingId: candidate.id,
    itemKind: candidate.item_kind || 'entity',
    decision: decision.decision,
    reason: decision.reason || null,
    targetEntityId,
    targetActionId,
    affectedProtoCount: impact.proto_count,
    affectedEventCount: impact.event_count,
    affectedStoryCount: impact.story_count,
    affectedNewsCount: impact.news_count,
    rebuildStatus: rebuild?.status || (shouldRebuild ? 'failed' : 'skipped'),
    rebuildJobId: rebuild?.rebuild_job_id || rebuild?.id || null,
    metadata: { impact, rebuild, decision }
  });

  return {
    pending_id: candidate.id,
    decision,
    targetEntityId,
    targetActionId,
    impact,
    rebuild,
    rebuild_job_id: rebuild?.rebuild_job_id || rebuild?.id || null,
    rebuild_status: rebuild?.rebuild_status || rebuild?.status || (shouldRebuild ? 'failed' : 'skipped'),
    locked_news_count: rebuild?.locked_news_count || 0,
    deferred_news_count: rebuild?.deferred_news_count || 0
  };
}

export async function enqueueNormalizationRebuild(newsIds, options = {}) {
  const uniqueNewsIds = [...new Set((newsIds || []).map(Number).filter(Number.isInteger))];

  const job = await createNormalizationRebuildJob({
    newsIds: uniqueNewsIds,
    reason: options.reason || 'normalization change',
    metadata: options.metadata || {}
  });

  if (!job?.id) return job;
  console.log(`[NormalizationRebuild] Queued db_job=${job.id} news=${job.news_count} reason=${job.reason}`);
  kickNormalizationRebuildWorker();
  return {
    ...job,
    rebuild_job_id: job.id,
    rebuild_status: job.status,
    locked_news_count: 0,
    deferred_news_count: 0
  };
}

async function runNextRebuildJob() {
  if (rebuildWorkerRunning) return;
  rebuildWorkerRunning = true;
  try {
    const job = await claimNextNormalizationRebuildJob();
    if (!job) return;

    await executeRebuildJob(job);
  } catch (error) {
    console.error('[NormalizationRebuild] Worker failed:', error);
  } finally {
    rebuildWorkerRunning = false;
    if (rebuildWorkerStarted) {
      setTimeout(runNextRebuildJob, Number(process.env.NORMALIZATION_REBUILD_IDLE_DELAY_MS || 1000));
    }
  }
}

async function executeRebuildJob(job) {
  const owner = `normalization-rebuild:${job.id}:${process.pid}`;
  const lockInfo = await tryAcquireNewsLocks(job.news_ids, {
    owner,
    reason: job.reason || `normalization_rebuild_job:${job.id}`,
    ttlMs: Number(process.env.NORMALIZATION_REBUILD_LOCK_TTL_MS || 30 * 60 * 1000)
  });

  if (!lockInfo.acquired) {
    await releaseNewsLocks(lockInfo.lock_keys, owner);
    const deferred = await markNormalizationRebuildJobDeferred(job.id, {
      error: `Deferred because news locks are busy: ${lockInfo.deferred_news_ids.join(', ')}`,
      result: { lock_info: lockInfo },
      lockedNewsCount: lockInfo.locked_news_count,
      deferredNewsCount: lockInfo.deferred_news_count,
      delayMs: Number(process.env.NORMALIZATION_REBUILD_DEFER_MS || 5 * 60 * 1000)
    });
    console.log(`[NormalizationRebuild] Deferred job=${job.id} locked=${lockInfo.locked_news_count} deferred=${lockInfo.deferred_news_count}`);
    return deferred;
  }

  try {
    console.log(`[NormalizationRebuild] Running job=${job.id} news=${job.news_count} reason=${job.reason || ''}`);
    const result = await rebuildAffectedNews(job.news_ids, {
      reason: job.reason,
      locksAlreadyHeld: true,
      lockOwner: owner
    });
    const updated = await markNormalizationRebuildJobSuccess(job.id, {
      result,
      lockedNewsCount: lockInfo.locked_news_count,
      deferredNewsCount: 0
    });
    console.log(`[NormalizationRebuild] Job success id=${job.id} news=${job.news_count} durationMs=${result.duration_ms || 0}`);
    return updated;
  } catch (error) {
    await markNormalizationRebuildJobFailed(job.id, {
      error: error.message,
      result: { stack: error.stack },
      lockedNewsCount: lockInfo.locked_news_count,
      deferredNewsCount: 0
    });
    console.error(`[NormalizationRebuild] Job failed id=${job.id}:`, error);
    return null;
  } finally {
    await releaseNewsLocks(lockInfo.lock_keys, owner);
  }
}

export async function rebuildAffectedNews(newsIds, options = {}) {
  const uniqueNewsIds = [...new Set((newsIds || []).map(Number).filter(Number.isInteger))];
  const startedAt = Date.now();
  if (uniqueNewsIds.length === 0) {
    return { status: 'skipped', news_count: 0, duration_ms: 0 };
  }

  if (options.locksAlreadyHeld !== true) {
    const owner = options.lockOwner || `normalization-rebuild:direct:${process.pid}:${Date.now()}`;
    const { lockInfo, result } = await withNewsLocks(uniqueNewsIds, {
      owner,
      reason: options.reason || 'direct normalization rebuild',
      ttlMs: Number(process.env.NORMALIZATION_REBUILD_LOCK_TTL_MS || 30 * 60 * 1000)
    }, async () => rebuildAffectedNews(uniqueNewsIds, { ...options, locksAlreadyHeld: true, lockOwner: owner }));

    return {
      ...result,
      lock_info: lockInfo,
      locked_news_count: lockInfo.locked_news_count,
      deferred_news_count: lockInfo.deferred_news_count
    };
  }

  console.log(`[NormalizationRebuild] Rebuilding L2-L6 for ${uniqueNewsIds.length} news items (${options.reason || 'normalization change'})`);
  const deleteResult = await deleteL2ToL6ForNews(uniqueNewsIds);
  const reparseResults = [];
  const affectedEventIds = new Set();

  for (const newsId of uniqueNewsIds) {
    const result = await reprocessNewsById(newsId);
    reparseResults.push(result);
    (result.affected_events || []).forEach((id) => affectedEventIds.add(id));
  }

  for (const eventId of affectedEventIds) {
    const relationships = await eventRelationshipAnalyzer.analyzeNewEventRelationships(eventId);
    if (relationships.length > 0) {
      await bulkCreateEventRelationships(relationships);
    }
  }

  const storySyncCount = await storyManager.syncStories();
  if (process.env.NORMALIZATION_AUDIT_GENERATE_HYPOTHESES === 'true') {
    await inferenceEngine.generateHypotheses();
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[NormalizationRebuild] Done news=${uniqueNewsIds.length} events=${affectedEventIds.size} storySync=${storySyncCount} durationMs=${durationMs}`);

  return {
    status: 'success',
    news_count: uniqueNewsIds.length,
    affected_event_count: affectedEventIds.size,
    story_sync_count: storySyncCount,
    delete_result: deleteResult,
    reparse_results: reparseResults,
    duration_ms: durationMs
  };
}

async function deleteL2ToL6ForNews(newsIds) {
  const protoRows = await query('SELECT id, canonical_event_id FROM proto_events WHERE news_id = ANY($1::int[])', [newsIds]);
  const eventIds = [...new Set(protoRows.rows.map((row) => row.canonical_event_id).filter(Number.isInteger))];
  const storyIds = eventIds.length
    ? (await query('SELECT DISTINCT story_id FROM events WHERE id = ANY($1::int[]) AND story_id IS NOT NULL', [eventIds])).rows.map((row) => row.story_id)
    : [];

  await query('DELETE FROM proto_events WHERE news_id = ANY($1::int[])', [newsIds]);

  const orphanEventRows = eventIds.length
    ? await query(`
        SELECT id FROM events e
        WHERE id = ANY($1::int[])
          AND NOT EXISTS (SELECT 1 FROM proto_events pe WHERE pe.canonical_event_id = e.id)
      `, [eventIds])
    : { rows: [] };
  const orphanEventIds = orphanEventRows.rows.map((row) => row.id);

  if (orphanEventIds.length > 0) {
    await query('DELETE FROM event_attribute_history WHERE event_id = ANY($1::int[])', [orphanEventIds]);
    await query('DELETE FROM event_milestones WHERE event_id = ANY($1::int[])', [orphanEventIds]);
    await query('DELETE FROM event_relationships WHERE source_event_id = ANY($1::int[]) OR target_event_id = ANY($1::int[])', [orphanEventIds]);
    await query('DELETE FROM event_news WHERE event_id = ANY($1::int[])', [orphanEventIds]);
    await query('DELETE FROM events WHERE id = ANY($1::int[])', [orphanEventIds]);
  }

  const deletedStoryIds = storyIds.length
    ? (await query(`
        DELETE FROM stories
        WHERE id = ANY($1::int[])
          AND NOT EXISTS (SELECT 1 FROM events e WHERE e.story_id = stories.id)
        RETURNING id
      `, [storyIds])).rows.map((row) => row.id)
    : [];

  return {
    deleted_proto_count: protoRows.rows.length,
    deleted_event_count: orphanEventIds.length,
    deleted_story_count: deletedStoryIds.length
  };
}

async function reprocessNewsById(newsId) {
  const news = await getNewsById(newsId);
  if (!news) return { news_id: newsId, status: 'missing', affected_events: [] };

  const method = process.env.NORMALIZATION_REBUILD_PARSER || (process.env.OPENAI_API_KEY ? 'llm' : 'enhanced');
  const parseResult = method === 'llm'
    ? await extractProtoEventsWithLLM(news.title || '', news.content || '', { newsId, saveResult: false })
    : await parseWithEnhanced(news);
  const processed = method === 'llm'
    ? await processLlmProtoEvents(parseResult, { source: 'normalization-rebuild', method, newsId, title: news.title || '' })
    : await processProtoEvents(parseResult, { source: 'normalization-rebuild', method, newsId, title: news.title || '' });
  const entityResolved = await resolveEntitiesForProtoEvents(processed.proto_events || [], { source: 'normalization-rebuild', method, newsId, title: news.title || '' });
  const actionResolved = await resolveActionsForProtoEvents(entityResolved, { source: 'normalization-rebuild', method, newsId, title: news.title || '' });

  const batchCanonicals = [];
  const mergeResults = [];
  for (const proto of actionResolved) {
    const res = await canonicalMerger.mergeSingleProtoEvent(proto, newsId, batchCanonicals);
    mergeResults.push(res);
    await inferenceEngine.verifyHypotheses(proto);
  }

  const affectedEvents = [...new Set(mergeResults.map((item) => item.canonicalEventId).filter(Boolean))];
  for (const eventId of affectedEvents) {
    const newsItems = await getNewsForEvent(eventId, 1, 500);
    const attributes = calculateEventAttributes(newsItems);
    if (attributes) {
      await updateEventSnapshot(eventId, attributes);
      await recordAttributeHistory(eventId, attributes, {
        triggeringNewsId: newsId,
        aggregationWindow: 'normalization-rebuild',
        calculationMethod: 'targeted-normalization-rebuild'
      });
    }
  }

  return { news_id: newsId, status: 'success', parser: method, proto_event_count: actionResolved.length, affected_events: affectedEvents };
}

async function parseWithEnhanced(news) {
  const isChinese = news.lang && (news.lang.startsWith('zh') || news.lang === 'cn');
  return isChinese
    ? await parseChineseNews(news.title || '', news.content || '')
    : await parseEnglishNews(news.title || '', news.content || '');
}

function normalizeAuditDecision(result, candidate) {
  const allowed = new Set(['promote_to_standard', 'merge_to_existing', 'keep_pending', 'reject_noise']);
  const decision = allowed.has(result.decision) ? result.decision : 'keep_pending';
  const relatedEntities = Array.isArray(result.related_entities)
    ? result.related_entities
      .map((item) => ({
        canonical_name: normalizeText(item?.canonical_name),
        entity_type: normalizeText(item?.entity_type),
        role_hint: normalizeText(item?.role_hint),
        reason: normalizeText(item?.reason)
      }))
      .filter((item) => item.canonical_name)
    : [];
  const baseReason = normalizeText(result.reason) || 'No reason provided';
  const relatedReason = relatedEntities.length > 0
    ? ` | related_entities=${relatedEntities.map((item) => `${item.canonical_name}${item.role_hint ? `(${item.role_hint})` : ''}`).join(', ')}`
    : '';
  return {
    decision,
    reason: `${baseReason}${relatedReason}`,
    confidence: clampConfidence(result.confidence, 0.65),
    target_entity_id: normalizePositiveId(result.target_entity_id),
    target_action_id: normalizePositiveId(result.target_action_id),
    canonical_name: normalizeText(result.canonical_name) || candidate.provisional_name || candidate.raw_value,
    entity_type: normalizeText(result.entity_type) || candidate.provisional_type,
    parent_entity: normalizeText(result.parent_entity) || null,
    entity_subtype: normalizeText(result.entity_subtype) || candidate.entity_subtype || null,
    hierarchy_confidence: clampConfidence(result.hierarchy_confidence ?? result.confidence, null),
    related_entities: relatedEntities,
    action_key: normalizeText(result.action_key) || candidate.provisional_name || candidate.raw_value,
    action_name: normalizeText(result.action_name) || candidate.provisional_name || candidate.raw_value,
    action_category: normalizeText(result.action_category) || candidate.provisional_type || 'custom'
  };
}

async function findCandidateMatches(candidate) {
  const queryText = candidate.provisional_name || candidate.raw_value;
  if (candidate.item_kind === 'action') {
    return { actions: await searchActionCandidates(queryText, 8) };
  }
  return { entities: await searchEntityCandidates(queryText, candidate.provisional_type ? [candidate.provisional_type] : [], 8) };
}

function buildAuditPrompt(candidate, contexts, matches) {
  const compactContexts = (contexts || []).map((item) => ({
    proto_event_id: item.proto_event_id,
    canonical_event_id: item.canonical_event_id,
    news_id: item.news_id,
    news_title: item.news_title,
    proto_event: {
      actor_raw: item.actor_raw,
      action_raw: item.action_raw,
      object_raw: item.object_raw,
      location_raw: item.location_raw,
      event_time: item.event_time
    },
    news_excerpt: truncateForPrompt(item.news_content, 1800)
  }));

  return `You are auditing one provisional normalization record for an event intelligence database.

Goal: decide whether this provisional entity/action is a concrete reusable item that should become standard, should merge into an existing standard item, should remain pending, or is noise.

Input semantics:
- item_kind=entity means a real-world actor, object, organization, person, country, location, region, military unit, or company.
- item_kind=action means an event/action label used for L2-L6 clustering.
- Context contains the exact proto-event fields plus original news title and an excerpt of the original article. Use the article text to disambiguate the pending item.

Allowed decisions:
- promote_to_standard: concrete reusable item, no existing candidate is clearly identical.
- merge_to_existing: concrete item is clearly identical to one provided candidate id.
- keep_pending: concrete item but evidence is insufficient or ambiguous.
- reject_noise: placeholder, malformed fragment, pronoun, template word, or non-semantic noise. This marks noise only; it does NOT delete the record.

Strict rules:
1. Do not reject a concrete entity/action just because it is unfamiliar; use keep_pending when unsure.
2. Do not promote generic words like "officials", "sources", "incident", "action", "unknown", or pronouns.
3. For merge_to_existing, use only ids present in Possible existing matches.
4. For promote_to_standard entity records, choose one entity_type from: country, organization, person, location, military_unit, company, international_org, region.
5. For hierarchical entities, keep the concrete child as canonical_name and put the broader owner/country/parent organization in parent_entity. Example: "French Foreign Minister Jean-Noel Barrot" is the child entity and "France" is parent_entity.
6. Fill entity_subtype when useful, such as foreign_minister, ministry, military_unit, subsidiary, branch, agency, or office.
7. For promote_to_standard action records, create a stable lowercase action_key with underscores.
8. If an entity text is a composite mention covering multiple concrete entities (example: "中美两国元首"), keep decision as keep_pending and populate related_entities with each concrete entity.
9. Return JSON only, with no markdown.

Output schema:
{
  "decision": "promote_to_standard|merge_to_existing|keep_pending|reject_noise",
  "target_entity_id": 123,
  "target_action_id": 456,
  "canonical_name": "standard entity name or null",
  "entity_type": "country|organization|person|location|military_unit|company|international_org|region|null",
  "parent_entity": "parent entity name or null",
  "entity_subtype": "specific subtype or null",
  "hierarchy_confidence": 0.0,
  "related_entities": [
    {
      "canonical_name": "China President",
      "entity_type": "person",
      "role_hint": "actor|object|peer",
      "reason": "why this related entity is implied"
    }
  ],
  "action_key": "standard_action_key_or_null",
  "action_name": "standard action display name or null",
  "action_category": "category or null",
  "confidence": 0.0,
  "reason": "brief evidence-based reason mentioning the decisive news context"
}

Pending candidate:
${JSON.stringify(candidate, null, 2)}

Original news and proto-event contexts:
${JSON.stringify(compactContexts, null, 2)}

Possible existing matches:
${JSON.stringify(matches || {}, null, 2)}`;
}

function truncateForPrompt(value, maxLength = 1800) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function isObviousNoise(candidate) {
  const text = normalizeText(candidate.provisional_name || candidate.raw_value).toLowerCase();
  return !text || text.length <= 1 || /^(unknown|n\/a|null|none|it|they|action|event)$/i.test(text);
}

function inferParentEntityType(parentName) {
  const text = normalizeText(parentName).toLowerCase();
  if (!text) return 'organization';
  if (/\b(china|france|germany|russia|iran|israel|ukraine|india|japan|korea|turkey|brazil|canada|mexico|country|republic|kingdom|states)\b/i.test(text)) {
    return 'country';
  }
  if (/\b(region|province|state|city|territory)\b/i.test(text)) return 'location';
  return 'organization';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function clampConfidence(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
}

function normalizePositiveId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}
