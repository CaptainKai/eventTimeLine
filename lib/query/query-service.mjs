import { keywordSemanticFallback, semanticVectorSearch } from '../db/semantic-search-queries.mjs';
import { requestEmbedding } from '../search/embedding-service.mjs';
import { getNewsById, getNewsProtoEvents, searchNews } from '../db/news-queries.mjs';
import { getRelationshipSummaryGraph, getRelationshipSummariesPage } from '../db/relationship-summary-queries.mjs';
import { listAdsTopicTrends, recordAuthorityAudit } from '../db/authority-queries.mjs';
import { resolveAuthority } from '../data/authority.mjs';

function withTimeout(promise, timeoutMs) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Query timeout'), { code: 'QUERY_TIMEOUT' })), timeoutMs))]);
}

function envelope(data, sourceIds = [], version = process.env.DATA_SCHEMA_VERSION || '1.0.0', metadata = {}) {
  return { data, data_version: version, generated_at: new Date().toISOString(), source_ids: sourceIds, lineage_id: `query:${Date.now()}`, ...metadata };
}

export class QueryService {
  constructor(options = {}) { this.timeoutMs = options.timeoutMs || 5000; this.maxRows = options.maxRows || 100; }
  async searchNews(params) {
    const limit = Math.min(Number(params.limit || 20), this.maxRows);
    const semantic = params.semantic === true || params.semantic === 'true';
    let rows;
    if (semantic) {
      try {
        const vector = await requestEmbedding(params.q);
        rows = await semanticVectorSearch({ ...params, embedding: vector.embedding, embeddingVersion: process.env.EMBEDDING_VERSION || 'embedding-v1', limit });
      } catch {
        rows = await keywordSemanticFallback({ ...params, limit });
      }
    } else {
      rows = await searchNews({ q: params.q, limit, page: 1 });
    }
    return envelope(await withTimeout(Promise.resolve(rows), this.timeoutMs), rows.map(row => row.stable_id || row.id));
  }
  async getLineage(newsId) {
    const [news, proto] = await withTimeout(Promise.all([getNewsById(newsId), getNewsProtoEvents(newsId)]), this.timeoutMs);
    return envelope({ article: news, proto_events: proto }, [news?.stable_id || newsId].filter(Boolean));
  }
  async listTopics(limit = 20) {
    const boundedLimit = Math.min(limit, this.maxRows);
    const authority = resolveAuthority('query', process.env.QUERY_AUTHORITY_MODE);
    const started = Date.now();
    const legacyPromise = getRelationshipSummariesPage({ page: 1, limit: boundedLimit }).then(result => result.items);
    if (authority.effective_mode === 'legacy') {
      const rows = await legacyPromise;
      return envelope(rows, rows.map(row => row.id), undefined, { query_authority: authority });
    }
    const adsPromise = listAdsTopicTrends(boundedLimit);
    if (authority.effective_mode === 'ads') {
      const rows = await adsPromise;
      return envelope(rows, rows.map(row => row.id), 'ads-topic-trend-v1', { query_authority: authority });
    }
    const [legacyRows, adsRows] = await Promise.all([legacyPromise, adsPromise]);
    const legacyKeys = new Set(legacyRows.map(row => String(row.title || row.id)));
    const adsKeys = new Set(adsRows.map(row => String(row.title || row.id)));
    const overlap = [...legacyKeys].filter(key => adsKeys.has(key)).length;
    const denominator = Math.max(legacyKeys.size, adsKeys.size, 1);
    const comparison = { primary_count: legacyRows.length, shadow_count: adsRows.length, overlap_count: overlap, match_ratio: overlap / denominator };
    await recordAuthorityAudit({ domain: 'query-topics', requested_mode: authority.requested_mode, effective_mode: authority.effective_mode, ...comparison, duration_ms: Date.now() - started }).catch(() => null);
    return envelope(legacyRows, legacyRows.map(row => row.id), undefined, { query_authority: authority, shadow_comparison: comparison });
  }
  async getGraph(summaryId) { const graph = await withTimeout(getRelationshipSummaryGraph(summaryId), this.timeoutMs); return envelope(graph, [summaryId]); }
}
