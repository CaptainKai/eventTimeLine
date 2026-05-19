import {
  saveAtomicProtoEvent,
  getProtoEventForAtomicGraph,
  bulkCreateAtomicEventRelationships
} from '../db/atomic-relationship-queries.mjs';
import {
  findMatchingRelationshipSummaries,
  upsertRelationshipSummary,
  linkProtoEventToSummary,
  enqueueRelationshipSummaryJob,
  completeRelationshipSummaryJob,
  completeSummaryJobAndRefreshStats,
  failRelationshipSummaryJob,
  markRelationshipSummaryDetailRunning,
  markRelationshipSummaryDetailCompleted,
  getSummaryMemberProtoEvents,
  linkAtomicRelationshipToSummary,
  bulkLinkAtomicRelationshipsToSummary,
  refreshRelationshipSummaryStats,
  buildActionSignatureFromProto,
  buildLocationKeyFromProto,
  collectProtoEntityKeys,
  buildTimeBucket,
  chooseCanonicalSummary,
  mergeRelationshipSummaries
} from '../db/relationship-summary-queries.mjs';
import { atomicRelationshipAnalyzer } from './atomic-relationship-analyzer.mjs';
import { batchEventClusterer, getBatchProtoSortTime } from './batch-event-clusterer.mjs';

const DEFAULT_TIME_WINDOW_DAYS = 30;
const RULE_VERSION = 'atomic-summary-first-v2';
const MAX_REBUILD_MEMBERS = 1000; // 超过此数量将触发聚类采样

export class RelationshipSummaryManager {
  constructor(options = {}) {
    this.timeWindowDays = Number(options.timeWindowDays || DEFAULT_TIME_WINDOW_DAYS);
    this.analyzer = options.analyzer || atomicRelationshipAnalyzer;
    this.clusterer = options.clusterer || batchEventClusterer;
    this.memberCache = new Map(); // 内存缓存：summaryId -> members[]
  }

  async ingestProtoEvent(proto, newsId, options = {}) {
    const protoId = await saveAtomicProtoEvent(proto, newsId, options);

    if (options.asyncAssignment === true) {
      return {
        proto_id: protoId,
        affected_proto_events: [protoId],
        relationship_count: 0,
        detail_status: 'pending',
        detail_job_ids: [],
        merge_job_ids: [],
        summary_ids: [],
        candidate_count: 0,
        batch_assignment_status: 'pending',
        status: 'success'
      };
    }

    const savedProto = await getProtoEventForAtomicGraph(protoId);
    const assignment = await this.assignProtoEventToSummaries(savedProto, {
      ...options,
      enqueueDetail: options.enqueueDetail !== false,
      detailMode: options.detailMode || 'incremental',
      changedProtoEventId: protoId,
      historyOnly: false
    });

    return {
      proto_id: protoId,
      affected_proto_events: [protoId],
      relationship_count: 0,
      detail_status: assignment.detail_status,
      detail_job_ids: assignment.detail_job_ids,
      merge_job_ids: assignment.merge_job_ids || [],
      summary_ids: assignment.summary_ids,
      candidate_count: assignment.candidate_count,
      batch_assignment_status: 'completed',
      status: 'success'
    };
  }

  async processExistingProtoEvent(proto, options = {}) {
    return this.assignProtoEventToSummaries(proto, {
      ...options,
      enqueueDetail: options.enqueueDetail === true,
      enqueueMerge: options.enqueueMerge !== false,
      detailMode: options.detailMode || 'incremental',
      changedProtoEventId: options.changedProtoEventId || proto?.id
    });
  }

