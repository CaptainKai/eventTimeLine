/**
 * API 客户端工具
 */

class ApiClient {
  constructor(baseUrl = '/api/v1') {
    this.baseUrl = baseUrl;
    this.timeout = 30000; // 30秒超时
  }

  /**
   * 发送HTTP请求
   */
  async request(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    const { timeout: requestedTimeout, signal: externalSignal, ...fetchOptions } = options;

    const config = {
      ...fetchOptions,
      method: fetchOptions.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers || {}),
      },
    };

    const controller = new AbortController();
    const timeout = requestedTimeout ?? this.timeout;
    const abortFromExternal = () => controller.abort(externalSignal.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
    const timeoutId = setTimeout(() => controller.abort('timeout'), timeout);

    try {
      const response = await fetch(fullUrl, {
        ...config,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let details = null;
        try { details = await response.json(); } catch { details = null; }
        const error = new Error(details?.message || `HTTP ${response.status}: ${response.statusText}`);
        error.name = 'ApiError';
        error.status = response.status;
        error.code = details?.error || 'HTTP_ERROR';
        error.details = details;
        throw error;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const abortedError = new Error(externalSignal?.aborted ? 'Request cancelled' : 'Request timeout');
        abortedError.name = externalSignal?.aborted ? 'RequestCancelledError' : 'RequestTimeoutError';
        abortedError.code = externalSignal?.aborted ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT';
        throw abortedError;
      }

      console.error('[API] Request error:', error);
      throw error;
    } finally {
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }
  }

  /**
   * GET 请求
   */
  async get(url, params = {}) {
    const queryString = Object.keys(params)
      .filter(key => params[key] != null && params[key] !== '')
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const fullUrl = queryString ? `${url}?${queryString}` : url;

    return this.request(fullUrl, { method: 'GET' });
  }

  /**
   * POST 请求
   */
  async post(url, data = {}) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getWithOptions(url, params = {}, options = {}) {
    const queryString = Object.keys(params)
      .filter(key => params[key] != null && params[key] !== '')
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');
    return this.request(queryString ? `${url}?${queryString}` : url, { ...options, method: 'GET' });
  }

  /**
   * PUT 请求
   */
  async put(url, data = {}) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE 请求
   */
  async delete(url) {
    return this.request(url, { method: 'DELETE' });
  }

  async requestAbsolute(url, options = {}) {
    return this.request(url, {
      ...options,
      headers: options.headers,
      absolute: true,
    });
  }

  /**
   * 获取事件列表
   */
  async getEvents(page = 1, limit = 50, options = {}) {
    return this.get('/events', {
      page,
      limit,
      type: options.type,
      actor: options.actor,
      location: options.location,
      status: options.status,
      startDate: options.startDate,
      endDate: options.endDate,
      isOngoing: options.isOngoing,
      isFuture: options.isFuture,
    });
  }

  /**
   * 获取单个事件
   */
  async getEventById(id) {
    return this.get(`/events/${id}`);
  }

  /**
   * 重新解析事件并获取详细解析结果
   */
  async parseEvent(id, method = 'traditional') {
    return this.post(`/events/${id}/parse`, { method });
  }

  /**
   * 搜索事件
   */
  async searchEvents(query = '', page = 1, limit = 50, options = {}) {
    return this.get('/events/search', {
      q: query,
      page,
      limit,
      type: options.type,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  }

  /**
   * 获取时间线数据
   */
  async getTimeline(startDate, endDate, granularity = 'day', options = {}) {
    return this.get('/events/timeline', {
      startDate,
      endDate,
      granularity,
      type: options.type,
      actor: options.actor,
      location: options.location,
    });
  }

  async getTimelineItems(startDate, endDate, options = {}) {
    return this.get('/events/timeline-items', {
      startDate,
      endDate,
      type: options.type,
      actor: options.actor,
      location: options.location,
    });
  }

  async getEventGraph(options = {}) {
    return this.get('/events/graph', {
      type: options.type,
      actor: options.actor,
      location: options.location,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  }

  /**
   * 获取已提取原子事件的新闻列表
   */
  async getNewsWithProtoEvents(page = 1, limit = 50) {
    return this.get('/news/with-proto-events', { page, limit });
  }

  /**
   * 获取某条新闻的原子事件
   */
  async getProtoEventsForNews(newsId) {
    return this.get(`/news/${newsId}/proto-events`);
  }

  /**
   * 获取孤立标准事件
   */
  async getOrphanEvents(page = 1, limit = 50) {
    return this.get('/events/orphan', { page, limit });
  }

  /**
   * 获取标准事件聚合来源列表
   */
  async getEventsAggregation(page = 1, limit = 50) {
    return this.get('/events/aggregation', { page, limit });
  }

  /**
   * 获取标准事件的原子事件（按新闻分组）
   */
  async getEventAggregationDetail(eventId) {
    return this.get(`/events/${eventId}/aggregation`);
  }

  /**
   * 获取全量事件关系列表
   */
  async getEventRelationships(page = 1, limit = 50, type = null) {
    const params = { page, limit };
    if (type) params.type = type;
    return this.get('/events/relationships', params);
  }

  /**
   * 模拟聚合（不写入 DB）
   * 根据筛选条件过滤原子事件，然后构建 L2-L6 完整链路
   */
  async simulateAggregation(filters = {}) {
    return this.post('/events/simulate-aggregation', filters);
  }

  async getDashboardOverview(filters = {}) {
    return this.get('/dashboard/overview', filters);
  }

  async getDashboardNewsParse(page = 1, limit = 40, filters = {}) {
    return this.get('/dashboard/news-parse', {
      page,
      limit,
      ...filters,
    });
  }

  async getDashboardPendingNormalizations(page = 1, limit = 100, options = {}) {
    return this.get('/dashboard/pending-normalizations', {
      page,
      limit,
      ...options,
    });
  }

  async getDashboardNormalizationAuditLogs(page = 1, limit = 50, options = {}) {
    return this.get('/dashboard/normalization-audit-logs', {
      page,
      limit,
      ...options,
    });
  }

  async getDashboardCanonicalEvents(page = 1, limit = 50, filters = {}) {
    return this.get('/dashboard/canonical-events', {
      page,
      limit,
      ...filters,
    });
  }

  async getDashboardRelationships(page = 1, limit = 50, filters = {}) {
    return this.get('/dashboard/relationships', {
      page,
      limit,
      ...filters,
    });
  }

  async getDashboardStories(page = 1, limit = 50, filters = {}) {
    return this.get('/dashboard/stories', {
      page,
      limit,
      ...filters,
    });
  }

  async getDashboardPendingHypotheses(page = 1, limit = 50, filters = {}) {
    return this.get('/dashboard/hypotheses/pending', {
      page,
      limit,
      ...filters,
    });
  }

  async getDashboardRelationshipSubgraph(options = {}) {
    return this.get('/dashboard/relationships/subgraph', options);
  }

  async getDashboardRelationshipNeighbors(options = {}) {
    return this.get('/dashboard/relationships/neighbors', options);
  }

  async getDashboardRelationshipClusters(options = {}) {
    return this.get('/dashboard/relationships/clusters', options);
  }

  /**
   * 获取全局 Relationship Summary 之间的关联图
   */
  async getGlobalRelationshipSummaryGraph(options = {}) {
    return this.get('/dashboard/graph/summaries/global', options);
  }

  /**
   * 获取特定 Summary 内部的原子图
   */
  async getRelationshipSummaryGraph(summaryId) {
    return this.get(`/dashboard/graph/summaries/${summaryId}/detail`);
  }

  async reviewPendingNormalization(pendingId, options = {}) {
    return this.post('/admin/normalizations/review', {
      pendingId,
      ...options,
    });
  }

  async promotePendingNormalization(pendingId, options = {}) {
    return this.post('/admin/normalizations/promote', {
      pendingId,
      ...options,
    });
  }

  async rejectPendingNormalization(pendingId, options = {}) {
    return this.post('/admin/normalizations/reject', {
      pendingId,
      ...options,
    });
  }

  /**
   * 获取实体信息
   */
  async getEntities(type = null, page = 1, limit = 100) {
    if (type) {
      return this.get(`/entities/type/${type}`, { page, limit });
    }
    return this.get('/entities/types');
  }

  /**
   * 搜索实体
   */
  async searchEntities(query, type = null) {
    return this.get('/entities/search', { q: query, type });
  }

  /**
   * 获取新闻列表
   */
  async getNews(page = 1, limit = 50, options = {}) {
    return this.get('/news', {
      page,
      limit,
      source: options.source,
      lang: options.lang,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  }

  /**
   * 获取单个新闻
   */
  async getNewsById(id) {
    return this.get(`/news/${id}`);
  }

  /**
   * 解析新闻并获取解析结果
   */
  async parseNews(id, method = 'traditional') {
    return this.post(`/news/${id}/parse`, { method });
  }

  /**
   * 测试解析器（不保存到数据库）
   */
  async parseNewsTest(title, content, method = 'traditional') {
    return this.post(`/news/parse-test`, { title, content, method });
  }

  /**
   * 搜索新闻
   */
  async searchNews(query = '', page = 1, limit = 50, options = {}) {
    return this.get('/news/search', {
      q: query,
      page,
      limit,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  }

  /**
   * 获取事件的新闻
   */
  async getNewsForEvent(eventId, page = 1, limit = 20) {
    return this.get(`/events/${eventId}/news`, { page, limit });
  }

  /**
   * 获取标准事件下的原子事件（已去重）
   */
  async getProtoEventsForEvent(eventId) {
    return this.get(`/events/${eventId}/proto-events`);
  }

  /**
   * 获取新闻统计信息
   */
  async getNewsStats(options = {}) {
    return this.get('/news/stats', {
      startDate: options.startDate,
      endDate: options.endDate,
    });
  }

  /**
   * 获取新闻血统 (L1 -> L2 -> L3)
   */
  async getNewsLineage(id) {
    return this.get(`/intelligence/news/${id}/lineage`);
  }

  async searchSemanticNews(params = {}, options = {}) {
    return this.getWithOptions('/query/news', params, options);
  }

  async getTopicTrends(limit = 20, options = {}) {
    return this.getWithOptions('/query/topics', { limit }, options);
  }

  async getQueryLineage(newsId, options = {}) {
    return this.getWithOptions(`/query/news/${encodeURIComponent(newsId)}/lineage`, {}, options);
  }

  async getQueryGraph(summaryId, options = {}) {
    return this.getWithOptions(`/query/graph/${encodeURIComponent(summaryId)}`, {}, options);
  }

  async getAgentTools(options = {}) {
    return this.getWithOptions('/agent/tools', {}, options);
  }

  async executeAgentTool(name, args = {}, options = {}) {
    return this.request(`/agent/tools/${encodeURIComponent(name)}`, {
      method: 'POST',
      body: JSON.stringify(args),
      headers: options.requestId ? { 'x-request-id': options.requestId } : undefined,
      signal: options.signal,
      timeout: options.timeout,
    });
  }

  /**
   * 获取所有故事 (L5)
   */
  async getStories() {
    return this.get('/intelligence/stories');
  }

  /**
   * 获取故事详情 (包含 L3, L6)
   */
  async getStoryDetails(id) {
    return this.get(`/intelligence/stories/${id}`);
  }

  /**
   * 获取待验证预测 (L6)
   */
  async getPendingHypotheses() {
    return this.get('/intelligence/hypotheses/pending');
  }

  /**
   * 获取健康检查
   */
  async healthCheck() {
    return fetch('/api/health').then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    });
  }

  /**
   * 获取系统配置信息
   */
  async getSystemConfig() {
    return this.healthCheck();
  }
}

// 创建单例实例
const apiClient = new ApiClient();

if (typeof window !== 'undefined') {
  window.ApiClient = ApiClient;
  window.apiClient = apiClient;
}
