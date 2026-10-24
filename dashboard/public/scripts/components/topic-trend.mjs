import { normalizeApiError, normalizeQueryEnvelope } from '../utils/response-adapter.mjs';
import { escapeHtml, formatDate, setStatus, truncate } from '../utils/workbench-ui.mjs';

export function topicStrength(topic) {
  return Number(topic.member_count || 0) + Number(topic.edge_count || 0) * 2;
}

export class TopicTrend {
  constructor({ api, container, status, limitInput, refreshButton, onEnvelope }) {
    this.api = api; this.container = container; this.status = status; this.limitInput = limitInput; this.onEnvelope = onEnvelope;
    refreshButton.addEventListener('click', () => this.load());
    this.refreshTimer = null;
  }

  startAutoRefresh(intervalMs = 60000) {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') this.load();
    }, intervalMs);
  }

  stopAutoRefresh() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  async load() {
    setStatus(this.status, '正在刷新主题数据...');
    try {
      const payload = await this.api.getTopicTrends(Number(this.limitInput.value || 12), { timeout: 10000 });
      const envelope = normalizeQueryEnvelope(payload);
      this.render(envelope.data, envelope.meta.generatedAt);
      setStatus(this.status, envelope.empty ? '暂无主题数据。' : `已加载 ${envelope.data.length} 个主题，数据生成于 ${formatDate(envelope.meta.generatedAt)}。`);
      this.onEnvelope?.(payload);
    } catch (error) {
      setStatus(this.status, normalizeApiError(error).message, true);
    }
  }

  render(items) {
    const max = Math.max(...items.map(topicStrength), 1);
    this.container.innerHTML = items.length ? items.map(topic => `
      <article class="topic-card" data-summary-id="${Number(topic.id)}" data-topic-title="${escapeHtml(topic.title)}" tabindex="0">
        <h3>${escapeHtml(truncate(topic.title, 90))}</h3>
        <div class="item-subtext">${escapeHtml(truncate(topic.description, 150))}</div>
        <div class="item-subtext">窗口：${escapeHtml(formatDate(topic.time_start))} — ${escapeHtml(formatDate(topic.time_end))}</div>
        <div class="result-meta"><span class="chip info">${topic.member_count || 0} 成员</span><span class="chip">${topic.edge_count || 0} 关系</span><span class="chip success">置信度 ${(Number(topic.avg_confidence || 0) * 100).toFixed(1)}%</span></div>
        <div class="trend-bar"><span style="width:${Math.max(4, topicStrength(topic) / max * 100)}%"></span></div>
      </article>`).join('') : '<div class="empty-note">暂无主题。</div>';
    this.container.querySelectorAll('[data-summary-id]').forEach(card => {
      const select = () => window.dispatchEvent(new CustomEvent('workbench:topic-selected', { detail: { summaryId: Number(card.dataset.summaryId), query: card.dataset.topicTitle } }));
      card.addEventListener('click', select);
      card.addEventListener('keydown', event => { if (event.key === 'Enter') select(); });
    });
  }
}