  async processProtoEventBatch(protoEvents = [], options = {}) {
    const protos = [...(protoEvents || [])]
      .filter(proto => proto?.id)
      .sort((left, right) => {
        const diff = new Date(getBatchProtoSortTime(left)).getTime() - new Date(getBatchProtoSortTime(right)).getTime();
        return diff !== 0 ? diff : Number(left.id || 0) - Number(right.id || 0);
      });

    const clusters = this.clusterer.clusterProtoEvents(protos);
    const stats = {
      processed_proto_count: 0,
      skipped_count: 0,
      cluster_count: clusters.length,
      multi_member_cluster_count: clusters.filter(cluster => cluster.size > 1).length,
      candidate_count_total: 0,
      summary_ids: [],
      detail_job_ids: [],
      merge_job_ids: [],
      planned_new_summary_count: 0,
      cluster_stats: clusters.map(cluster => ({
        cluster_key: cluster.cluster_key,
        size: cluster.size,
        time_bucket: cluster.time_bucket
      }))
    };

    const summaryIds = new Set();
    const detailJobIds = new Set();
    const mergeJobIds = new Set();

    for (const cluster of clusters) {
      try {
        const result = await this.processProtoEventCluster(cluster, options);
        stats.processed_proto_count += Number(result.processed_proto_count || 0);
        stats.skipped_count += Number(result.skipped_count || 0);
        stats.candidate_count_total += Number(result.candidate_count_total || 0);
        stats.planned_new_summary_count += Number(result.planned_new_summary_count || 0);
        for (const id of result.summary_ids || []) summaryIds.add(id);
        for (const id of result.detail_job_ids || []) detailJobIds.add(id);
        for (const id of result.merge_job_ids || []) mergeJobIds.add(id);
      } catch (error) {
        stats.skipped_count += cluster.proto_events.length;
        if (options.logErrors !== false) {
          console.warn(`[AtomicBatch] Skipped cluster ${cluster.cluster_key}: ${error.message}`);
        }
      }
    }

    stats.summary_ids = [...summaryIds];
    stats.detail_job_ids = [...detailJobIds];
    stats.merge_job_ids = [...mergeJobIds];
    stats.average_candidate_count = stats.processed_proto_count > 0
      ? Number((stats.candidate_count_total / stats.processed_proto_count).toFixed(2))
      : 0;
    return stats;
  }

  async processProtoEventCluster(cluster, options = {}) {
    const clusterProbe = this.buildClusterProbeProto(cluster);
    const matches = options.dryRun && options.skipSummaryLookup
      ? []
      : await findMatchingRelationshipSummaries(clusterProbe, {
        timeWindowDays: options.timeWindowDays || this.timeWindowDays,
        timeBucket: cluster.time_bucket,
        includeIsolated: true
      });

    const stats = {
      processed_proto_count: 0,
      skipped_count: 0,
      candidate_count_total: 0,
      planned_new_summary_count: 0,
      summary_ids: [],
      detail_job_ids: [],
      merge_job_ids: []
    };
    const summaryIds = new Set();
    const detailJobIds = new Set();
    const mergeJobIds = new Set();

    if (options.dryRun) {
      stats.processed_proto_count = cluster.proto_events.length;
      stats.candidate_count_total = matches.length * cluster.proto_events.length;
      stats.planned_new_summary_count = matches.length > 0 ? 0 : 1;
      stats.summary_ids = matches.map(summary => summary.id);
      return stats;
    }

    if (matches.length === 0 && cluster.proto_events.length > 1) {
      const summary = await this.createRelationshipSummaryForCluster(cluster);
      summaryIds.add(summary.id);
      for (const proto of cluster.proto_events) {
        await linkProtoEventToSummary(summary.id, proto.id);
        stats.processed_proto_count += 1;
      }
      await refreshRelationshipSummaryStats(summary.id);
      if (options.enqueueDetail !== false) {
        const job = await this.enqueueSummaryDetailJob(summary.id, {
          mode: 'full',
          priority: options.priority ?? 5,
          maxAttempts: options.maxAttempts || 3
        });
        if (job?.id) detailJobIds.add(job.id);
      }
    } else {
      for (const proto of cluster.proto_events) {
        try {
          const result = await this.assignProtoEventToSummaries(proto, {
            ...options,
            precomputedMatches: matches,
            enqueueDetail: matches.length > 0 ? options.enqueueDetail : options.enqueueDetail,
            detailMode: options.detailMode || 'incremental',
            changedProtoEventId: options.changedProtoEventId || proto.id
          });
          stats.processed_proto_count += 1;
          stats.candidate_count_total += Number(result.candidate_count || 0);
          if (result.planned_summary_key) stats.planned_new_summary_count += 1;
          for (const id of result.summary_ids || []) summaryIds.add(id);
          for (const id of result.detail_job_ids || []) detailJobIds.add(id);
          for (const id of result.merge_job_ids || []) mergeJobIds.add(id);
        } catch (error) {
          stats.skipped_count += 1;
          if (options.logErrors !== false) {
            console.warn(`[AtomicBatch] Skipped proto_event ${proto.id}: ${error.message}`);
          }
        }
      }
    }

    stats.candidate_count_total += matches.length > 0 && cluster.proto_events.length > 1
      ? Math.max(0, matches.length * cluster.proto_events.length - stats.candidate_count_total)
      : 0;
    stats.summary_ids = [...summaryIds];
    stats.detail_job_ids = [...detailJobIds];
    stats.merge_job_ids = [...mergeJobIds];
    return stats;
  }

