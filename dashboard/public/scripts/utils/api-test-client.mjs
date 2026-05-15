class ApiClient {
  constructor(baseUrl = '/api/v1') {
    this.baseUrl = baseUrl;
    this.timeout = 10000;
  }

  async request(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
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
