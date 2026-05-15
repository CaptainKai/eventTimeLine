import { callLLM } from '../../apis/parsers/llm-parser.mjs';
import { query } from '../db/connection.mjs';
import { recordEntityCleanupAudit } from '../db/entity-cleanup-audit-queries.mjs';

const DEFAULT_PREVIEW_LIMIT = 20;
const PLACEHOLDER_TERMS = new Set([
  'both sides',
  'relevant parties',
  'relevant departments',
  'sources',
  'source',
  'officials',
  'an official',
  'the company',
  'the country',
  'the organization',
  'the agency',
  'authorities',
  'it',
  'they',
  'them',
  'he',
  'she',
  '\u53cc\u65b9',
  '\u6709\u5173\u65b9\u9762',
  '\u76f8\u5173\u65b9\u9762',
  '\u6709\u5173\u90e8\u95e8',
  '\u76f8\u5173\u90e8\u95e8',
  '\u6709\u5173\u4eba\u58eb',
  '\u76f8\u5173\u4eba\u58eb',
  '\u6d88\u606f\u4eba\u58eb',
  '\u77e5\u60c5\u4eba\u58eb',
  '\u533f\u540d\u4eba\u58eb',
  '\u4e00\u4f4d\u5b98\u5458',
  '\u67d0\u5b98\u5458',
  '\u8be5\u516c\u53f8',
  '\u8be5\u56fd',
  '\u8be5\u7ec4\u7ec7',
  '\u8be5\u673a\u6784',
  '\u8be5\u90e8\u95e8',
  '\u8be5\u4eba\u58eb',
  '\u8be5\u5b98\u5458'
].map(decodeEscapedUnicode));

const PLACEHOLDER_SUFFIXES = [
  'sources',
  'officials',
  'both sides',
  '\u6d88\u606f\u4eba\u58eb',
  '\u77e5\u60c5\u4eba\u58eb',
  '\u4e00\u4f4d\u5b98\u5458',
  '\u53cc\u65b9',
  '\u6709\u5173\u65b9\u9762',
  '\u76f8\u5173\u65b9\u9762'
].map(decodeEscapedUnicode);

export async function findMeaninglessEntityCandidates(options = {}) {
  const { entityIds = null, limit = DEFAULT_PREVIEW_LIMIT } = options;
  const rows = await fetchEntityReferenceRows({ entityIds, limit: Math.max(limit * 4, 50) });
  const filteredRows = rows.filter((row) => isMeaninglessEntityCandidate(row.raw_name, row.canonical_name));
  const candidates = [];

  for (const row of filteredRows.slice(0, limit)) {
    candidates.push({
      entity_id: row.id,
      raw_name: row.raw_name,
      canonical_name: row.canonical_name,
      entity_type: row.entity_type,
      confidence: Number(row.confidence || 0),
      proto_reference_count: Number(row.proto_reference_count || 0),
      event_reference_count: Number(row.event_reference_count || 0),
      rule_reason: buildRuleReason(row.raw_name, row.canonical_name),
      contexts: await fetchEntityContexts(row.id, 3)
    });
  }

  return candidates;
}

export async function runMeaninglessEntityCleanup(options = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for LLM-confirmed entity cleanup');
  }

  const candidates = await findMeaninglessEntityCandidates(options);
  const reviews = [];
  const entityIdsToDelete = [];

  for (const candidate of candidates) {
    const review = await reviewMeaninglessEntityCandidate(candidate);
    reviews.push({ ...candidate, review });
    if (review.decision === 'delete') {
      entityIdsToDelete.push(candidate.entity_id);
    }
  }

  if (entityIdsToDelete.length === 0) {
    return {
      reviewed_count: reviews.length,
      deleted_entity_ids: [],
      deleted_proto_count: 0,
      deleted_event_count: 0,
      deleted_story_count: 0,
      reviews
    };
  }

  const deleteResult = await deleteEntityChains(entityIdsToDelete, {
    deleteEntityRows: options.deleteEntityRows !== false,
    audit: false
  });

  await Promise.all(reviews
    .filter((item) => item.review.decision === 'delete')
    .map((item) => recordEntityCleanupAudit({
      entity_id: item.entity_id,
      entity_raw_name: item.raw_name,
      entity_canonical_name: item.canonical_name,
      llm_decision: item.review.decision,
      reason: item.review.reason,
      affected_proto_count: deleteResult.deleted_proto_count,
      affected_event_count: deleteResult.deleted_event_count,
      affected_story_count: deleteResult.deleted_story_count,
      deleted_entity_row: deleteResult.deleted_entity_ids.includes(item.entity_id),
      metadata: {
        rule_reason: item.rule_reason,
        contexts: item.contexts
      }
    })));

  return {
    reviewed_count: reviews.length,
    deleted_entity_ids: deleteResult.deleted_entity_ids,
    deleted_proto_count: deleteResult.deleted_proto_count,
    deleted_event_count: deleteResult.deleted_event_count,
    deleted_story_count: deleteResult.deleted_story_count,
    reviews
  };
}