  async assignProtoEventToSummaries(proto, options = {}) {
    if (!proto?.id) {
      throw new Error('assignProtoEventToSummaries requires a persisted proto event with id');
    }

    const effectiveTime = getProtoEffectiveTime(proto);
    const timeBucket = options.timeBucket || buildTimeBucket(effectiveTime);

    if (options.dryRun && options.skipSummaryLookup) {
      const plannedSummary = this.buildAssignmentSummaryPayload(proto, {
        summaryKind: 'isolated',
        relationshipType: 'isolated',
        timeBucket
      });
      return {
        proto_id: proto.id,
        summary_ids: [],
        detail_job_ids: [],
        detail_status: 'pending',
        relationship_count: 0,
        candidate_count: 0,
        dry_run: true,
        planned_summary_key: plannedSummary.summary_key
      };
    }

    const matches = Array.isArray(options.precomputedMatches)
      ? options.precomputedMatches
      : await findMatchingRelationshipSummaries(proto, {
        timeWindowDays: options.timeWindowDays || this.timeWindowDays,
        timeBucket,
        includeIsolated: true
      });

    if (options.dryRun) {
      const plannedSummary = matches.length > 0
        ? null
        : this.buildAssignmentSummaryPayload(proto, { summaryKind: 'isolated', relationshipType: 'isolated' });
      return {
        proto_id: proto.id,
        summary_ids: matches.map(item => item.id),
        detail_job_ids: [],
        detail_status: matches.length > 0 && (options.enqueueDetail !== false || options.enqueueMerge !== false) ? 'pending' : 'completed',
        relationship_count: 0,
        candidate_count: matches.length,
        dry_run: true,
        planned_summary_key: plannedSummary?.summary_key || null
      };
    }

    const summaryRows = matches.length > 0
      ? await this.attachProtoToExistingSummaries(proto, matches, options)
      : [await this.createIsolatedSummaryForProto(proto, options)];

    const detailJobs = [];
    const mergeJobs = [];

    if (options.syncRebuild === true) {
      // 同步增量模式：新事件只与已有成员比较 O(N)，不全量重算
      for (const summary of summaryRows) {
        await this.rebuildSummaryInternalRelationships(summary.id, {
          mode: 'incremental',
          changedProtoEventId: proto.id  // 关键：告知只需处理这个新事件
        });
      }
    } else if (options.enqueueDetail !== false) {
      for (const summary of summaryRows) {
        const job = await this.enqueueSummaryDetailJob(summary.id, {
          mode: options.detailMode || 'incremental',
          changedProtoEventId: options.changedProtoEventId || proto.id,
          priority: options.priority ?? 10,
          maxAttempts: options.maxAttempts || 3
        });
        if (job?.id) detailJobs.push(job);
      }
    }

    return {
      proto_id: proto.id,
      summary_ids: summaryRows.map(summary => summary.id),
      detail_job_ids: detailJobs.map(job => job.id),
      merge_job_ids: mergeJobs.map(job => job.id),
      detail_status: detailJobs.length > 0 ? 'pending' : 'completed',
      relationship_count: 0,
      candidate_count: matches.length
    };
  }

