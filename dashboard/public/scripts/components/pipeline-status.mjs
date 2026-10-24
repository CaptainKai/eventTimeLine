import { normalizeQueryEnvelope } from '../utils/response-adapter.mjs';
import { escapeHtml, formatDate, truncate } from '../utils/workbench-ui.mjs';

export async function loadPipelineStatus(api, element) {
  try {
    const payload = await api.getTopicTrends(5, { timeout: 5000 });
    const envelope = normalizeQueryEnvelope(payload);
    element.innerHTML = `<div class="section-head"><div><h2>数据与 AI 升级摘要</h2><p>Query Service 正常 · 数据版本 ${escapeHtml(envelope.meta.dataVersion)} · 更新于 ${escapeHtml(formatDate(envelope.meta.generatedAt))}</p></div><a class="primary-btn" href="/data-ai-workbench.html">进入工作台</a></div>
      <div class="mini-chart-row">${envelope.data.map(topic => `<a class="mini-chart-item" href="/data-ai-workbench.html?tab=search&q=${encodeURIComponent(topic.title || '')}"><div class="metric-label">热点主题</div><div class="item-title">${escapeHtml(truncate(topic.title, 48))}</div><div class="metric-footnote">${topic.member_count || 0} 成员 · ${topic.edge_count || 0} 关系</div></a>`).join('') || '<div class="empty-note">暂无实时主题。</div>'}</div>`;
  } catch {
    element.innerHTML = `<div class="section-head"><div><h2>数据与 AI 升级摘要</h2><p>新查询链路暂不可用，旧版总览不受影响。</p></div><a class="primary-btn" href="/data-ai-workbench.html">查看状态</a></div>`;
  }
}
