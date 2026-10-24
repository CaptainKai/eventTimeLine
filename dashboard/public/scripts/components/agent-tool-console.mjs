import { normalizeApiError } from '../utils/response-adapter.mjs';
import { escapeHtml, setStatus } from '../utils/workbench-ui.mjs';

const FIELD_TYPES = { limit: 'number', news_id: 'number', summary_id: 'number', semantic: 'checkbox', startDate: 'date', endDate: 'date' };

export function buildToolArguments(definition, formData) {
  const args = {};
  for (const field of definition.allowed || []) {
    let value = formData[field];
    if (FIELD_TYPES[field] === 'checkbox') value = Boolean(value);
    if (FIELD_TYPES[field] === 'number' && value !== '' && value !== undefined) value = Number(value);
    if (value !== '' && value !== undefined && value !== false) args[field] = value;
  }
  return args;
}

export class AgentToolConsole {
  constructor({ api, form, select, fields, status, result, onEnvelope, createRequestId }) {
    Object.assign(this, { api, form, select, fields, status, result, onEnvelope, createRequestId });
    this.definitions = {};
    select.addEventListener('change', () => this.renderFields());
    form.addEventListener('submit', event => { event.preventDefault(); this.execute(); });
  }

  setDefinitions(definitions) {
    this.definitions = definitions || {};
    this.select.innerHTML = Object.keys(this.definitions).map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    this.renderFields();
  }

  renderFields() {
    const definition = this.definitions[this.select.value];
    this.fields.innerHTML = definition ? definition.allowed.map(field => {
      const type = FIELD_TYPES[field] || 'text'; const required = definition.required.includes(field);
      if (type === 'checkbox') return `<label>${escapeHtml(field)} <input name="${escapeHtml(field)}" type="checkbox"></label>`;
      return `<label>${escapeHtml(field)}<input name="${escapeHtml(field)}" type="${type}" ${required ? 'required' : ''} ${field === 'limit' ? `min="1" max="${definition.maxLimit || 100}" value="20"` : ''}></label>`;
    }).join('') : '';
  }

  async execute() {
    const name = this.select.value; const definition = this.definitions[name];
    const formData = Object.fromEntries(new FormData(this.form));
    for (const checkbox of this.form.querySelectorAll('input[type="checkbox"]')) formData[checkbox.name] = checkbox.checked;
    const args = buildToolArguments(definition, formData);
    const requestId = this.createRequestId();
    setStatus(this.status, `正在执行 ${name} · ${requestId}`);
    try {
      const payload = await this.api.executeAgentTool(name, args, { requestId, timeout: 15000 });
      this.result.innerHTML = `<div class="result-card"><div class="result-meta"><span class="chip success">执行成功</span><span class="chip">${escapeHtml(payload.request_id)}</span><span class="chip">${Array.isArray(payload.source_ids) ? payload.source_ids.length : 0} 条证据</span></div><pre class="raw-json">${escapeHtml(JSON.stringify(payload.data, null, 2))}</pre></div>`;
      setStatus(this.status, `${name} 执行成功。`);
      this.onEnvelope?.(payload);
      window.dispatchEvent(new CustomEvent('workbench:tool-completed', { detail: { name, args, payload } }));
    } catch (error) { setStatus(this.status, normalizeApiError(error).message, true); }
  }
}