  async attachProtoToExistingSummaries(proto, matches, options = {}) {
    const attached = [];
    for (const summary of matches) {
      const promotedKind = summary.summary_kind === 'isolated' ? 'relationship' : (summary.summary_kind || 'relationship');
      const relationshipType = summary.relationship_type === 'isolated' ? 'related' : summary.relationship_type;
      const payload = this.buildAssignmentSummaryPayload(proto, {
        summaryKind: promotedKind,
        relationshipType,
        summaryKey: summary.summary_key,
        existingSummary: summary
      });
      const refreshed = await upsertRelationshipSummary(payload);
      await linkProtoEventToSummary(refreshed.id, proto.id);
      
      // 性能优化：在同步重建/回填模式下跳过实时统计刷新，后续统一处理
      if (!options.skipRefreshStats && options.syncRebuild !== true) {
        await refreshRelationshipSummaryStats(refreshed.id);
      }
      
      // 同步更新内存缓存
      if (this.memberCache.has(refreshed.id)) {
        const cached = this.memberCache.get(refreshed.id);
        if (!cached.find(m => m.id === proto.id)) {
          cached.push(proto);
          // 重新排序确保时间序
          cached.sort((a, b) => new Date(a.effective_time).getTime() - new Date(b.effective_time).getTime());
        }
      }

      attached.push(refreshed);
    }
    return attached;
  }

  async createIsolatedSummaryForProto(proto, options = {}) {
    const timeBucket = buildTimeBucket(getProtoEffectiveTime(proto));
    const payload = this.buildAssignmentSummaryPayload(proto, {
      summaryKind: 'isolated',
      relationshipType: 'isolated',
      timeBucket
    });
    const summary = await upsertRelationshipSummary(payload);
    await linkProtoEventToSummary(summary.id, proto.id);
    
    if (options.syncRebuild !== true) {
      await refreshRelationshipSummaryStats(summary.id);
    }
    return summary;
  }

  async enqueueSummaryDetailJob(summaryId, options = {}) {
    const mode = options.mode || 'full';
    const changedProtoEventId = options.changedProtoEventId || options.changed_proto_event_id || null;
    const jobType = mode === 'incremental' && changedProtoEventId
      ? `detail_incremental:${changedProtoEventId}`
      : 'detail_rebuild';

    return enqueueRelationshipSummaryJob(summaryId, {
      jobType,
      priority: options.priority ?? (mode === 'incremental' ? 10 : 0),
      maxAttempts: options.maxAttempts || 3,
      runAfter: options.runAfter || null,
      payload: {
        mode,
        changed_proto_event_id: changedProtoEventId,
        rule_version: RULE_VERSION,
        requested_at: new Date().toISOString()
      }
    });
  }


  async enqueueSummaryMergeJob(summaries, options = {}) {
    const summaryIds = [...new Set((summaries || []).map(summary => Number(summary?.id || summary)).filter(Number.isInteger))];
    if (summaryIds.length < 2) return null;
    const canonicalSummaryId = this.chooseCanonicalSummaryId(summaries);
    return enqueueRelationshipSummaryJob(canonicalSummaryId, {
      jobType: 'summary_merge',
      priority: options.priority ?? 20,
      maxAttempts: options.maxAttempts || 3,
      runAfter: options.runAfter || null,
      payload: {
        mode: 'merge',
        summary_ids: summaryIds,
        bridge_proto_event_id: options.bridgeProtoEventId || null,
        rule_version: 'atomic-summary-merge-v1',
        requested_at: new Date().toISOString()
      }
    });
  }

  chooseCanonicalSummaryId(summaries = []) {
    const canonical = chooseCanonicalSummary(summaries);
    return canonical?.id || Number(summaries[0]?.id || summaries[0]);
  }

