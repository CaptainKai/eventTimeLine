


    const api = window.apiClient;
    const CANONICAL_PAGE_SIZE = 50;
    let simData = null;
    let mergedEvents = [];
    let selectedEventId = null;
    let focusNotice = '';

    function goToNewsPage(newsId) {
      const params = new URLSearchParams({ ...window.DashboardShared.readFiltersFromDom(), newsId });
      window.location.href = `/proto-events.html?${params.toString()}`;
    }

    function getLocalState() {
      return {
        actorKeyword: (document.getElementById('local-actor-filter').value || '').trim().toLowerCase(),
        locationKeyword: (document.getElementById('local-location-filter').value || '').trim().toLowerCase(),
        storyOnly: document.getElementById('local-story-only').checked,
        minRelationships: Number(document.getElementById('local-min-rel').value || 0),
      };
    }

    function toCount(value) {
      const parsed = Number(value || 0);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function normalizeCanonicalEvent(event = {}) {
      const existingGroup = event.group || {};
      const protoEvents = Array.isArray(existingGroup.proto_events) ? existingGroup.proto_events : [];
      const sourceNewsCount = toCount(event.source_news_count ?? existingGroup.source_news_count ?? event.total_news_count);
      const protoEventCount = toCount(event.proto_event_count ?? existingGroup.proto_event_count);
      return {
        ...event,
        id: Number(event.id),
        source_news_count: sourceNewsCount,
        proto_event_count: protoEventCount,
        relationship_count: toCount(event.relationship_count),
        hypothesis_count: toCount(event.hypothesis_count),
        evidence_loaded: Boolean(event.evidence_loaded || existingGroup.evidence_loaded || protoEvents.length),
        group: {
          ...existingGroup,
          canonical_event_id: Number(existingGroup.canonical_event_id || event.id),
          source_news_count: sourceNewsCount,
          proto_event_count: protoEventCount,
          proto_events: protoEvents,
          evidence_loaded: Boolean(existingGroup.evidence_loaded || event.evidence_loaded || protoEvents.length),
        },
      };
    }

    function normalizeCanonicalEvents(events = []) {
      return (events || []).map(normalizeCanonicalEvent).filter(event => Number.isInteger(event.id) && event.id > 0);
    }

    function eventGroup(event = {}) {
      if (!event.group) {
        Object.assign(event, normalizeCanonicalEvent(event));
      }
      return event.group || { source_news_count: 0, proto_event_count: 0, proto_events: [] };
    }

    function mergeLayerData(data) {
      const layer2Map = new Map((data.layer2 || []).map(item => [item.canonical_event_id, item]));
      return normalizeCanonicalEvents(data.layer3 || [])
        .map(event => normalizeCanonicalEvent({
          ...event,
          group: layer2Map.get(event.id) || event.group,
        }))
        .sort((a, b) => {
          const groupA = eventGroup(a);
          const groupB = eventGroup(b);
          const scoreA = ((a.source_news_count || groupA.source_news_count || 0) * 3) + ((a.relationship_count || 0) * 2);
          const scoreB = ((b.source_news_count || groupB.source_news_count || 0) * 3) + ((b.relationship_count || 0) * 2);
          return scoreB - scoreA;
        });
    }

    function localFilterEvents(events) {
      const state = getLocalState();
      return events.filter(event => {
        const actorText = `${event.actor1_name || ''} ${event.actor2_name || ''}`.toLowerCase();
        const locationText = (event.location_name || '').toLowerCase();
        if (state.actorKeyword && !actorText.includes(state.actorKeyword)) return false;
        if (state.locationKeyword && !locationText.includes(state.locationKeyword)) return false;
        if (state.storyOnly && !event.story_id) return false;
        if ((event.relationship_count || 0) < state.minRelationships) return false;
        return true;
      });
    }

    function renderCanonicalList() {
      const list = document.getElementById('canonical-list');
      const visibleEvents = localFilterEvents(mergedEvents);
      const returnedCount = simData?.summary?.returned_canonical_events || mergedEvents.length;
      const totalCount = simData?.summary?.total_canonical_events || returnedCount;
      const noticeText = focusNotice ? ` - ${focusNotice}` : '';

      document.getElementById('canonical-list-meta').textContent = `${visibleEvents.length} / ${mergedEvents.length} 个标准事件可见${noticeText}`;
      document.getElementById('canonical-stats-chip').textContent = `${returnedCount} / ${totalCount} 个标准事件`;

      if (!visibleEvents.length) {
        list.innerHTML = '<div class="empty-note">No 个标准事件 match current filters.</div>';
        return;
      }

      list.innerHTML = visibleEvents.map(event => {
        const group = eventGroup(event);
        return `
          <div class="stack-item ${selectedEventId === event.id ? 'selected' : ''}" data-event-id="${event.id}">
            <div class="item-topline">
              <div class="item-title">${window.DashboardShared.escapeHtml(window.DashboardShared.truncate(event.display_title, 86))}</div>
              <span class="chip info">${window.DashboardShared.escapeHtml(event.event_type || '事件')}</span>
            </div>
            <div class="item-subtext">${window.DashboardShared.escapeHtml(window.DashboardShared.truncate(event.display_summary, 110))}</div>
            <div class="chip-row">
              <span class="chip success">${group.source_news_count || 0} 条新闻</span>
              <span class="chip">${group.proto_event_count || 0} 个原子事件</span>
              <span class="chip warn">${event.relationship_count || 0} 条关系</span>
              ${event.is_focus ? '<span class="chip success">目标事件</span>' : ''}
              ${event.story_name ? `<span class="chip">${window.DashboardShared.escapeHtml(event.story_name)}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('[data-event-id]').forEach(element => {
        element.addEventListener('click', () => selectEvent(Number(element.dataset.eventId)));
      });
    }

    function renderEvidence(event) {
      const group = eventGroup(event);
      const protoEvents = Array.isArray(group.proto_events) ? group.proto_events : [];
      if (!event.evidence_loaded && protoEvents.length === 0) {
        document.getElementById('evidence-title').textContent = '原子事件证据';
        document.getElementById('evidence-groups').innerHTML = '<div class="empty-note">证据加载中...</div>';
        document.getElementById('source-title').textContent = '来源新闻';
        document.getElementById('source-news-list').innerHTML = '<div class="empty-note">来源加载中...</div>';
        loadEventEvidence(event.id).catch(error => {
          console.error('[Dashboard] Failed to load event evidence:', error);
          document.getElementById('evidence-groups').innerHTML = '<div class="empty-note">证据加载失败。</div>';
          document.getElementById('source-news-list').innerHTML = '<div class="empty-note">来源加载失败。</div>';
        });
        return;
      }

      const groups = {};
      protoEvents.forEach((proto, index) => {
        const key = proto.news_id || `proto-${proto.id || index}`;
        if (!groups[key]) {
          groups[key] = {
            news_id: proto.news_id,
            title: proto.news_title,
            source: proto.news_source,
            published_at: proto.news_published_at,
            proto_events: [],
          };
        }
        groups[key].proto_events.push(proto);
      });

      const orderedGroups = Object.values(groups).sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
      document.getElementById('evidence-title').textContent = `原子事件证据 (${group.proto_event_count || protoEvents.length || 0})`;
      if (!orderedGroups.length) {
        document.getElementById('evidence-groups').innerHTML = '<div class="empty-note">当前事件暂无可展示的原子事件证据。</div>';
        document.getElementById('source-title').textContent = '来源新闻 (0)';
        document.getElementById('source-news-list').innerHTML = '<div class="empty-note">当前事件暂无来源新闻。</div>';
        return;
      }
      document.getElementById('evidence-groups').innerHTML = orderedGroups.map(group => `
        <div class="proto-row">
          <div class="item-topline">
            <div class="item-title">${window.DashboardShared.escapeHtml(window.DashboardShared.truncate(group.title || '未知新闻', 80))}</div>
            <span class="chip">${window.DashboardShared.escapeHtml(group.source || '未知')}</span>
          </div>
          <div class="proto-subline">${window.DashboardShared.escapeHtml(window.DashboardShared.formatDate(group.published_at))}</div>
          <div class="proto-grid" style="margin-top:0.7rem;">
            ${group.proto_events.map(proto => `
              <div class="proto-row" style="background: rgba(255,255,255,0.02);">
                <div class="proto-mainline">${window.DashboardShared.escapeHtml([
                  proto.actor_name || proto.actor_raw || '未知 actor',
                  proto.action_raw || '发生',
                  proto.object_name || proto.object_raw || '',
                ].filter(Boolean).join(' '))}</div>
                <div class="proto-subline">${window.DashboardShared.escapeHtml(proto.location_name || proto.location_raw || proto.event_time || '无附加信息')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

      document.getElementById('source-title').textContent = `来源新闻 (${orderedGroups.length})`;
      document.getElementById('source-news-list').innerHTML = orderedGroups.map(group => `
        <div class="stack-item" onclick="goToNewsPage(${group.news_id})">
          <div class="item-topline">
            <div class="item-title">${window.DashboardShared.escapeHtml(window.DashboardShared.truncate(group.title || '未知新闻', 86))}</div>
            <span class="chip info">${window.DashboardShared.escapeHtml(group.source || '未知')}</span>
          </div>
          <div class="item-subtext">${window.DashboardShared.escapeHtml(window.DashboardShared.formatDate(group.published_at))}</div>
        </div>
      `).join('');
    }

    async function loadEventEvidence(eventId) {
      const response = await api.getEventAggregationDetail(eventId);
      const event = mergedEvents.find(item => item.id === eventId);
      if (!event || selectedEventId !== eventId) return;
      const groups = response.data || [];
      const protoEvents = groups.flatMap(group => (group.proto_events || []).map(proto => ({
        ...proto,
        news_id: group.news_id,
        news_title: group.news_title,
        news_source: group.news_source,
        news_published_at: group.news_published_at,
      })));
      const sourceNewsCount = response.total_news || groups.length;
      const protoEventCount = response.total_proto_events || protoEvents.length;
      event.evidence_loaded = true;
      event.source_news_count = sourceNewsCount;
      event.proto_event_count = protoEventCount;
      event.group = {
        ...eventGroup(event),
        canonical_event_id: event.id,
        proto_event_count: protoEventCount,
        source_news_count: sourceNewsCount,
        proto_events: protoEvents,
        evidence_loaded: true,
      };
      renderCanonicalList();
      renderEvidence(event);
    }

    function selectEvent(eventId) {
      selectedEventId = eventId;
      renderCanonicalList();

      const event = mergedEvents.find(item => item.id === eventId);
      if (!event) return;
      const group = eventGroup(event);

      document.getElementById('event-title').textContent = event.display_title;
      document.getElementById('event-subtitle').textContent = event.display_subtitle || '无附加信息';
      document.getElementById('event-summary').textContent = event.display_summary || '暂无事件摘要';
      document.getElementById('event-chips').innerHTML = `
        <span class="chip info">${window.DashboardShared.escapeHtml(event.event_type || '事件')}</span>
        <span class="chip success">${group.source_news_count || 0} 条来源新闻</span>
        <span class="chip">${group.proto_event_count || 0} 个原子事件</span>
        <span class="chip warn">${event.relationship_count || 0} 条关系</span>
        ${event.is_focus ? '<span class="chip success">目标事件</span>' : ''}
        ${event.story_name ? `<span class="chip">${window.DashboardShared.escapeHtml(event.story_name)}</span>` : ''}
      `;

      renderEvidence(event);
    }

    async function loadCanonicalView(filters) {
      document.getElementById('canonical-list').innerHTML = '<div class="empty-note">标准事件加载中...</div>';
      const params = new URLSearchParams(window.location.search);
      const requestedEventId = Number(params.get('eventId') || 0);
      const requestOptions = requestedEventId ? { ...filters, eventId: requestedEventId } : filters;
      const response = await api.getDashboardCanonicalEvents(1, CANONICAL_PAGE_SIZE, requestOptions);
      mergedEvents = normalizeCanonicalEvents(response.data || []);
      focusNotice = '';
      if (requestedEventId) {
        const hasRequestedEvent = mergedEvents.some(item => item.id === requestedEventId);
        if (response.meta?.focus_in_filter === false) {
          focusNotice = `目标事件 #${requestedEventId} 不在当前筛选范围`;
        } else if (hasRequestedEvent || response.meta?.focus_included) {
          focusNotice = `已定位目标事件 #${requestedEventId}`;
        } else {
          focusNotice = `未能定位目标事件 #${requestedEventId}`;
        }
      }
      simData = {
        summary: {
          total_canonical_events: response.pagination?.total || mergedEvents.length,
          returned_canonical_events: mergedEvents.length,
        },
        layer3: mergedEvents,
        layer2: [],
      };
      renderCanonicalList();

      const firstEventId = localFilterEvents(mergedEvents)[0]?.id || null;
      if (requestedEventId && mergedEvents.some(item => item.id === requestedEventId)) {
        selectEvent(requestedEventId);
      } else if (firstEventId) {
        selectEvent(firstEventId);
      } else {
        document.getElementById('event-title').textContent = '当前没有标准事件';
        document.getElementById('event-subtitle').textContent = '';
        document.getElementById('event-summary').textContent = requestedEventId && focusNotice ? focusNotice : '请调整筛选条件。';
        document.getElementById('event-chips').innerHTML = '';
        document.getElementById('evidence-groups').innerHTML = '';
        document.getElementById('source-news-list').innerHTML = '';
      }
    }

    document.addEventListener('DOMContentLoaded', async () => {
      const filters = window.DashboardShared.bindGlobalFilters(loadCanonicalView);
      ['local-actor-filter', 'local-location-filter', 'local-story-only', 'local-min-rel'].forEach(id => {
        document.getElementById(id).addEventListener('input', renderCanonicalList);
        document.getElementById(id).addEventListener('change', renderCanonicalList);
      });
      await loadCanonicalView(filters);
    });
  