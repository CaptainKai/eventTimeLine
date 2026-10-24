class ApiClient {
  constructor(baseUrl = '/api/v1') {
    this.baseUrl = baseUrl;
    this.timeout = 10000;
  }

  async request(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    const controller = new AbortController();
    const timeout = options.timeout ?? this.timeout;
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort(externalSignal.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
    const timeoutId = setTimeout(() => controller.abort('timeout'), timeout);

    try {
      const response = await fetch(fullUrl, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        body: options.body,
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

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const abortedError = new Error(externalSignal?.aborted ? 'Request cancelled' : 'Request timeout');
        abortedError.name = externalSignal?.aborted ? 'RequestCancelledError' : 'RequestTimeoutError';
        abortedError.code = externalSignal?.aborted ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT';
        throw abortedError;
      }
      throw error;
    } finally {
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }
  }

  async get(url, params = {}) {
    const queryString = Object.keys(params)
      .filter(key => params[key] != null && params[key] !== '')
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const fullUrl = queryString ? `${url}?${queryString}` : url;
    return this.request(fullUrl, { method: 'GET' });
  }

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

  async getEvents(page = 1, limit = 50, options = {}) {
    return this.get('/events', { page, limit, ...options });
  }

  async getEventById(id) {
    return this.get(`/events/${id}`);
  }

  async searchEvents(query = '', page = 1, limit = 50, options = {}) {
    return this.get('/events/search', { q: query, page, limit, ...options });
  }

  async getTimeline(startDate, endDate, granularity = 'day', options = {}) {
    return this.get('/events/timeline', { startDate, endDate, granularity, ...options });
  }

  async getEntities(type = null, page = 1, limit = 100) {
    if (type) {
      return this.get(`/entities/type/${type}`, { page, limit });
    }
    return this.get('/entities/types');
  }

  async searchEntities(query, type = null) {
    return this.get('/entities/search', { q: query, type });
  }

  async getNews(page = 1, limit = 50, options = {}) {
    return this.get('/news', { page, limit, ...options });
  }

  async healthCheck() {
    const root = this.baseUrl.startsWith('http')
      ? new URL('/api/health', this.baseUrl).toString()
      : '/api/health';
    return this.request(root);
  }
}

export { ApiClient };