  async processSummaryDetailJob(job) {
    return this.processSummaryJob(job);
  }

  async processSummaryJob(job) {
    console.log(`[AtomicGraph] processSummaryJob job=${job.id} summary=${job.summary_id} type=${job.job_type}`);
    if (!job?.id || !job.summary_id) {
      throw new Error('processSummaryJob requires a job row with id and summary_id');
    }

    const payload = parseJobPayload(job.payload);
    try {
      if (job.job_type === 'summary_merge') {
        const result = await this.processSummaryMergeJob(job, payload);
        await completeRelationshipSummaryJob(job.id, result);
        return result;
      }

      await markRelationshipSummaryDetailRunning(job.summary_id);
      const result = await this.rebuildSummaryInternalRelationships(job.summary_id, {
        mode: payload.mode || inferModeFromJobType(job.job_type),
        changedProtoEventId: payload.changed_proto_event_id || payload.changedProtoEventId || null
      });
      // 3 DB calls → 1 CTE: complete job + update summary status + refresh stats
      const stats = await completeSummaryJobAndRefreshStats(job.id, job.summary_id, result);
      return { ...result, edge_count: stats?.edge_count, avg_confidence: stats?.avg_confidence };
    } catch (error) {
      await failRelationshipSummaryJob(job, error);
      throw error;
    }
  }

  async processSummaryMergeJob(job, payload = {}) {
    console.log(`[AtomicGraph] processSummaryMergeJob skipped to prevent mega-summaries. JobId=${job.id}`);
    return {
      merged: false,
      canonical_summary_id: job.summary_id,
      merged_summary_ids: [],
      message: 'Physical merge is disabled to prevent mega-summaries. Bridging is used instead.'
    };
  }

  buildDetailPairs(members, options = {}) {
    const mode = options.mode || 'full';
    const changedId = Number(options.changedProtoEventId || options.changed_proto_event_id || 0);

    if (mode === 'incremental' && changedId) {
      const changed = members.find(m => Number(m.id) === changedId);
      if (!changed) return [];

      const changedTime = new Date(changed.effective_time).getTime();
      const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

      return members
        .filter(m => {
          if (Number(m.id) === changedId) return false;
          const diff = changedTime - new Date(m.effective_time).getTime();
          return diff <= WINDOW_MS;
        })
        .map(m => [m, changed]);
    }

    const WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
    const pairs = [];
    for (let i = 0; i < members.length; i++) {
      const earlier = members[i];
      const earlierTime = new Date(earlier.effective_time).getTime();
      for (let j = i + 1; j < members.length; j++) {
        const later = members[j];
        const laterTime = new Date(later.effective_time).getTime();
        if (laterTime - earlierTime > WINDOW_MS) {
          continue;
        }
        pairs.push([earlier, later]);
      }
    }
    return pairs;
  }

