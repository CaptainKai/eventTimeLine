import { normalizeApiError, normalizeQueryEnvelope } from '../utils/response-adapter.mjs';
import { escapeHtml, formatDate, setStatus, truncate } from '../utils/workbench-ui.mjs';

export function buildGraphLayout(nodes = [], width = 680, height = 340) {
  const radius = Math.min(width, height) * 0.36;
  return nodes.map((node, index) => {
    const angle = nodes.length > 1 ? index / nodes.length * Math.PI * 2 - Math.PI / 2 : 0;
    return { ...node, x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius };
  });
}

export class LineageViewer {
  constructor({ api, lineageForm, graphForm, lineageResult, graphResult, status, onEnvelope }) {
    Object.assign(this, { api, lineageForm, graphForm, lineageResult, graphResult, status, onEnvelope });
    lineageForm.addEventListener('submit', event => { event.preventDefault(); this.loadLineage(lineageForm.querySelector('input').value); });
    graphForm.addEventListener('submit', event => { event.preventDefault(); this.loadGraph(graphForm.querySelector('input').value); });
  }

  async loadLineage(newsId) {
    const id = Number(newsId); if (!Number.isInteger(id) || id < 1) return setStatus(this.status, '请输入有效新闻 ID。', true);
    this.lineageForm.querySelector('input').value = id;
    setStatus(this.status, `正在加载新闻 ${id} 的血缘...`);
    try {
      const payload = await this.api.getQueryLineage(id, { timeout: 10000 });
      const { data } = normalizeQueryEnvelope(payload);
      this.renderLineage(data);
      setStatus(this.status, `新闻 ${id} 血缘加载完成。`);
      this.onEnvelope?.(payload);
      window.dispatchEvent(new CustomEvent('workbench:lineage-loaded', { detail: { newsId: id, payload } }));
    } catch (error) { setStatus(this.status, normalizeApiError(error).message, true); }
  }

  renderLineage(data = {}) {
    const article = data.article;
    if (!article) { this.lineageResult.innerHTML = '<div class="empty-note">未找到新闻。</div>'; return; }
    const protoEvents = Array.isArray(data.proto_events) ? data.proto_events : [];
    this.lineageResult.innerHTML = `<div class="lineage-flow">
      <article class="lineage-node"><strong>L1 新闻</strong><h3>${escapeHtml(truncate(article.title, 130))}</h3><div class="item-subtext">${escapeHtml(article.source || '')} · ${escapeHtml(formatDate(article.published_at))}</div><div class="result-meta"><span class="chip">schema ${escapeHtml(article.schema_version || 'unknown')}</span><span class="chip">parser ${escapeHtml(article.parser_version || 'unknown')}</span><span class="chip">prompt ${escapeHtml(article.prompt_version || 'unknown')}</span></div></article>
      <div class="lineage-arrow">↓ 解析产生 ${protoEvents.length} 个原子事件</div>
      ${protoEvents.length ? protoEvents.map(event => `<article class="lineage-node"><strong>L2 原子事件 #${event.id}</strong><div>${escapeHtml([event.actor_raw, event.action_raw, event.object_raw].filter(Boolean).join(' '))}</div><div class="item-subtext">${escapeHtml(formatDate(event.event_time))} · 置信度 ${(Number(event.extraction_confidence || 0) * 100).toFixed(1)}%</div><div class="result-meta"><span class="chip">normalization ${escapeHtml(event.normalization_version || 'unknown')}</span><span class="chip">logic ${escapeHtml(event.logic_version || 'unknown')}</span></div></article>`).join('') : '<div class="empty-note">该新闻暂无原子事件。</div>'}
    </div>`;
  }

  async loadGraph(summaryId) {
    const id = Number(summaryId); if (!Number.isInteger(id) || id < 1) return setStatus(this.status, '请输入有效 Summary ID。', true);
    this.graphForm.querySelector('input').value = id;
    setStatus(this.status, `正在加载 Summary ${id} 图谱...`);
    try {
      const payload = await this.api.getQueryGraph(id, { timeout: 10000 });
      this.renderGraph(normalizeQueryEnvelope(payload).data);
      setStatus(this.status, `Summary ${id} 图谱加载完成。`);
      this.onEnvelope?.(payload);
    } catch (error) { setStatus(this.status, normalizeApiError(error).message, true); }
  }

  renderGraph(graph) {
    if (!graph?.nodes?.length) { this.graphResult.innerHTML = '<div class="empty-note">该主题暂无可展示图谱节点。</div>'; return; }
    const nodes = buildGraphLayout(graph.nodes.slice(0, 60));
    const positions = new Map(nodes.map(node => [String(node.id), node]));
    const edges = (graph.edges || []).filter(edge => positions.has(String(edge.source)) && positions.has(String(edge.target))).slice(0, 80);
    this.graphResult.innerHTML = `<h3>${escapeHtml(graph.summary?.title || '关系图谱')}</h3><div class="graph-canvas"><svg viewBox="0 0 680 340" role="img" aria-label="关系图谱">
      ${edges.map(edge => { const source = positions.get(String(edge.source)); const target = positions.get(String(edge.target)); return `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="${edge.type === 'temporal' ? '#54657a' : '#00a9cc'}" stroke-width="${Math.max(1, Number(edge.weight || 1))}" opacity=".65"><title>${escapeHtml(edge.type)}</title></line>`; }).join('')}
      ${nodes.map(node => `<g><circle cx="${node.x}" cy="${node.y}" r="8" fill="#00d4ff"><title>${escapeHtml(node.title)}</title></circle><text x="${node.x + 11}" y="${node.y + 4}" fill="#dfe8f6" font-size="10">#${node.id}</text></g>`).join('')}
      </svg></div><div class="graph-labels">${nodes.slice(0, 12).map(node => `<div class="item-subtext">#${node.id} ${escapeHtml(truncate(node.title, 100))}</div>`).join('')}</div>`;
  }
}