export async function deleteEntityChains(entityIds, options = {}) {
  const uniqueEntityIds = [...new Set((entityIds || []).map(Number).filter(Number.isInteger))];
  if (uniqueEntityIds.length === 0) {
    return emptyDeleteResult();
  }

  const deleteEntityRows = options.deleteEntityRows !== false;
  const entityRows = await query('SELECT id, raw_name, canonical_name FROM entity_mapping WHERE id = ANY($1::int[])', [uniqueEntityIds]);
  const entityMap = new Map(entityRows.rows.map((row) => [row.id, row]));

  const impactedProtoRows = await query(`
    SELECT id, canonical_event_id
    FROM proto_events
    WHERE actor_entity_id = ANY($1::int[])
       OR object_entity_id = ANY($1::int[])
       OR location_id = ANY($1::int[])
  `, [uniqueEntityIds]);

  const directlyImpactedEventRows = await query(`
    SELECT id
    FROM events
    WHERE actor1_id = ANY($1::int[])
       OR actor2_id = ANY($1::int[])
       OR location_id = ANY($1::int[])
  `, [uniqueEntityIds]);

  const directProtoIds = impactedProtoRows.rows.map((row) => row.id);
  const impactedEventIds = [...new Set([
    ...impactedProtoRows.rows.map((row) => row.canonical_event_id).filter(Number.isInteger),
    ...directlyImpactedEventRows.rows.map((row) => row.id).filter(Number.isInteger)
  ])];
  const allProtoIdsToDelete = new Set(directProtoIds);

  if (impactedEventIds.length > 0) {
    const eventProtoRows = await query('SELECT id FROM proto_events WHERE canonical_event_id = ANY($1::int[])', [impactedEventIds]);
    eventProtoRows.rows.forEach((row) => allProtoIdsToDelete.add(row.id));
  }

  const storyIds = impactedEventIds.length > 0
    ? (await query('SELECT DISTINCT story_id FROM events WHERE id = ANY($1::int[]) AND story_id IS NOT NULL', [impactedEventIds])).rows.map((row) => row.story_id)
    : [];

  if (allProtoIdsToDelete.size > 0) {
    await query('DELETE FROM proto_events WHERE id = ANY($1::int[])', [Array.from(allProtoIdsToDelete)]);
  }

  if (impactedEventIds.length > 0) {
    await query('DELETE FROM event_attribute_history WHERE event_id = ANY($1::int[])', [impactedEventIds]);
    await query('DELETE FROM event_milestones WHERE event_id = ANY($1::int[])', [impactedEventIds]);
    await query('DELETE FROM event_relationships WHERE source_event_id = ANY($1::int[]) OR target_event_id = ANY($1::int[])', [impactedEventIds]);
    await query('DELETE FROM event_news WHERE event_id = ANY($1::int[])', [impactedEventIds]);
    await query('DELETE FROM events WHERE id = ANY($1::int[])', [impactedEventIds]);
  }

  await query(`
    DELETE FROM event_aggregates
    WHERE actor1_id = ANY($1::int[])
       OR actor2_id = ANY($1::int[])
       OR location_id = ANY($1::int[])
  `, [uniqueEntityIds]);

  await query(`
    DELETE FROM normalized_events
    WHERE actor1_id = ANY($1::int[])
       OR actor2_id = ANY($1::int[])
       OR location_id = ANY($1::int[])
  `, [uniqueEntityIds]);

  const deletedStoryIds = storyIds.length > 0
    ? (await query(`
        DELETE FROM stories
        WHERE id = ANY($1::int[])
          AND id NOT IN (SELECT DISTINCT story_id FROM events WHERE story_id IS NOT NULL)
        RETURNING id
      `, [storyIds])).rows.map((row) => row.id)
    : [];

  if (deleteEntityRows) {
    await query('UPDATE entity_mapping SET parent_entity_id = NULL WHERE parent_entity_id = ANY($1::int[])', [uniqueEntityIds]);
  }

  const deletedEntityIds = deleteEntityRows
    ? (await query('DELETE FROM entity_mapping WHERE id = ANY($1::int[]) RETURNING id', [uniqueEntityIds])).rows.map((row) => row.id)
    : [];

  const result = {
    deleted_entity_ids: deletedEntityIds,
    deleted_proto_count: allProtoIdsToDelete.size,
    deleted_event_count: impactedEventIds.length,
    deleted_story_count: deletedStoryIds.length
  };

  if (options.audit !== false) {
    await Promise.all(uniqueEntityIds.map((entityId) => {
      const entity = entityMap.get(entityId);
      return recordEntityCleanupAudit({
        entity_id: entityId,
        entity_raw_name: entity?.raw_name || null,
        entity_canonical_name: entity?.canonical_name || null,
        llm_decision: 'delete',
        reason: options.reason || 'Explicit entity chain deletion',
        affected_proto_count: result.deleted_proto_count,
        affected_event_count: result.deleted_event_count,
        affected_story_count: result.deleted_story_count,
        deleted_entity_row: deletedEntityIds.includes(entityId),
        metadata: { explicit_delete: true }
      });
    }));
  }

  return result;
}