  async rebuildSummaryInternalRelationships(summaryId, options = {}) {
    const t0 = Date.now();
    
    // 性能优化：优先从内存缓存获取成员，避免 DB 往返
    let members = this.memberCache.get(summaryId);
    if (!members) {
      members = (await getSummaryMemberProtoEvents([summaryId]))
        .sort((a, b) => new Date(a.effective_time).getTime() - new Date(b.effective_time).getTime());
      this.memberCache.set(summaryId, members);
      
      // 限制缓存大小，防止 OOM (保持最近 500 个活跃 Summary)
      if (this.memberCache.size > 500) {
        const firstKey = this.memberCache.keys().next().value;
        this.memberCache.delete(firstKey);
      }
    }
    
    const t1 = Date.now();
    if (members.length < 2) {
      const summary = await refreshRelationshipSummaryStats(summaryId);
      console.log(`[AtomicGraph] rebuild ${summaryId} members=${members.length} <2 skip t=${Date.now() - t0}ms`);
      return {
        summary_id: summaryId,
        member_count: members.length,
        compared_pair_count: 0,
        relationship_count: 0,
        edge_count: Number(summary?.edge_count || 0)
      };
    }

    const PAIR_CHUNK = 200;
    const seen = new Set();
    let totalPairCount = 0;
    let totalRelationshipCount = 0;
    const mode = options.mode || 'full';
    const changedId = Number(options.changedProtoEventId || options.changed_proto_event_id || 0);

    // 处理超大 Summary：通过聚类采样减少计算量
    let processingMembers = members;
    if (mode === 'full' && members.length > MAX_REBUILD_MEMBERS) {
      console.log(`[AtomicGraph] summary ${summaryId} size ${members.length} exceeds limit, clustering for sampling...`);
      const clusters = this.clusterer.clusterProtoEvents(members);
      // 从每个聚类中选取代表性节点
      processingMembers = clusters.map(c => c.representative_proto || c.proto_events[0]).filter(Boolean);
      console.log(`[AtomicGraph] summary ${summaryId} sampled down from ${members.length} to ${processingMembers.length} nodes`);
    }

    console.log(`[AtomicGraph] rebuild ${summaryId} processing_nodes=${processingMembers.length} mode=${mode} t=${t1 - t0}ms`);

    const processPairChunk = async (chunk) => {
      const batchRels = [];
      for (const [source, target] of chunk) {
        // 极致优化：内存预筛选 (Pre-filtering)
        // 如果两个事件的实体 ID 完全不重叠，且没有 common context，直接跳过昂贵的详细分析
        const hasEntityOverlap = 
          (source.actor_entity_id && (source.actor_entity_id === target.actor_entity_id || source.actor_entity_id === target.object_entity_id)) ||
          (source.object_entity_id && (source.object_entity_id === target.actor_entity_id || source.object_entity_id === target.object_entity_id)) ||
          (source.location_id && source.location_id === target.location_id);

        // 如果连基本的实体 ID 都不重叠，且不是同一个 news_id，则大概率没关系
        if (!hasEntityOverlap && source.news_id !== target.news_id) {
          continue; 
        }

        for (const rel of this.analyzer.analyzeProtoRelationship(source, target)) {
          const key = `${rel.source_proto_event_id}:${rel.target_proto_event_id}:${rel.relationship_type}`;
          if (seen.has(key)) continue;
          seen.add(key);
          batchRels.push(rel);
        }
      }
      if (batchRels.length > 0) {
        const saved = await bulkCreateAtomicEventRelationships(batchRels);
        await bulkLinkAtomicRelationshipsToSummary(summaryId, saved.map(r => r.id));
        totalRelationshipCount += saved.length;
      }
    };

    // 配对生成
    const pairs = this.buildDetailPairs(processingMembers, {
      mode,
      changedProtoEventId: changedId
    });

    totalPairCount = pairs.length;
    for (let i = 0; i < pairs.length; i += PAIR_CHUNK) {
      await processPairChunk(pairs.slice(i, i + PAIR_CHUNK));
    }

    const totalMs = Date.now() - t0;
    console.log(`[AtomicGraph] rebuild ${summaryId} done processing_nodes=${processingMembers.length} pairs=${totalPairCount} rels=${totalRelationshipCount} t=${totalMs}ms`);
    return {
      summary_id: summaryId,
      member_count: members.length,
      processing_node_count: processingMembers.length,
      compared_pair_count: totalPairCount,
      relationship_count: totalRelationshipCount
    };
  }


