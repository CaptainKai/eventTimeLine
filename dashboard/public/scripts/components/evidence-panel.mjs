import { normalizeQueryEnvelope } from '../utils/response-adapter.mjs';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildEvidenceViewModel(payload) {
  const { meta } = normalizeQueryEnvelope(payload);
  return {
    ...meta,
    generatedAtLabel: meta.generatedAt ? new Date(meta.generatedAt).toLocaleString('zh-CN') : '未知',
    sourceCount: meta.sourceIds.length,
    statusLabel: meta.degraded ? '降级结果' : meta.stale ? '数据可能陈旧' : '证据完整',
  };
}

export class EvidencePanel {
  constructor(element) {
    this.element = element;
  }

  render(payload) {
    const model = buildEvidenceViewModel(payload);
    this.element.innerHTML = `
      <div class="evidence-head">
        <strong>证据与版本</strong>
        <span class="status-pill ${model.degraded || model.stale ? 'pending' : 'verified'}">${escapeHtml(model.statusLabel)}</span>
      </div>
      <dl class="evidence-grid">
        <div><dt>数据版本</dt><dd>${escapeHtml(model.dataVersion)}</dd></div>
        <div><dt>生成时间</dt><dd>${escapeHtml(model.generatedAtLabel)}</dd></div>
        <div><dt>来源数量</dt><dd>${model.sourceCount}</dd></div>
        <div><dt>血缘 ID</dt><dd>${escapeHtml(model.lineageId || '无')}</dd></div>
      </dl>
      <div class="toolbar-inline">
        <button type="button" data-copy-sources ${model.sourceCount ? '' : 'disabled'}>复制来源 ID</button>
        <button type="button" data-show-raw>查看原始 JSON</button>
      </div>
      <pre class="raw-json" hidden>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;

    this.element.querySelector('[data-copy-sources]')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(model.sourceIds.join('\n'));
    });
    this.element.querySelector('[data-show-raw]')?.addEventListener('click', event => {
      const raw = this.element.querySelector('.raw-json');
      raw.hidden = !raw.hidden;
      event.currentTarget.textContent = raw.hidden ? '查看原始 JSON' : '隐藏原始 JSON';
    });
  }
}
