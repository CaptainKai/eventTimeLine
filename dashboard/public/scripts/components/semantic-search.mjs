import { normalizeApiError, normalizeQueryEnvelope } from '../utils/response-adapter.mjs';
import { escapeHtml, formatDate, setStatus, truncate } from '../utils/workbench-ui.mjs';

export function buildSearchParams(values = {}) {
  return {
    q: String(values.q || '').trim(),
    semantic: values.mode === 'semantic' ? true : undefined,
    source: values.source || undefined,
    startDate: values.startDate || undefined,
    endDate: values.endDate || undefined,
    limit: Math.min(Math.max(Number(values.limit || 20), 1), 50),
  };
}

export class SemanticSearch {
  constructor({ api, form, results, status, onEnvelope }) {
    this.api = api; this.form = form; this.results = results; this.status = status; this.onEnvelope = onEnvelope;
    this.controller = null;
    form.addEventListener('submit', event => { event.preventDefault(); this.search(); });
  }

  setQuery(query) {
    this.form.elements.q.value = query || '';
  }

  async search(overrides = {}) {
    this.controller?.abort();
    this.controller = new AbortController();
    const params = buildSearchParams({
      q: this.form.elements.q.value,
      mode: this.form.elements.mode.value,
      source: this.form.elements.source.value,
      startDate: this.form.elements.startDate.value,
      endDate: this.form.elements.endDate.value,
      limit: this.form.elements.limit.value,
      ...overrides,
    });
    if (!params.q) return setStatus(this.status, '请输入查询内容。', true);
    setStatus(this.status, params.semantic ? '正在进行语义检索...' : '正在进行关键词检索...');
    try {
      const payload = await this.api.searchSemanticNews(params, { signal: this.controller.signal, timeout: 10000 });
      const envelope = normalizeQueryEnvelope(payload);
      this.render(envelope.data);
      setStatus(this.status, envelope.empty ? '没有匹配结果。' : `找到 ${envelope.data.length} 条结果${envelope.meta.degraded ? '（已降级为关键词检索）' : ''}。`);
      this.onEnvelope?.(payload);
      window.dispatchEvent(new CustomEvent('workbench:search-completed', { detail: { query: params.q, payload } }));
    } catch (error) {
      const normalized = normalizeApiError(error);
      if (normalized.type !== 'cancelled') setStatus(this.status, normalized.message, true);
    }
  }

  render(items) {
    this.results.innerHTML = items.length ? items.map(item => `
      <article class="result-card" data-news-id="${Number(item.id)}" tabindex="0">
        <h3>${escapeHtml(truncate(item.title, 120))}</h3>
        <div class="item-subtext">${escapeHtml(truncate(item.content, 220))}</div>
        <div class="result-meta">
          <span class="chip info">${escapeHtml(item.source || '未知来源')}</span>
          <span class="chip">${escapeHtml(formatDate(item.published_at))}</span>
          <span class="chip">版本 ${escapeHtml(item.schema_version || 'unknown')}</span>
          ${item.similarity !== undefined ? `<span class="chip success">相关度 ${(Number(item.similarity) * 100).toFixed(1)}%</span>` : ''}
        </div>
      </article>`).join('') : '<div class="empty-note">暂无匹配新闻。</div>';
    this.results.querySelectorAll('[data-news-id]').forEach(card => {
      const select = () => window.dispatchEvent(new CustomEvent('workbench:news-selected', { detail: { newsId: Number(card.dataset.newsId) } }));
      card.addEventListener('click', select);
      card.addEventListener('keydown', event => { if (event.key === 'Enter') select(); });
    });
  }
}