  buildAssignmentSummaryPayload(proto, options = {}) {
    const summaryKind = options.summaryKind || options.summary_kind || 'relationship';
    const relationshipType = options.relationshipType || options.relationship_type || (summaryKind === 'isolated' ? 'isolated' : 'related');
    const effectiveTime = getProtoEffectiveTime(proto);
    const timeBucket = options.timeBucket || buildTimeBucket(effectiveTime);
    const keyEntities = (options.keyEntities || collectProtoEntityKeys(proto)).sort();
    const actionSignature = options.actionSignature ?? buildActionSignatureFromProto(proto);
    const locationKey = options.locationKey ?? buildLocationKeyFromProto(proto);
    const summaryKey = options.summaryKey || this.buildAssignmentSummaryKey(proto, {
      summaryKind,
      relationshipType,
      timeBucket,
      keyEntities,
      actionSignature,
      locationKey
    });
    const title = this.buildSummaryTitle(proto, { summaryKind, relationshipType, existingSummary: options.existingSummary });

    return {
      summary_key: summaryKey,
      title,
      description: this.buildSummaryDescription(proto, { summaryKind, relationshipType }),
      relationship_type: relationshipType,
      summary_kind: summaryKind,
      key_entities: keyEntities,
      action_signature: actionSignature,
      location_key: locationKey,
      time_start: effectiveTime,
      time_end: effectiveTime,
      time_bucket: timeBucket,
      detail_status: options.detailStatus || 'pending',
      generated_by: 'rule',
      metadata: {
        rule_version: RULE_VERSION,
        assignment_strategy: 'summary_first',
        source_proto_event_id: proto.id,
        summary_kind: summaryKind,
        relationship_type: relationshipType,
        time_bucket: timeBucket
      }
    };
  }

  buildAssignmentSummaryKey(proto, options = {}) {
    const summaryKind = options.summaryKind || options.summary_kind || 'relationship';
    const relationshipType = options.relationshipType || options.relationship_type || (summaryKind === 'isolated' ? 'isolated' : 'related');
    const timeBucket = options.timeBucket || buildTimeBucket(getProtoEffectiveTime(proto));
    const keyEntities = options.keyEntities || collectProtoEntityKeys(proto).sort();
    const actionSignature = options.actionSignature ?? buildActionSignatureFromProto(proto);
    const locationKey = options.locationKey ?? buildLocationKeyFromProto(proto);
    const entityPart = keyEntities.length > 0 ? keyEntities.map(normalizeKeyPart).join(',') : 'none';
    const actionPart = normalizeKeyPart(actionSignature || 'none');
    const locationPart = normalizeKeyPart(locationKey || 'none');
    const base = `kind:${summaryKind}|type:${relationshipType}|entities:${entityPart}|action:${actionPart}|location:${locationPart}|bucket:${timeBucket}`;
    return summaryKind === 'isolated' ? `${base}|proto:${proto.id}` : base;
  }

  buildClusterProbeProto(cluster) {
    const representative = cluster.representative_proto || cluster.proto_events?.[0] || {};
    return {
      ...representative,
      id: representative.id || cluster.proto_event_ids?.[0],
      event_time: cluster.time_start || representative.event_time,
      effective_time: cluster.time_start || representative.effective_time,
      time_bucket: cluster.time_bucket,
      key_entities: cluster.key_entities || [],
      action_signature: cluster.action_signature || null,
      location_key: cluster.location_key || null
    };
  }

  async createRelationshipSummaryForCluster(cluster) {
    const representative = cluster.representative_proto || cluster.proto_events?.[0];
    const payload = this.buildAssignmentSummaryPayload(this.buildClusterProbeProto(cluster), {
      summaryKind: 'relationship',
      relationshipType: 'related',
      timeBucket: cluster.time_bucket,
      keyEntities: cluster.key_entities || [],
      actionSignature: cluster.action_signature || null,
      locationKey: cluster.location_key || null,
      detailStatus: 'pending'
    });
    payload.title = this.buildClusterSummaryTitle(cluster, representative);
    payload.description = `Rule-assigned batch cluster summary with ${cluster.size} proto events.`;
    payload.time_start = cluster.time_start;
    payload.time_end = cluster.time_end;
    payload.metadata = {
      ...(payload.metadata || {}),
      assignment_strategy: 'batch_cluster_prefilter',
      batch_cluster_key: cluster.cluster_key,
      batch_cluster_size: cluster.size,
      source_proto_event_ids: cluster.proto_event_ids || []
    };
    return upsertRelationshipSummary(payload);
  }