async function reviewMeaninglessEntityCandidate(candidate) {
  try {
    const result = await callLLM(buildMeaninglessEntityReviewPrompt(candidate));
    if (!result || typeof result !== 'object') {
      return { decision: 'keep', reason: 'Invalid LLM response' };
    }

    return {
      decision: result.decision === 'delete' ? 'delete' : 'keep',
      reason: normalizeText(result.reason) || 'No reason provided'
    };
  } catch (error) {
    console.error(`[EntityCleanup] LLM review failed for entity ${candidate.entity_id}:`, error.message);
    return { decision: 'keep', reason: `LLM review failed: ${error.message}` };
  }
}

function buildMeaninglessEntityReviewPrompt(candidate) {
  return `You are reviewing an entity database cleanup candidate.

Task: decide whether this entity is obvious meaningless extraction noise.

Allowed decisions:
- keep
- delete

Delete only when all of these are true:
1. It is clearly a pronoun, placeholder, generic fragment, or template phrase.
2. It cannot stably represent a concrete country, organization, person, company, location, or region.
3. It is more likely extraction noise than a reusable entity.

Keep when uncertain. Return JSON only:
{
  "decision": "keep|delete",
  "reason": "short reason"
}

Candidate:
${JSON.stringify(candidate, null, 2)}`;
}

async function fetchEntityReferenceRows(options = {}) {
  const { entityIds = null, limit = 100 } = options;
  const whereClause = Array.isArray(entityIds) && entityIds.length > 0 ? 'WHERE em.id = ANY($1::int[])' : '';
  const params = whereClause ? [entityIds] : [limit];
  const limitClause = whereClause ? '' : 'LIMIT $1';

  const result = await query(`
    SELECT
      em.*,
      COUNT(DISTINCT pe.id) AS proto_reference_count,
      COUNT(DISTINCT e.id) AS event_reference_count
    FROM entity_mapping em
    LEFT JOIN proto_events pe
      ON pe.actor_entity_id = em.id
      OR pe.object_entity_id = em.id
      OR pe.location_id = em.id
    LEFT JOIN events e
      ON e.actor1_id = em.id
      OR e.actor2_id = em.id
      OR e.location_id = em.id
    ${whereClause}
    GROUP BY em.id
    ORDER BY (COUNT(DISTINCT pe.id) + COUNT(DISTINCT e.id)) DESC, em.updated_at DESC, em.id DESC
    ${limitClause}
  `, params);

  return result.rows;
}

async function fetchEntityContexts(entityId, limit = 3) {
  const result = await query(`
    SELECT
      pe.id AS proto_event_id,
      pe.actor_raw,
      pe.action_raw,
      pe.object_raw,
      pe.location_raw,
      n.id AS news_id,
      n.title AS news_title
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    WHERE pe.actor_entity_id = $1
       OR pe.object_entity_id = $1
       OR pe.location_id = $1
    ORDER BY pe.created_at DESC
    LIMIT $2
  `, [entityId, limit]);

  return result.rows;
}

function isMeaninglessEntityCandidate(rawName, canonicalName) {
  return isMeaninglessText(rawName) || isMeaninglessText(canonicalName);
}

function isMeaninglessText(value) {
  const cleaned = normalizeText(value).toLowerCase();
  if (!cleaned || cleaned.length <= 1 || /^\d+$/.test(cleaned) || !/[\p{L}\p{N}]/u.test(cleaned)) return true;
  if (PLACEHOLDER_TERMS.has(cleaned)) return true;
  return PLACEHOLDER_SUFFIXES.some((suffix) => cleaned.endsWith(suffix.toLowerCase()));
}

function buildRuleReason(rawName, canonicalName) {
  if (isMeaninglessText(rawName) || isMeaninglessText(canonicalName)) {
    return 'Matched obvious placeholder or noise heuristic';
  }
  return 'Flagged by meaningless-entity heuristic';
}

function emptyDeleteResult() {
  return {
    deleted_entity_ids: [],
    deleted_proto_count: 0,
    deleted_event_count: 0,
    deleted_story_count: 0
  };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function decodeEscapedUnicode(value) {
  return value.replace(/\\u[0-9a-fA-F]{4}/g, (match) => String.fromCharCode(parseInt(match.slice(2), 16)));
}
