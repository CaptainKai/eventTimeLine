import { EvidencePanel } from './components/evidence-panel.mjs';
import { SemanticSearch } from './components/semantic-search.mjs';
import { TopicTrend } from './components/topic-trend.mjs';
import { LineageViewer } from './components/lineage-viewer.mjs';
import { AgentToolConsole } from './components/agent-tool-console.mjs';
import { buildWorkbenchUrlState, normalizeApiError, readWorkbenchUrlState } from './utils/response-adapter.mjs';

const VALID_TABS = new Set(['search', 'insights', 'lineage', 'agent']);

export function resolveWorkbenchTab(value) {
  return VALID_TABS.has(value) ? value : 'search';
}

export function createRequestId(now = Date.now(), random = Math.random()) {
  return `workbench-${now}-${Math.floor(random * 1_000_000).toString(16)}`;
}

function updateUrl(state) {
  const query = buildWorkbenchUrlState(state);
  window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function activateTab(tab, state) {
  const activeTab = resolveWorkbenchTab(tab);
  document.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === activeTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-pane]').forEach(pane => {
    const active = pane.dataset.pane === activeTab;
    pane.classList.toggle('active', active);
    pane.hidden = !active;
  });
  state.tab = activeTab;
  updateUrl(state);
}

async function initialize() {
  const api = window.apiClient;
  const state = readWorkbenchUrlState(window.location.search);
  const evidence = new EvidencePanel(document.getElementById('workbench-evidence'));
  const showEvidence = payload => evidence.render(payload);
  const semanticSearch = new SemanticSearch({
    api,
    form: document.getElementById('semantic-search-form'),
    results: document.getElementById('semantic-search-results'),
    status: document.getElementById('semantic-search-status'),
    onEnvelope: showEvidence,
  });
  const topicTrend = new TopicTrend({
    api,
    container: document.getElementById('topic-trends'),
    status: document.getElementById('topic-status'),
    limitInput: document.getElementById('topic-limit'),
    refreshButton: document.getElementById('refresh-topics'),
    onEnvelope: showEvidence,
  });
  const lineageViewer = new LineageViewer({
    api,
    lineageForm: document.getElementById('lineage-form'),
    graphForm: document.getElementById('graph-form'),
    lineageResult: document.getElementById('lineage-result'),
    graphResult: document.getElementById('graph-result'),
    status: document.getElementById('lineage-status'),
    onEnvelope: showEvidence,
  });
  const toolConsole = new AgentToolConsole({
    api,
    form: document.getElementById('agent-tool-form'),
    select: document.getElementById('agent-tool-name'),
    fields: document.getElementById('agent-tool-fields'),
    status: document.getElementById('agent-tool-status'),
    result: document.getElementById('agent-tool-result'),
    onEnvelope: showEvidence,
    createRequestId,
  });

  document.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => activateTab(button.dataset.tab, state));
  });
  activateTab(state.tab, state);
  window.DashboardShared?.syncNavLinks();

  window.addEventListener('workbench:topic-selected', event => {
    document.getElementById('graph-summary-id').value = event.detail.summaryId;
    semanticSearch.setQuery(event.detail.query);
    state.q = event.detail.query;
    activateTab('search', state);
    semanticSearch.search({ q: event.detail.query, mode: 'semantic' });
  });
  window.addEventListener('workbench:news-selected', event => {
    state.newsId = event.detail.newsId;
    activateTab('lineage', state);
    lineageViewer.loadLineage(event.detail.newsId);
  });
  window.addEventListener('workbench:tool-completed', event => {
    const { name, args, payload } = event.detail;
    if (name === 'get_event_lineage') { activateTab('lineage', state); lineageViewer.renderLineage(payload.data); }
    if (name === 'query_graph') { activateTab('lineage', state); lineageViewer.renderGraph(payload.data); }
    if (name === 'query_topic_trend') { activateTab('insights', state); topicTrend.render(payload.data || []); }
    if (name === 'search_news') { activateTab('search', state); semanticSearch.render(payload.data || []); semanticSearch.setQuery(args.q); }
    if (name === 'generate_report_context') {
      activateTab('search', state);
      semanticSearch.render(payload.data?.evidence || []);
      semanticSearch.setQuery(payload.data?.query || args.q);
    }
  });

  try {
    const [topicEnvelope, toolResponse] = await Promise.all([api.getTopicTrends(1, { timeout: 5000 }), api.getAgentTools({ timeout: 5000 })]);
    evidence.render(topicEnvelope);
    document.getElementById('workbench-api-status').textContent = 'Query Service 正常';
    document.getElementById('workbench-version').textContent = `数据版本 ${topicEnvelope.data_version || 'unknown'}`;
    const count = Array.isArray(toolResponse.data) ? toolResponse.data.length : Object.keys(toolResponse.data || {}).length;
    document.getElementById('agent-tool-summary').textContent = `已发现 ${count} 个 Agent Tool，可动态校验参数并执行。`;
    toolConsole.setDefinitions(toolResponse.data);
    await topicTrend.load();
    topicTrend.startAutoRefresh();
    if (state.q) { semanticSearch.setQuery(state.q); semanticSearch.search(); }
    if (state.newsId) lineageViewer.loadLineage(state.newsId);
  } catch (error) {
    const normalized = normalizeApiError(error);
    document.getElementById('workbench-api-status').textContent = '接口不可用';
    document.getElementById('workbench-evidence').innerHTML = `<div class="error-state"></div>`;
    document.querySelector('#workbench-evidence .error-state').textContent = normalized.message;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initialize);
}
