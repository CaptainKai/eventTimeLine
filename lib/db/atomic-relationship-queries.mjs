import { query, queryOne } from './connection.mjs';

const DEFAULT_TIME_WINDOW_DAYS = 30;

export function sanitizeProtoEventTime(value, fallback = null) {
  const candidate = value || fallback || new Date();
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function saveAtomicProtoEvent(proto, newsId, options = {}) {
  const eventTime = sanitizeProtoEventTime(proto?.time || proto?.event_time, options.publishedAt);
  const metadata = {
    ...(proto?.metadata || {}),
    atomic_graph: {
      enabled: true,
      inserted_at: new Date().toISOString()
    }
  };

  const sql = `
    INSERT INTO proto_events (
      news_id, actor_raw, action_raw, object_raw, location_raw,
      actor_entity_id, object_entity_id, location_id,
      actor_pending_id, object_pending_id, location_pending_id,
      action_id, action_pending_id,
      event_time, extraction_confidence, raw_extraction
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
    RETURNING id;
  `;

  const result = await query(sql, [
    newsId,
    proto?.actor || null,
    proto?.action || null,
    proto?.object || null,
    proto?.location || null,
    proto?.actor_entity_id || proto?.metadata?.entity_resolution?.actor?.entity_id || null,
    proto?.object_entity_id || proto?.metadata?.entity_resolution?.object?.entity_id || null,
    proto?.location_entity_id || proto?.location_id || proto?.metadata?.entity_resolution?.location?.entity_id || null,
    proto?.actor_pending_id || proto?.metadata?.entity_resolution?.actor?.pending_id || null,
    proto?.object_pending_id || proto?.metadata?.entity_resolution?.object?.pending_id || null,
    proto?.location_pending_id || proto?.metadata?.entity_resolution?.location?.pending_id || null,
    proto?.action_id || proto?.metadata?.action_resolution?.action_id || null,
    proto?.action_pending_id || proto?.metadata?.action_resolution?.pending_id || null,
    eventTime,
    proto?.confidence ?? proto?.metadata?.confidence ?? 0.5,
    JSON.stringify(metadata)
  ]);

  return result.rows[0].id;
}

export async function getProtoEventForAtomicGraph(protoEventId) {
  const sql = `
    SELECT
      pe.*,
      COALESCE(pe.event_time, n.published_at, pe.created_at) AS effective_time,
      n.title AS news_title,
      n.source AS news_source,
      n.published_at AS news_published_at,
      actor.canonical_name AS actor_name,
      object_entity.canonical_name AS object_name,
      location.canonical_name AS location_name,
      sa.display_name AS action_name,
      sa.action_key AS action_key
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    LEFT JOIN entity_mapping actor ON actor.id = pe.actor_entity_id
    LEFT JOIN entity_mapping object_entity ON object_entity.id = pe.object_entity_id
    LEFT JOIN entity_mapping location ON location.id = pe.location_id
    LEFT JOIN standard_actions sa ON sa.id = pe.action_id
    WHERE pe.id = $1;
  `;
  return queryOne(sql, [protoEventId]);
}

export async function getProtoEventsForAtomicGraph(protoEventIds = []) {
  const ids = [...new Set((protoEventIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0) return [];

  const sql = `
    SELECT
      pe.*,
      COALESCE(pe.event_time, n.published_at, pe.created_at) AS effective_time,
      n.title AS news_title,
      n.source AS news_source,
      n.published_at AS news_published_at,
      actor.canonical_name AS actor_name,
      object_entity.canonical_name AS object_name,
      location.canonical_name AS location_name,
      sa.display_name AS action_name,
      sa.action_key AS action_key
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    LEFT JOIN entity_mapping actor ON actor.id = pe.actor_entity_id
    LEFT JOIN entity_mapping object_entity ON object_entity.id = pe.object_entity_id
    LEFT JOIN entity_mapping location ON location.id = pe.location_id
    LEFT JOIN standard_actions sa ON sa.id = pe.action_id
    WHERE pe.id = ANY($1::int[])
    ORDER BY COALESCE(pe.event_time, n.published_at, pe.created_at), pe.id;
  `;

  const result = await query(sql, [ids]);
  return result.rows;
}

export async function findFallbackCandidateProtoEvents(proto, options = {}) {
  if (!proto?.id) return [];

  const timeWindowDays = Number(options.timeWindowDays || DEFAULT_TIME_WINDOW_DAYS);
  const effectiveTime = sanitizeProtoEventTime(proto.effective_time || proto.event_time || proto.created_at);
  const params = [proto.id, effectiveTime, timeWindowDays];
  const conditions = [
    'pe.id <> $1',
    `COALESCE(pe.event_time, n.published_at, pe.created_at) BETWEEN ($2::timestamptz - ($3::int * INTERVAL '1 day')) AND ($2::timestamptz + ($3::int * INTERVAL '1 day'))`
  ];

  const overlapConditions = [];
  const addParam = value => {
    params.push(value);
    return `$${params.length}`;
  };

  const entityIds = [proto.actor_entity_id, proto.object_entity_id, proto.location_id].filter(Boolean);
  if (entityIds.length > 0) {
    const param = addParam(entityIds);
    overlapConditions.push(`(
      pe.actor_entity_id = ANY(${param}::int[])
      OR pe.object_entity_id = ANY(${param}::int[])
      OR pe.location_id = ANY(${param}::int[])
    )`);
  }

  const pendingIds = [proto.actor_pending_id, proto.object_pending_id, proto.location_pending_id].filter(Boolean);
  if (pendingIds.length > 0) {
    const param = addParam(pendingIds);
    overlapConditions.push(`(
      pe.actor_pending_id = ANY(${param}::int[])
      OR pe.object_pending_id = ANY(${param}::int[])
      OR pe.location_pending_id = ANY(${param}::int[])
    )`);
  }

  if (proto.action_id) {
    overlapConditions.push(`pe.action_id = ${addParam(proto.action_id)}::int`);
  }

  if (proto.action_pending_id) {
    overlapConditions.push(`pe.action_pending_id = ${addParam(proto.action_pending_id)}::int`);
  }

  const rawActor = normalizeText(proto.actor_raw);
  const rawObject = normalizeText(proto.object_raw);
  const rawLocation = normalizeText(proto.location_raw);
  const rawAction = normalizeText(proto.action_raw);

  if (rawActor) overlapConditions.push(`LOWER(pe.actor_raw) = ${addParam(rawActor)}`);
  if (rawObject) overlapConditions.push(`LOWER(pe.object_raw) = ${addParam(rawObject)}`);
  if (rawLocation) overlapConditions.push(`LOWER(pe.location_raw) = ${addParam(rawLocation)}`);
  if (rawAction) overlapConditions.push(`LOWER(pe.action_raw) = ${addParam(rawAction)}`);

  if (overlapConditions.length === 0) {
    return [];
  }

  conditions.push(`(${overlapConditions.join(' OR ')})`);

  if (options.historyOnly) {
    conditions.push(`(
      COALESCE(pe.event_time, n.published_at, pe.created_at) < $2::timestamptz
      OR (COALESCE(pe.event_time, n.published_at, pe.created_at) = $2::timestamptz AND pe.id < $1)
    )`);
  }

  const sql = `
    SELECT
      pe.*,
      COALESCE(pe.event_time, n.published_at, pe.created_at) AS effective_time,
      n.title AS news_title,
      n.source AS news_source,
      n.published_at AS news_published_at,
      actor.canonical_name AS actor_name,
      object_entity.canonical_name AS object_name,
      location.canonical_name AS location_name,
      sa.display_name AS action_name,
      sa.action_key AS action_key
    FROM proto_events pe
    LEFT JOIN news n ON n.id = pe.news_id
    LEFT JOIN entity_mapping actor ON actor.id = pe.actor_entity_id
    LEFT JOIN entity_mapping object_entity ON object_entity.id = pe.object_entity_id
    LEFT JOIN entity_mapping location ON location.id = pe.location_id
    LEFT JOIN standard_actions sa ON sa.id = pe.action_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY COALESCE(pe.event_time, n.published_at, pe.created_at), pe.id;
  `;

  const result = await query(sql, params);
  return result.rows;
}

export async function createAtomicEventRelationship(relationship) {
  const sql = `
    INSERT INTO atomic_event_relationships (
      source_proto_event_id, target_proto_event_id, relationship_type,
      is_direct, confidence, weight, description, evidence, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (source_proto_event_id, target_proto_event_id, relationship_type)
    DO UPDATE SET
      is_direct = $4,
      confidence = GREATEST(atomic_event_relationships.confidence, $5),
      weight = GREATEST(atomic_event_relationships.weight, $6),
      description = COALESCE($7, atomic_event_relationships.description),
      evidence = COALESCE(atomic_event_relationships.evidence, '{}'::jsonb) || COALESCE($8::jsonb, '{}'::jsonb),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const result = await query(sql, [
    relationship.source_proto_event_id,
    relationship.target_proto_event_id,
    relationship.relationship_type,
    relationship.is_direct !== false,
    relationship.confidence ?? 0.8,
    relationship.weight ?? 1.0,
    relationship.description || null,
    JSON.stringify(relationship.evidence || {})
  ]);

  return result.rows[0];
}

export async function bulkCreateAtomicEventRelationships(relationships = []) {
  if (!relationships || relationships.length === 0) return [];

  const sourceIds = relationships.map(r => r.source_proto_event_id);
  const targetIds = relationships.map(r => r.target_proto_event_id);
  const types = relationships.map(r => r.relationship_type || 'related');
  const isDirect = relationships.map(r => r.is_direct !== false);
  const confidences = relationships.map(r => r.confidence ?? 0.8);
  const weights = relationships.map(r => r.weight ?? 1.0);
  const descs = relationships.map(r => r.description || null);
  const evidences = relationships.map(r => JSON.stringify(r.evidence || {}));

  const sql = `
    INSERT INTO atomic_event_relationships (
      source_proto_event_id, target_proto_event_id, relationship_type,
      is_direct, confidence, weight, description, evidence, created_at, updated_at
    )
    SELECT
      t.src, t.tgt, t.type, t.direct, t.conf, t.wt, t.desc_, t.ev,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM unnest(
      $1::int[], $2::int[], $3::text[], $4::boolean[], $5::float[], $6::float[], $7::text[], $8::jsonb[]
    ) AS t(src, tgt, type, direct, conf, wt, desc_, ev)
    ON CONFLICT (source_proto_event_id, target_proto_event_id, relationship_type)
    DO UPDATE SET
      is_direct = EXCLUDED.is_direct,
      confidence = GREATEST(atomic_event_relationships.confidence, EXCLUDED.confidence),
      weight = GREATEST(atomic_event_relationships.weight, EXCLUDED.weight),
      description = COALESCE(EXCLUDED.description, atomic_event_relationships.description),
      evidence = COALESCE(atomic_event_relationships.evidence, '{}'::jsonb) || COALESCE(EXCLUDED.evidence, '{}'::jsonb),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, source_proto_event_id, target_proto_event_id, relationship_type, confidence, weight;
  `;

  const result = await query(sql, [
    sourceIds, targetIds, types, isDirect, confidences, weights, descs, evidences
  ]);
  return result.rows;
}

export async function getAtomicRelationshipsPage(options = {}) {
  const page = Math.max(parseInt(options.page || '1', 10), 1);
  const limit = Math.max(parseInt(options.limit || '50', 10), 1);
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  const addParam = value => {
    params.push(value);
    return `$${params.length}`;
  };

  if (options.relationshipType) {
    conditions.push(`ar.relationship_type = ${addParam(options.relationshipType)}`);
  }

  if (options.protoEventId) {
    const param = addParam(Number(options.protoEventId));
    conditions.push(`(ar.source_proto_event_id = ${param} OR ar.target_proto_event_id = ${param})`);
  }

  if (options.summaryId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM relationship_summary_edges rse
      WHERE rse.atomic_relationship_id = ar.id AND rse.summary_id = ${addParam(Number(options.summaryId))}
    )`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const dataSql = `
    SELECT
      ar.*,
      sp.actor_raw AS source_actor,
      sp.action_raw AS source_action,
      sp.object_raw AS source_object,
      sp.event_time AS source_time,
      tp.actor_raw AS target_actor,
      tp.action_raw AS target_action,
      tp.object_raw AS target_object,
      tp.event_time AS target_time
    FROM atomic_event_relationships ar
    JOIN proto_events sp ON sp.id = ar.source_proto_event_id
    JOIN proto_events tp ON tp.id = ar.target_proto_event_id
    ${whereClause}
    ORDER BY ar.updated_at DESC, ar.id DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  const countParams = params.slice(0, params.length - 2);
  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM atomic_event_relationships ar
    ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    query(dataSql, params),
    query(countSql, countParams)
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.total || 0)
  };
}

function normalizeText(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  return cleaned || null;
}