  buildClusterSummaryTitle(cluster, representative) {
    const action = representative?.action_name || representative?.action_key || representative?.action_raw || cluster.action_signature || 'events';
    const entities = [
      representative?.actor_name || representative?.actor_raw,
      representative?.object_name || representative?.object_raw
    ].filter(Boolean).join(' / ');
    const location = representative?.location_name || representative?.location_raw || cluster.location_key;
    return ['Related', action, entities, location ? `@ ${location}` : null].filter(Boolean).join(' ');
  }

  buildSummaryPayload(relationship, sourceProto, targetProto) {
    const relationshipType = relationship?.relationship_type || 'related';
    const times = [getProtoEffectiveTime(sourceProto), getProtoEffectiveTime(targetProto)].sort();
    const keyEntities = [...new Set([
      ...collectProtoEntityKeys(sourceProto),
      ...collectProtoEntityKeys(targetProto)
    ])].sort();
    const actionSignature = [
      buildActionSignatureFromProto(sourceProto),
      buildActionSignatureFromProto(targetProto)
    ].filter(Boolean).sort().join('+') || null;
    const locationKey = [
      buildLocationKeyFromProto(sourceProto),
      buildLocationKeyFromProto(targetProto)
    ].filter(Boolean).sort()[0] || null;
    const timeBucket = buildTimeBucket(times[0]);
    const summaryKey = `type:${relationshipType}|entities:${keyEntities.map(normalizeKeyPart).join(',') || 'none'}|action:${normalizeKeyPart(actionSignature || 'none')}|location:${normalizeKeyPart(locationKey || 'none')}|bucket:${timeBucket}`;

    return {
      summary_key: summaryKey,
      title: `${relationshipType}: ${this.describeProto(sourceProto)} / ${this.describeProto(targetProto)}`,
      description: relationship?.description || `Rule-generated ${relationshipType} summary`,
      relationship_type: relationshipType,
      summary_kind: 'relationship',
      key_entities: keyEntities,
      action_signature: actionSignature,
      location_key: locationKey,
      time_start: times[0],
      time_end: times[times.length - 1],
      time_bucket: timeBucket,
      generated_by: 'rule',
      metadata: {
        rule_version: RULE_VERSION,
        source_proto_event_id: sourceProto?.id || null,
        target_proto_event_id: targetProto?.id || null,
        relationship_confidence: relationship?.confidence ?? null
      }
    };
  }

  buildSummaryTitle(proto, options = {}) {
    if (options.existingSummary?.summary_kind !== 'isolated' && options.existingSummary?.title) {
      return options.existingSummary.title;
    }

    const action = proto.action_name || proto.action_key || proto.action_raw || 'event';
    const entities = [
      proto.actor_name || proto.actor_raw,
      proto.object_name || proto.object_raw
    ].filter(Boolean).join(' / ');
    const location = proto.location_name || proto.location_raw;
    const prefix = options.summaryKind === 'isolated' ? 'Isolated' : 'Related';
    return [prefix, action, entities, location ? `@ ${location}` : null].filter(Boolean).join(' ');
  }

  buildSummaryDescription(proto, options = {}) {
    const kind = options.summaryKind === 'isolated' ? 'single isolated proto event' : 'summary-first relationship cluster';
    return `Rule-assigned ${kind} around ${this.describeProto(proto)}.`;
  }

  describeProto(proto) {
    return [
      proto?.actor_name || proto?.actor_raw,
      proto?.action_name || proto?.action_key || proto?.action_raw,
      proto?.object_name || proto?.object_raw
    ].filter(Boolean).join(' ') || `proto_event:${proto?.id || 'unknown'}`;
  }
}

function parseJobPayload(payload) {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return payload;
}

function inferModeFromJobType(jobType) {
  return String(jobType || '').startsWith('detail_incremental:') ? 'incremental' : 'full';
}

function getProtoEffectiveTime(proto) {
  const value = proto?.effective_time || proto?.event_time || proto?.created_at || proto?.news_published_at || new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}


function normalizeKeyPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[|]/g, '_');
}

export const relationshipSummaryManager = new RelationshipSummaryManager();
