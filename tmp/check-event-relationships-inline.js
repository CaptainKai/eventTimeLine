



    // apiClient 已由 api.js 声明为 const，此处直接使用 window 上的引用
    const api = window.apiClient;
    const RELATIONSHIP_PAGE_SIZE = 50;
    const STORY_PAGE_SIZE = 50;
    const HYPOTHESIS_PAGE_SIZE = 50;
    const GRAPH_LIMIT_NODES = 80;
    const GRAPH_LIMIT_EDGES = 120;
    const CLUSTER_ZOOM_THRESHOLD = 0.75;
    const EDGE_PREFETCH_THRESHOLD = 120;
    const EDGE_PREFETCH_DEBOUNCE_MS = 500;
    let simData = { layer3: [], layer4: [], layer5_6: [] };
    let currentTab = 'relationships';
    let selectedKey = null;
    let relationshipTypeFilter = '';
    let storiesState = {
      loaded: false,
      loading: false,
      page: 1,
      limit: STORY_PAGE_SIZE,
      total: 0,
      withHypothesisOnly: false,
      items: [],
      error: null,
    };
    let hypothesesState = {
      loaded: false,
      loading: false,
      page: 1,
      limit: HYPOTHESIS_PAGE_SIZE,
      total: 0,
      status: 'pending',
      items: [],
      error: null,
    };
    let graphState = {
      mode: 'event',
      centerEventId: null,
      nodes: [],
      edges: [],
      clusters: { nodes: [], edges: [] },
      pageInfo: { cursor: 0, next_cursor: 0, has_more: false },
      loading: false,
      loadError: null,
      cache: new Map(),
      requestSeq: 0,
      lastPrefetchAt: 0,
    };

    function canonicalMap() {
      return new Map((simData?.layer3 || []).map(event => [event.id, event]));
    }

    function storyHypothesisCount(story = {}) {
      return Number(story.hypothesis_count || (story.hypotheses || []).length || 0);
    }

    function storyPendingHypothesisCount(story = {}) {
      return Number(story.pending_hypothesis_count || 0);
    }

    async function hydrateStory(storyId) {
      const numericStoryId = Number(storyId);
      if (!numericStoryId) return null;
      const existing = (simData.layer5_6 || []).find(entry => Number(entry.id || entry.story_id) === numericStoryId);
      if (existing?.events_loaded) return existing;

      const response = await api.getStoryDetails(numericStoryId);
      const detail = response.data;
      if (!detail) return existing || null;

      const knownEventIds = new Set((simData.layer3 || []).map(event => Number(event.id)));
      (detail.events || []).forEach(event => {
        if (!knownEventIds.has(Number(event.id))) simData.layer3.push(event);
      });

      const nextStory = {
        ...(existing || {}),
        ...detail,
        story_id: detail.story_id || detail.id || numericStoryId,
        hypotheses: detail.hypotheses || existing?.hypotheses || [],
        events_loaded: true,
      };
      const index = (simData.layer5_6 || []).findIndex(entry => Number(entry.id || entry.story_id) === numericStoryId);
      if (index >= 0) simData.layer5_6[index] = nextStory;
      else simData.layer5_6.push(nextStory);
      return nextStory;
    }

    function goToCanonicalPage(eventId) {
      const params = new URLSearchParams({ ...window.DashboardShared.readFiltersFromDom(), eventId });
      window.location.href = `/canonical-events.html?${params.toString()}`;
    }

    function buildToolbar() {
      const toolbar = document.getElementById('tab-toolbar');
      if (currentTab === 'relationships') {
        toolbar.innerHTML = `
          <div class="filter-group">
            <label for="rel-type-filter">关系类型</label>
            <select id="rel-type-filter">
              <option value="">全部关系</option>
              <option value="cause_effect">因果</option>
              <option value="parent_child">父子</option>
              <option value="evolution">演变</option>
              <option value="trigger">触发</option>
              <option value="temporal">时间</option>
              <option value="sub_event">子事件</option>
              <option value="related">相关</option>
            </select>
          </div>
        `;
        const typeFilter = document.getElementById('rel-type-filter');
        typeFilter.value = relationshipTypeFilter;
        typeFilter.addEventListener('change', async event => {
          relationshipTypeFilter = event.target.value || '';
          selectedKey = null;
          await loadWorkspace(currentFilters());
        });
      } else if (currentTab === 'stories') {
        toolbar.innerHTML = `
          <label class="chip"><input type="checkbox" id="story-has-hypothesis" ${storiesState.withHypothesisOnly ? 'checked' : ''}> 仅看带假设叙事</label>
        `;
        document.getElementById('story-has-hypothesis').addEventListener('change', event => {
          storiesState.withHypothesisOnly = event.target.checked;
          selectedKey = null;
          loadStoriesPage(1);
        });
      } else {
        toolbar.innerHTML = `
          <div class="filter-group">
            <label for="hypothesis-status-filter">假设状态</label>
            <select id="hypothesis-status-filter">
              <option value="pending">pending</option>
              <option value="all">全部状态</option>
              <option value="verified">verified</option>
              <option value="failed">failed</option>
            </select>
          </div>
        `;
        const statusFilter = document.getElementById('hypothesis-status-filter');
        statusFilter.value = hypothesesState.status || 'pending';
        statusFilter.addEventListener('change', event => {
          hypothesesState.status = event.target.value || 'pending';
          selectedKey = null;
          loadHypothesesPage(1);
        });
      }
    }

    function relationshipKey(item, index = 0) {
      return `rel-${item.id || `${item.source_id}-${item.target_id}-${item.relationship_type || 'related'}-${index}`}`;
    }

    function relationshipUpdatedAt(item = {}) {
      return item.relationship_updated_at || item.updated_at || item.relationship_created_at || item.created_at || '';
    }

    function filteredRelationships() {
      const type = relationshipTypeFilter;
      return (simData?.layer4 || [])
        .map(formatEdge)
        .filter(item => !type || item.relationship_type === type);
    }

    function currentFilters() {
      return window.DashboardShared.readFiltersFromDom();
    }

    function eventNodeMap() {
      const map = new Map();
      (simData?.layer3 || []).forEach(node => map.set(Number(node.id), node));
      (graphState.nodes || []).forEach(node => map.set(Number(node.id), node));
      return map;
    }

    function buildCacheKey(kind, payload = {}) {
      return `${kind}:${JSON.stringify(payload)}`;
    }

    function formatEdge(edge) {
      return {
        ...edge,
        source_id: Number(edge.source_id),
        target_id: Number(edge.target_id),
        complexity_score: Number(edge.complexity_score || ((Number(edge.confidence || 0) * 2) + Number(edge.权重 || 0))),
      };
    }

    function mergeGraphPayload(payload, append = false) {
      const incomingNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
      const incomingEdges = Array.isArray(payload.edges) ? payload.edges.map(formatEdge) : [];

      const nodeMap = append ? new Map((graphState.nodes || []).map(node => [Number(node.id), node])) : new Map();
      incomingNodes.forEach(node => nodeMap.set(Number(node.id), node));

      const edgeMap = append
        ? new Map((graphState.edges || []).map(edge => [`${edge.source_id}-${edge.target_id}-${edge.relationship_type}`, edge]))
        : new Map();
      incomingEdges.forEach(edge => edgeMap.set(`${edge.source_id}-${edge.target_id}-${edge.relationship_type}`, edge));

      graphState.nodes = [...nodeMap.values()];
      graphState.edges = [...edgeMap.values()];
      graphState.pageInfo = payload.page_info || { cursor: 0, next_cursor: 0, has_more: false };
      graphState.loadError = null;
    }

    async function fetchSubgraph(centerEventId, options = {}) {
      if (!centerEventId) return;
      const cursor = Number(options.cursor || 0);
      const append = options.append === true;
      const filters = currentFilters();
      const type = document.getElementById('rel-type-filter')?.value || '';
      const cacheKey = buildCacheKey('subgraph', { centerEventId, cursor, type, filters });
      if (graphState.cache.has(cacheKey) && append !== true) {
        mergeGraphPayload(graphState.cache.get(cacheKey), false);
        return;
      }

      const requestId = ++graphState.requestSeq;
      graphState.loading = true;
      try {
        const response = await api.getDashboardRelationshipSubgraph({
          center_event_id: centerEventId,
          mode: 'event',
          radius: 1,
          story_first: true,
          limit_nodes: GRAPH_LIMIT_NODES,
          limit_edges: GRAPH_LIMIT_EDGES,
          cursor,
          relationshipType: type,
          ...filters,
        });
        if (requestId !== graphState.requestSeq) return;
        const payload = response?.data || {};
        graphState.cache.set(cacheKey, payload);
        mergeGraphPayload(payload, append);
        graphState.centerEventId = Number(centerEventId);
        graphState.mode = 'event';
      } catch (error) {
        if (requestId !== graphState.requestSeq) return;
        graphState.loadError = error.message;
      } finally {
        if (requestId === graphState.requestSeq) graphState.loading = false;
      }
    }

    async function fetchNeighbors(centerEventId, options = {}) {
      if (!centerEventId) return;
      const cursor = Number(options.cursor || 0);
      const append = options.append !== false;
      const filters = currentFilters();
      const type = document.getElementById('rel-type-filter')?.value || '';
      const requestId = ++graphState.requestSeq;
      graphState.loading = true;
      try {
        const response = await api.getDashboardRelationshipNeighbors({
          center_event_id: centerEventId,
          mode: 'event',
          radius: 1,
          story_first: true,
          limit_nodes: GRAPH_LIMIT_NODES,
          limit_edges: GRAPH_LIMIT_EDGES,
          cursor,
          relationshipType: type,
          ...filters,
        });
        if (requestId !== graphState.requestSeq) return;
        mergeGraphPayload(response?.data || {}, append);
        graphState.centerEventId = Number(centerEventId);
        graphState.mode = 'event';
      } catch (error) {
        if (requestId !== graphState.requestSeq) return;
        graphState.loadError = error.message;
      } finally {
        if (requestId === graphState.requestSeq) graphState.loading = false;
      }
    }

    async function fetchClusters() {
      const filters = currentFilters();
      const type = document.getElementById('rel-type-filter')?.value || '';
      const cacheKey = buildCacheKey('clusters', { type, filters });
      if (graphState.cache.has(cacheKey)) {
        graphState.clusters = graphState.cache.get(cacheKey);
        return;
      }
      const response = await api.getDashboardRelationshipClusters({
        limit_nodes: 60,
        limit_edges: 120,
        relationshipType: type,
        ...filters,
      });
      const payload = response?.data || { nodes: [], edges: [] };
      graphState.cache.set(cacheKey, payload);
      graphState.clusters = payload;
    }

    function filteredStories() {
      return storiesState.items || [];
    }

    function flattenedHypotheses() {
      return hypothesesState.items || [];
    }

    function mergeStoryCache(stories = []) {
      const storyMap = new Map((simData.layer5_6 || []).map(story => [Number(story.id || story.story_id), story]));
      stories.forEach(story => {
        const storyId = Number(story.id || story.story_id);
        if (!storyId) return;
        const existing = storyMap.get(storyId) || {};
        storyMap.set(storyId, {
          ...existing,
          ...story,
          id: story.id || existing.id || storyId,
          story_id: story.story_id || story.id || existing.story_id || storyId,
          hypotheses: existing.hypotheses || story.hypotheses || [],
        });
      });
      simData.layer5_6 = [...storyMap.values()];
    }

    function mergeHypothesisStoryCache(hypotheses = []) {
      const storyMap = new Map((simData.layer5_6 || []).map(story => [Number(story.id || story.story_id), story]));
      hypotheses.forEach(hypothesis => {
        const storyId = Number(hypothesis.story_id);
        if (!storyId) return;
        const existing = storyMap.get(storyId) || {};
        const existingHypotheses = Array.isArray(existing.hypotheses) ? existing.hypotheses : [];
        const nextHypotheses = existingHypotheses.filter(item => Number(item.id) !== Number(hypothesis.id));
        nextHypotheses.push(hypothesis);
        storyMap.set(storyId, {
          ...existing,
          id: existing.id || storyId,
          story_id: existing.story_id || storyId,
          display_title: existing.display_title || hypothesis.story_title || '未命名叙事',
          display_summary: existing.display_summary || hypothesis.story_summary || '',
          event_count: existing.event_count || hypothesis.event_count || 0,
          hypothesis_count: existing.hypothesis_count || nextHypotheses.length,
          hypotheses: nextHypotheses,
        });
      });
      simData.layer5_6 = [...storyMap.values()];
    }

    async function loadStoriesPage(page = 1) {
      if (storiesState.loading) return;
      const requestedPage = Math.max(Number(page) || 1, 1);
      storiesState = { ...storiesState, page: requestedPage, loading: true, error: null };
      renderStoriesList();

      try {
        const response = await api.getDashboardStories(requestedPage, storiesState.limit, {
          ...currentFilters(),
          withHypothesisOnly: storiesState.withHypothesisOnly,
        });
        const items = response?.data || [];
        storiesState = {
          ...storiesState,
          loaded: true,
          loading: false,
          page: response?.pagination?.page || requestedPage,
          limit: response?.pagination?.limit || storiesState.limit,
          total: response?.pagination?.total || 0,
          items,
          error: null,
        };
        mergeStoryCache(items);
      } catch (error) {
        storiesState = { ...storiesState, loaded: true, loading: false, items: [], error: error.message };
      }
      renderStoriesList();
    }

    async function loadHypothesesPage(page = 1) {
      if (hypothesesState.loading) return;
      const requestedPage = Math.max(Number(page) || 1, 1);
      hypothesesState = { ...hypothesesState, page: requestedPage, loading: true, error: null };
      renderHypothesesList();

      try {
        const response = await api.getDashboardPendingHypotheses(requestedPage, hypothesesState.limit, {
          ...currentFilters(),
          status: hypothesesState.status || 'pending',
        });
        const items = response?.data || [];
        hypothesesState = {
          ...hypothesesState,
          loaded: true,
          loading: false,
          page: response?.pagination?.page || requestedPage,
          limit: response?.pagination?.limit || hypothesesState.limit,
          total: response?.pagination?.total || 0,
          items,
          error: null,
        };
        mergeHypothesisStoryCache(items);
      } catch (error) {
        hypothesesState = { ...hypothesesState, loaded: true, loading: false, items: [], error: error.message };
      }
      renderHypothesesList();
    }

    function renderRelationshipList() {
      const items = filteredRelationships();
      document.getElementById('list-title').textContent = '关系列表';
      const serverTotal = simData?.summary?.total_relationships ?? items.length;
      document.getElementById('list-meta').textContent = `${items.length} 条关系 - 当前页 Top ${RELATIONSHIP_PAGE_SIZE} - 按最新更新时间倒序 / 总计 ${serverTotal}`;
      const storyCount = storiesState.loaded ? storiesState.total : '未加载';
      const hypothesisCount = hypothesesState.loaded ? hypothesesState.total : '未加载';
      document.getElementById('relationship-summary-chip').textContent = `${items.length} 条关系 / ${storyCount} 个叙事 / ${hypothesisCount} 条假设`;

      const list = document.getElementById('relationship-list');
      if (!items.length) {
        selectedKey = null;
        list.innerHTML = '<div class="empty-note">当前筛选条件下暂无关系。</div>';
        return;
      }

      if (!items.some((item, index) => relationshipKey(item, index) === selectedKey)) {
        selectedKey = relationshipKey(items[0], 0);
      }

      list.innerHTML = items.map((item, index) => {
        const key = relationshipKey(item, index);
        const updatedAt = relationshipUpdatedAt(item);
        const sourceTitle = item.source_title || `事件 ${item.source_id}`;
        const targetTitle = item.target_title || `事件 ${item.target_id}`;
        return `
          <div class="stack-item ${selectedKey === key ? 'selected' : ''}" data-key="${key}">
            <div class="item-topline">
              <div class="item-title">${window.DashboardShared.escapeHtml(sourceTitle)} -> ${window.DashboardShared.escapeHtml(targetTitle)}</div>
              <span class="chip info">${window.DashboardShared.escapeHtml(item.relationship_type || 'related')}</span>
            </div>
            <div class="item-subtext">${window.DashboardShared.escapeHtml(item.description || '自动推断事件关系')}</div>
            <div class="chip-row">
              <span class="chip success">更新 ${window.DashboardShared.escapeHtml(window.DashboardShared.formatDate(updatedAt))}</span>
              <span class="chip">${Math.round((item.confidence || 0) * 100)}% 置信度</span>
              <span class="chip warn">权重 ${(item.权重 || 0).toFixed(2)}</span>
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('[data-key]').forEach((element, index) => {
        element.addEventListener('click', () => {
          selectedKey = element.dataset.key;
          renderRelationshipList();
          renderRelationshipInspector(items[index]);
          renderRelationshipGraph(items[index]);
        });
      });
    }

    function renderRelationshipInspector(item) {
      const map = eventNodeMap();
      const source = map.get(Number(item.source_id));
      const target = map.get(Number(item.target_id));
      const sourceTitle = item.source_title || source?.display_title || `事件 ${item.source_id}`;
      const targetTitle = item.target_title || target?.display_title || `事件 ${item.target_id}`;
      const updatedAt = relationshipUpdatedAt(item);
      document.getElementById('inspector-title').textContent = '关系解释';
      document.getElementById('inspector-meta').textContent = '单条关系详情，缩放仅缩放画布';
      document.getElementById('inspector-body').innerHTML = `
        <div class="stack-list">
          <div class="lineage-card">
            <h4>${window.DashboardShared.escapeHtml(sourceTitle)}</h4>
            <div class="summary-text">${window.DashboardShared.escapeHtml(source?.display_summary || source?.description || '无事件摘要')}</div>
            <div class="chip-row"><button onclick="goToCanonicalPage(${item.source_id})">查看标准事件</button></div>
          </div>
          <div class="lineage-card">
            <h4>${window.DashboardShared.escapeHtml(targetTitle)}</h4>
            <div class="summary-text">${window.DashboardShared.escapeHtml(target?.display_summary || target?.description || '无事件摘要')}</div>
            <div class="chip-row"><button onclick="goToCanonicalPage(${item.target_id})">查看标准事件</button></div>
          </div>
          <div class="lineage-card">
            <h4>${window.DashboardShared.escapeHtml(item.relationship_type || 'related')}</h4>
            <div class="summary-text">${window.DashboardShared.escapeHtml(item.description || '当前关系由自动分析器依据event图谱计算得出，暂未返回更细粒度支撑文本。')}</div>
            <div class="chip-row">
              <span class="chip success">更新 ${window.DashboardShared.escapeHtml(window.DashboardShared.formatDate(updatedAt))}</span>
              <span class="chip info">${Math.round((item.confidence || 0) * 100)}% 置信度</span>
              <span class="chip warn">权重 ${(item.权重 || 0).toFixed(2)}</span>
              ${source?.story_name && source.story_name === target?.story_name ? `<span class="chip success">${window.DashboardShared.escapeHtml(source.story_name)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    function renderRelationshipGraph(focusItem = null) {
      const item = focusItem || filteredRelationships()[0];
      document.getElementById('visual-title').textContent = '单关系视图';
      document.getElementById('visual-meta').textContent = '固定显示当前选中 source-target 关系；滚轮只缩放画布，不切换模式、不预取邻居。';
      const host = document.getElementById('visual-host');
      host.innerHTML = '';

      if (!item) {
        host.innerHTML = '<div class="empty-note">暂无关系图数据。</div>';
        return;
      }

      const map = eventNodeMap();
      const source = map.get(Number(item.source_id)) || { id: item.source_id, display_title: item.source_title || `事件 ${item.source_id}`, event_type: '事件' };
      const target = map.get(Number(item.target_id)) || { id: item.target_id, display_title: item.target_title || `事件 ${item.target_id}`, event_type: '事件' };

      if (typeof window.d3 === 'undefined') {
        host.innerHTML = `
          <div class="stack-list" style="padding:1rem;">
            <div class="lineage-card"><h4>${window.DashboardShared.escapeHtml(source.display_title || source.title)}</h4></div>
            <div class="lineage-card"><h4>${window.DashboardShared.escapeHtml(item.relationship_type || 'related')}</h4><div class="summary-text">${window.DashboardShared.escapeHtml(item.description || '')}</div></div>
            <div class="lineage-card"><h4>${window.DashboardShared.escapeHtml(target.display_title || target.title)}</h4></div>
          </div>
        `;
        return;
      }

      const width = host.clientWidth || 800;
      const height = host.clientHeight || 520;
      const sourceNode = {
        id: Number(item.source_id),
        label: source.display_title || source.title || item.source_title || `事件 ${item.source_id}`,
        type: source.event_type || '事件',
        x: Math.round(width * 0.28),
        y: Math.round(height * 0.5),
      };
      const targetNode = {
        id: Number(item.target_id),
        label: target.display_title || target.title || item.target_title || `事件 ${item.target_id}`,
        type: target.event_type || '事件',
        x: Math.round(width * 0.72),
        y: Math.round(height * 0.5),
      };

      const svg = d3.select(host).append('svg').attr('width', '100%').attr('height', '100%').attr('viewBox', [0, 0, width, height]);
      const defs = svg.append('defs');
      defs.append('marker')
        .attr('id', 'relationship-arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 18)
        .attr('refY', 0)
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#5dd9ff');
      const g = svg.append('g');
      svg.call(d3.zoom().scaleExtent([0.4, 4]).on('zoom', event => {
        g.attr('transform', event.transform);
      }));

      g.append('line')
        .attr('x1', sourceNode.x)
        .attr('y1', sourceNode.y)
        .attr('x2', targetNode.x)
        .attr('y2', targetNode.y)
        .attr('stroke', '#5dd9ff')
        .attr('stroke-width', Math.max(2, (item.权重 || 0.3) * 4))
        .attr('stroke-opacity', 0.8)
        .attr('marker-end', 'url(#relationship-arrow)');

      g.append('text')
        .attr('x', width / 2)
        .attr('y', sourceNode.y - 18)
        .attr('text-anchor', 'middle')
        .style('fill', '#d9e5f3')
        .style('font-size', '12px')
        .text(window.DashboardShared.truncate(item.relationship_type || 'related', 22));

      const node = g.append('g').selectAll('g').data([sourceNode, targetNode]).join('g')
        .attr('transform', d => `translate(${d.x},${d.y})`);
      node.append('circle')
        .attr('r', 16)
        .attr('fill', '#0fd3ff')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.2);
      node.append('text')
        .attr('x', 0)
        .attr('y', 34)
        .attr('text-anchor', 'middle')
        .text(d => window.DashboardShared.truncate(d.label, 22))
        .style('fill', '#d9e5f3')
        .style('font-size', '11px');
      node.append('title').text(d => d.label);
    }

    function renderStoriesList() {
      const items = filteredStories();
      const totalPages = Math.max(Math.ceil((storiesState.total || 0) / storiesState.limit), 1);
      document.getElementById('list-title').textContent = '叙事列表';
      document.getElementById('list-meta').textContent = storiesState.loaded
        ? `第 ${storiesState.page}/${totalPages} 页 - 共 ${storiesState.total} 个叙事`
        : '按需加载叙事列表';
      const list = document.getElementById('relationship-list');

      if (storiesState.loading) {
        list.innerHTML = '<div class="empty-note">叙事分页加载中...</div>';
        return;
      }

      if (storiesState.error) {
        list.innerHTML = `<div class="empty-note">叙事加载失败：${window.DashboardShared.escapeHtml(storiesState.error)}</div>`;
        return;
      }

      if (!storiesState.loaded) {
        list.innerHTML = '<div class="empty-note">切换到叙事 Tab 后才会加载分页数据。</div>';
        return;
      }

      if (!items.length) {
        list.innerHTML = '<div class="empty-note">当前筛选条件下暂无叙事。</div>';
        return;
      }

      list.innerHTML = items.map(item => `
        <div class="stack-item ${selectedKey === `story-${item.id || item.story_id}` ? 'selected' : ''}" data-story-id="${item.id || item.story_id}">
          <div class="item-topline">
            <div class="item-title">${window.DashboardShared.escapeHtml(item.display_title)}</div>
            <span class="chip info">${item.event_count || 0} 个事件</span>
          </div>
          <div class="item-subtext">${window.DashboardShared.escapeHtml(window.DashboardShared.truncate(item.display_summary, 120))}</div>
          <div class="chip-row">
            <span class="chip warn">${storyHypothesisCount(item)} 条假设</span>
            ${storyPendingHypothesisCount(item) ? `<span class="chip">${storyPendingHypothesisCount(item)} 条待验证</span>` : ''}
          </div>
        </div>
      `).join('') + `
        <div class="chip-row" style="margin-top:0.75rem; justify-content:center;">
          <button id="stories-prev-page" ${storiesState.page <= 1 ? 'disabled' : ''}>上一页</button>
          <span class="chip">第 ${storiesState.page}/${totalPages} 页</span>
          <button id="stories-next-page" ${storiesState.page >= totalPages ? 'disabled' : ''}>下一页</button>
        </div>
      `;

      list.querySelectorAll('[data-story-id]').forEach(element => {
        element.addEventListener('click', async () => {
          const storyId = Number(element.dataset.storyId);
          selectedKey = `story-${storyId}`;
          renderStoriesList();
          document.getElementById('visual-host').innerHTML = '<div class="empty-note">叙事链路加载中...</div>';
          renderStoryView(await hydrateStory(storyId));
        });
      });

      document.getElementById('stories-prev-page')?.addEventListener('click', () => {
        selectedKey = null;
        loadStoriesPage(Math.max(storiesState.page - 1, 1));
      });
      document.getElementById('stories-next-page')?.addEventListener('click', () => {
        selectedKey = null;
        loadStoriesPage(Math.min(storiesState.page + 1, totalPages));
      });

      const first = items[0];
      if (first && !selectedKey) {
        selectedKey = `story-${first.id || first.story_id}`;
        hydrateStory(first.id || first.story_id).then(renderStoryView).catch(() => renderStoryView(first));
      }
    }

    function renderStoryView(story) {
      if (!story) return;
      const storyEvents = (simData.layer3 || []).filter(event => event.story_id === (story.id || story.story_id));
      document.getElementById('visual-title').textContent = '叙事链路';
      document.getElementById('visual-meta').textContent = '按事件顺序查看该叙事如何从标准事件发展到假设。';
      document.getElementById('visual-host').innerHTML = storyEvents.length ? storyEvents.map((event, index) => `
        <div class="proto-row" style="margin-bottom:0.75rem;">
          <div class="eyebrow">Event ${index + 1}</div>
          <div class="item-title">${window.DashboardShared.escapeHtml(event.display_title)}</div>
          <div class="proto-subline">${window.DashboardShared.escapeHtml(event.display_subtitle || '无附加信息')}</div>
          <div class="summary-text" style="margin-top:0.45rem;">${window.DashboardShared.escapeHtml(event.display_summary || '暂无摘要')}</div>
        </div>
      `).join('') : '<div class="empty-note">该叙事当前没有关联event。</div>';

      document.getElementById('inspector-title').textContent = '叙事 Inspector';
      document.getElementById('inspector-meta').textContent = '叙事摘要、event链与假设概览';
      document.getElementById('inspector-body').innerHTML = `
        <div class="stack-list">
          <div class="lineage-card">
            <h4>${window.DashboardShared.escapeHtml(story.display_title)}</h4>
            <div class="summary-text">${window.DashboardShared.escapeHtml(story.display_summary || '暂无叙事摘要')}</div>
            <div class="chip-row">
              <span class="chip info">${story.event_count || 0} 个事件</span>
              <span class="chip warn">${storyHypothesisCount(story)} 条假设</span>
            </div>
          </div>
          <div class="lineage-card">
            <h4>相关假设</h4>
            ${storyHypothesisCount(story) ? (story.hypotheses || []).map(item => `
              <div class="proto-row" style="margin-top:0.6rem;">
                <div class="proto-mainline">${window.DashboardShared.escapeHtml(item.prediction || item.display_title || '未命名假设')}</div>
                <div class="proto-subline">${window.DashboardShared.escapeHtml(item.status || 'pending')} · ${Math.round((item.probability || 0) * 100)}% 概率</div>
              </div>
            `).join('') : '<div class="summary-text">暂无相关假设。</div>'}
          </div>
        </div>
      `;
    }

    function renderHypothesesList() {
      const items = flattenedHypotheses();
      const totalPages = Math.max(Math.ceil((hypothesesState.total || 0) / hypothesesState.limit), 1);
      document.getElementById('list-title').textContent = '假设列表';
      document.getElementById('list-meta').textContent = hypothesesState.loaded
        ? `第 ${hypothesesState.page}/${totalPages} 页 - 共 ${hypothesesState.total} 条假设`
        : '按需加载假设列表';
      const list = document.getElementById('relationship-list');

      if (hypothesesState.loading) {
        list.innerHTML = '<div class="empty-note">假设分页加载中...</div>';
        return;
      }

      if (hypothesesState.error) {
        list.innerHTML = `<div class="empty-note">假设加载失败：${window.DashboardShared.escapeHtml(hypothesesState.error)}</div>`;
        return;
      }

      if (!hypothesesState.loaded) {
        list.innerHTML = '<div class="empty-note">切换到假设 Tab 后才会加载分页数据。</div>';
        return;
      }

      if (!items.length) {
        list.innerHTML = '<div class="empty-note">当前筛选条件下暂无假设。</div>';
        return;
      }

      list.innerHTML = items.map((item, index) => `
        <div class="stack-item ${selectedKey === `hyp-${index}` ? 'selected' : ''}" data-index="${index}">
          <div class="item-topline">
            <div class="item-title">${window.DashboardShared.escapeHtml(item.prediction || item.display_title || '未命名假设')}</div>
            <span class="status-pill ${item.status || 'pending'}">${item.status || 'pending'}</span>
          </div>
          <div class="item-subtext">${window.DashboardShared.escapeHtml(item.story_title || '未归属叙事')}</div>
          <div class="chip-row">
            <span class="chip warn">${Math.round((item.probability || 0) * 100)}% 概率</span>
          </div>
        </div>
      `).join('') + `
        <div class="chip-row" style="margin-top:0.75rem; justify-content:center;">
          <button id="hypotheses-prev-page" ${hypothesesState.page <= 1 ? 'disabled' : ''}>上一页</button>
          <span class="chip">第 ${hypothesesState.page}/${totalPages} 页</span>
          <button id="hypotheses-next-page" ${hypothesesState.page >= totalPages ? 'disabled' : ''}>下一页</button>
        </div>
      `;

      list.querySelectorAll('[data-index]').forEach(element => {
        element.addEventListener('click', async () => {
          const item = items[Number(element.dataset.index)];
          selectedKey = `hyp-${element.dataset.index}`;
          renderHypothesesList();
          await hydrateStory(item.story_id);
          renderHypothesisView(item);
        });
      });

      document.getElementById('hypotheses-prev-page')?.addEventListener('click', () => {
        selectedKey = null;
        loadHypothesesPage(Math.max(hypothesesState.page - 1, 1));
      });
      document.getElementById('hypotheses-next-page')?.addEventListener('click', () => {
        selectedKey = null;
        loadHypothesesPage(Math.min(hypothesesState.page + 1, totalPages));
      });

      const first = items[0];
      if (first && !selectedKey) {
        selectedKey = 'hyp-0';
        hydrateStory(first.story_id).then(() => renderHypothesisView(first)).catch(() => renderHypothesisView(first));
      }
    }

    function renderHypothesisView(item) {
      const story = (simData.layer5_6 || []).find(entry => Number(entry.id || entry.story_id) === Number(item.story_id));
      const storyEvents = (simData.layer3 || []).filter(event => event.story_id === Number(item.story_id));

      document.getElementById('visual-title').textContent = '假设关联链路';
      document.getElementById('visual-meta').textContent = '用相关叙事的event链帮助理解这条假设从何而来。';
      document.getElementById('visual-host').innerHTML = storyEvents.length ? storyEvents.map((event, index) => `
        <div class="proto-row" style="margin-bottom:0.75rem;">
          <div class="eyebrow">Chain ${index + 1}</div>
          <div class="item-title">${window.DashboardShared.escapeHtml(event.display_title)}</div>
          <div class="proto-subline">${window.DashboardShared.escapeHtml(event.display_subtitle || '无附加信息')}</div>
        </div>
      `).join('') : '<div class="empty-note">没有可用的叙事event链。</div>';

      document.getElementById('inspector-title').textContent = '假设 Inspector';
      document.getElementById('inspector-meta').textContent = '假设本体、概率和所属叙事说明';
      document.getElementById('inspector-body').innerHTML = `
        <div class="stack-list">
          <div class="lineage-card">
            <h4>${window.DashboardShared.escapeHtml(item.prediction || item.display_title || '未命名假设')}</h4>
            <div class="summary-text">${window.DashboardShared.escapeHtml(item.story_summary || story?.display_summary || '暂无关联叙事摘要')}</div>
            <div class="chip-row">
              <span class="status-pill ${item.status || 'pending'}">${item.status || 'pending'}</span>
              <span class="chip warn">${Math.round((item.probability || 0) * 100)}% 概率</span>
            </div>
          </div>
          <div class="lineage-card">
            <h4>所属叙事</h4>
            <div class="summary-text">${window.DashboardShared.escapeHtml(item.story_title || story?.display_title || '未归属叙事')}</div>
            ${story ? `<div class="chip-row"><span class="chip info">${story.event_count || 0} 个事件</span><span class="chip">${storyHypothesisCount(story)} 条假设</span></div>` : ''}
          </div>
        </div>
      `;
    }

    function renderCurrentTab() {
      buildToolbar();
      if (currentTab === 'relationships') {
        const items = filteredRelationships();
        renderRelationshipList();
        const selectedItem = items.find((item, index) => relationshipKey(item, index) === selectedKey) || items[0];
        if (selectedItem) {
          renderRelationshipInspector(selectedItem);
          renderRelationshipGraph(selectedItem);
        } else {
          document.getElementById('visual-host').innerHTML = '<div class="empty-note">暂无关系图数据。</div>';
          document.getElementById('inspector-body').innerHTML = '<div class="empty-note">暂无关系可解释。</div>';
        }
      } else if (currentTab === 'stories') {
        renderStoriesList();
        if (!storiesState.loaded && !storiesState.loading) loadStoriesPage(storiesState.page);
      } else {
        renderHypothesesList();
        if (!hypothesesState.loaded && !hypothesesState.loading) loadHypothesesPage(hypothesesState.page);
      }
    }

    async function loadWorkspace(filters) {
      document.getElementById('relationship-list').innerHTML = '<div class="empty-note">关系列表加载中...</div>';
      const relationshipsResponse = await api.getDashboardRelationships(1, RELATIONSHIP_PAGE_SIZE, {
        ...filters,
        relationshipType: relationshipTypeFilter,
      });
      const relationshipItems = (relationshipsResponse?.data?.layer4 || []).map(formatEdge);
      const canonicalItems = relationshipsResponse?.data?.layer3 || [];
      simData = {
        ...(relationshipsResponse.data || {}),
        layer3: canonicalItems,
        layer4: relationshipItems,
        layer5_6: [],
      };

      storiesState = { ...storiesState, loaded: false, loading: false, page: 1, total: 0, items: [], error: null };
      hypothesesState = { ...hypothesesState, loaded: false, loading: false, page: 1, total: 0, items: [], error: null };

      const defaultEdge = relationshipItems[0] || null;
      graphState.cache.clear();
      graphState.mode = 'event';
      graphState.centerEventId = defaultEdge ? Number(defaultEdge.source_id) : null;
      graphState.nodes = canonicalItems;
      graphState.edges = relationshipItems;
      graphState.clusters = { nodes: [], edges: [] };
      graphState.pageInfo = { cursor: 0, next_cursor: 0, has_more: false };
      graphState.loadError = null;
      renderCurrentTab();
    }

    document.addEventListener('DOMContentLoaded', async () => {
      const params = new URLSearchParams(window.location.search);
      currentTab = params.get('tab') || 'relationships';
      document.querySelectorAll('[data-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === currentTab);
        button.addEventListener('click', () => {
          currentTab = button.dataset.tab;
          selectedKey = null;
          document.querySelectorAll('[data-tab]').forEach(item => item.classList.remove('active'));
          button.classList.add('active');
          renderCurrentTab();
        });
      });

      const filters = window.DashboardShared.bindGlobalFilters(loadWorkspace);
      await loadWorkspace(filters);
    });
  