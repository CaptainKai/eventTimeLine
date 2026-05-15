import {
  buildActionSignatureFromProto,
  buildLocationKeyFromProto,
  buildTimeBucket,
  collectProtoEntityKeys
} from '../db/relationship-summary-queries.mjs';

const DEFAULT_ENTITY_OVERLAP_THRESHOLD = 0.5;

export class BatchEventClusterer {
  constructor(options = {}) {
    this.entityOverlapThreshold = Number(options.entityOverlapThreshold || DEFAULT_ENTITY_OVERLAP_THRESHOLD);
  }

  clusterProtoEvents(protoEvents = []) {
    const clusters = [];
    const sorted = [...(protoEvents || [])]
      .filter(proto => proto?.id)
      .sort(compareProtoByBatchTime);

    for (const proto of sorted) {
      const signature = buildProtoClusterSignature(proto);
      let bestCluster = null;
      let bestScore = 0;

      for (const cluster of clusters) {
        const score = scoreClusterMatch(cluster, signature, this.entityOverlapThreshold);
        if (score > bestScore) {
          bestScore = score;
          bestCluster = cluster;
        }
      }

      if (bestCluster) {
        addProtoToCluster(bestCluster, proto, signature);
      } else {
        clusters.push(createCluster(clusters.length + 1, proto, signature));
      }
    }

    return clusters.map(finalizeCluster);
  }
}

export function buildProtoClusterSignature(proto) {
  const effectiveTime = getBatchProtoSortTime(proto);
  const timeBucket = buildTimeBucket(effectiveTime);
  const keyEntities = collectProtoEntityKeys(proto).sort();
  const actionSignature = buildActionSignatureFromProto(proto);
  const locationKey = buildLocationKeyFromProto(proto);
  return {
    proto_id: proto?.id,
    effective_time: effectiveTime,
    time_bucket: timeBucket,
    key_entities: keyEntities,
    entity_set: new Set(keyEntities),
    action_signature: actionSignature,
    location_key: locationKey,
    cluster_key: buildClusterKey({ timeBucket, keyEntities, actionSignature, locationKey })
  };
}

export function getBatchProtoSortTime(proto) {
  const value = proto?.event_time || proto?.news_published_at || proto?.created_at || proto?.effective_time || new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function buildClusterKey({ timeBucket, keyEntities = [], actionSignature = null, locationKey = null }) {
  const entityPart = [...keyEntities].sort().join(',') || 'none';
  return [
    `bucket:${timeBucket || 'none'}`,
    `entities:${entityPart}`,
    `action:${actionSignature || 'none'}`,
    `location:${locationKey || 'none'}`
  ].join('|');
}

function createCluster(index, proto, signature) {
  const cluster = {
    id: `batch_cluster:${index}`,
    proto_events: [],
    proto_event_ids: [],
    time_bucket: signature.time_bucket,
    key_entity_set: new Set(),
    action_counts: new Map(),
    location_counts: new Map(),
    sort_time: signature.effective_time,
    time_start: signature.effective_time,
    time_end: signature.effective_time,
    representative_proto: proto
  };
  addProtoToCluster(cluster, proto, signature);
  return cluster;
}

function addProtoToCluster(cluster, proto, signature) {
  cluster.proto_events.push(proto);
  cluster.proto_event_ids.push(Number(proto.id));
  for (const key of signature.key_entities) cluster.key_entity_set.add(key);
  if (signature.action_signature) incrementMap(cluster.action_counts, signature.action_signature);
  if (signature.location_key) incrementMap(cluster.location_counts, signature.location_key);
  cluster.sort_time = minIsoTime(cluster.sort_time, signature.effective_time);
  cluster.time_start = minIsoTime(cluster.time_start, signature.effective_time);
  cluster.time_end = maxIsoTime(cluster.time_end, signature.effective_time);
  if (!cluster.representative_proto) cluster.representative_proto = proto;
}

function finalizeCluster(cluster) {
  const keyEntities = [...cluster.key_entity_set].sort();
  const actionSignature = mostCommonValue(cluster.action_counts);
  const locationKey = mostCommonValue(cluster.location_counts);
  return {
    id: cluster.id,
    proto_events: cluster.proto_events,
    proto_event_ids: cluster.proto_event_ids,
    size: cluster.proto_events.length,
    time_bucket: cluster.time_bucket,
    key_entities: keyEntities,
    action_signature: actionSignature,
    location_key: locationKey,
    sort_time: cluster.sort_time,
    time_start: cluster.time_start,
    time_end: cluster.time_end,
    representative_proto: cluster.representative_proto,
    cluster_key: buildClusterKey({
      timeBucket: cluster.time_bucket,
      keyEntities,
      actionSignature,
      locationKey
    })
  };
}

function scoreClusterMatch(cluster, signature, entityOverlapThreshold) {
  if (cluster.time_bucket !== signature.time_bucket) return 0;
  const entityScore = entityOverlapScore(cluster.key_entity_set, signature.entity_set);
  if (entityScore < entityOverlapThreshold) return 0;
  if (!isActionCompatible(cluster.action_counts, signature.action_signature)) return 0;
  if (!isLocationCompatible(cluster.location_counts, signature.location_key)) return 0;
  const actionScore = signature.action_signature && cluster.action_counts.has(signature.action_signature) ? 1 : 0.25;
  const locationScore = signature.location_key && cluster.location_counts.has(signature.location_key) ? 1 : 0.25;
  return entityScore * 4 + actionScore + locationScore;
}

function entityOverlapScore(leftSet, rightSet) {
  if (!leftSet?.size || !rightSet?.size) return 0;
  let shared = 0;
  for (const value of rightSet) {
    if (leftSet.has(value)) shared += 1;
  }
  return shared / Math.min(leftSet.size, rightSet.size);
}

function isActionCompatible(actionCounts, actionSignature) {
  if (!actionCounts.size || !actionSignature) return true;
  return actionCounts.has(actionSignature);
}

function isLocationCompatible(locationCounts, locationKey) {
  if (!locationCounts.size || !locationKey) return true;
  return locationCounts.has(locationKey);
}

function incrementMap(map, value) {
  map.set(value, (map.get(value) || 0) + 1);
}

function mostCommonValue(map) {
  let best = null;
  let bestCount = -1;
  for (const [value, count] of map.entries()) {
    if (count > bestCount || (count === bestCount && String(value) < String(best))) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function compareProtoByBatchTime(left, right) {
  const timeDiff = new Date(getBatchProtoSortTime(left)).getTime() - new Date(getBatchProtoSortTime(right)).getTime();
  if (timeDiff !== 0) return timeDiff;
  return Number(left?.id || 0) - Number(right?.id || 0);
}

function minIsoTime(left, right) {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

function maxIsoTime(left, right) {
  if (!left) return right;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

export const batchEventClusterer = new BatchEventClusterer();
