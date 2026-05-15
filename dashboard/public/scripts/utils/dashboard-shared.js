(function () {
  const STORAGE_KEY = 'event-timeline-dashboard-filters-v2';
  const DEFAULT_FILTERS = {
    lang: '',
    source: '',
    parserMethod: '',
    eventType: '',
    startDate: '',
    endDate: '',
  };

  function loadStoredFilters() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : { ...DEFAULT_FILTERS };
    } catch {
      return { ...DEFAULT_FILTERS };
    }
  }

  function loadQueryFilters() {
    const params = new URLSearchParams(window.location.search);
    const filters = { ...DEFAULT_FILTERS };
    Object.keys(DEFAULT_FILTERS).forEach(key => {
      filters[key] = params.get(key) || '';
    });
    return filters;
  }

  function loadGlobalFilters() {
    return { ...DEFAULT_FILTERS, ...loadStoredFilters(), ...loadQueryFilters() };
  }

  function saveGlobalFilters(filters) {
    const next = { ...DEFAULT_FILTERS, ...filters };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    const params = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
    syncNavLinks(next);
  }

  function readFiltersFromDom() {
    return {
      lang: document.getElementById('filter-lang')?.value || '',
      source: document.getElementById('filter-source')?.value || '',
      parserMethod: document.getElementById('filter-parser')?.value || '',
      eventType: document.getElementById('filter-event-type')?.value || '',
      startDate: document.getElementById('filter-start-date')?.value || '',
      endDate: document.getElementById('filter-end-date')?.value || '',
    };
  }

  function applyFiltersToDom(filters) {
    const values = { ...DEFAULT_FILTERS, ...filters };
    const mapping = {
      lang: 'filter-lang',
      source: 'filter-source',
      parserMethod: 'filter-parser',
      eventType: 'filter-event-type',
      startDate: 'filter-start-date',
      endDate: 'filter-end-date',
    };

    Object.entries(mapping).forEach(([key, id]) => {
      const element = document.getElementById(id);
      if (element) element.value = values[key] || '';
    });
  }

  function clearFilters() {
    applyFiltersToDom(DEFAULT_FILTERS);
    saveGlobalFilters(DEFAULT_FILTERS);
    return { ...DEFAULT_FILTERS };
  }

  function bindGlobalFilters(onApply) {
    const initial = loadGlobalFilters();
    applyFiltersToDom(initial);
    syncNavLinks(initial);

    const applyButton = document.getElementById('apply-filters');
    const clearButton = document.getElementById('clear-filters');

    applyButton?.addEventListener('click', () => {
      const filters = readFiltersFromDom();
      saveGlobalFilters(filters);
      onApply(filters);
    });

    clearButton?.addEventListener('click', () => {
      const filters = clearFilters();
      onApply(filters);
    });

    return initial;
  }

  function syncNavLinks(filters = loadGlobalFilters()) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();

    document.querySelectorAll('[data-dashboard-nav]').forEach(link => {
      const href = link.getAttribute('href') || '/';
      const url = new URL(href, window.location.origin);
      url.search = query;
      link.setAttribute('href', `${url.pathname}${url.search}`);
    });
  }

  function formatDate(value, withTime = true) {
    if (!value) return '未知';
    const options = withTime
      ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Date(value).toLocaleString('zh-CN', options);
  }

  function truncate(text, maxLength = 120) {
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parserLabel(item) {
    return item?.is_llm_parsed || item?.parser_method === 'llm' ? 'LLM 解析' : '传统解析';
  }

  window.DashboardShared = {
    DEFAULT_FILTERS,
    bindGlobalFilters,
    loadGlobalFilters,
    saveGlobalFilters,
    readFiltersFromDom,
    applyFiltersToDom,
    clearFilters,
    syncNavLinks,
    formatDate,
    truncate,
    escapeHtml,
    parserLabel,
  };
})();

