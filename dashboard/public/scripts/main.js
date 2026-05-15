/**
 * 主应用程序入口 - Event Timeline Engine v2
 */

document.addEventListener('DOMContentLoaded', async () => {
  console.log('事件时间线引擎启动 - 增强版');

  // 初始化 API 客户端
  const apiClient = new ApiClient();

  // 初始化所有组件
  const newsScroll = new NewsScroll('news-scroll', apiClient, 'news-list');
  const eventList = new EventList('event-list', apiClient, newsScroll);
  const timelineChart = new TimelineChart('timeline-chart', apiClient);
  const eventGraph = new EventGraph('graph-container', apiClient);
  const eventSankey = new EventSankey('sankey-container', apiClient);
  const storyBoard = new StoryBoard('story-board-container', apiClient);
  const filters = new Filters('filters', apiClient, handleFiltersChange);

  // 初始化系统看板
  await initSystemStatus();

  // 初始化 UI
  await newsScroll.init();
  await filters.init();
  await storyBoard.init();

  // 初始加载数据
  updateAllComponents();
  
  // --- 自动刷新逻辑 ---
  let autoRefreshTimer = null;
  const refreshSelect = document.getElementById('refresh-interval');
  
  function setupAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
    
    const minutes = parseInt(refreshSelect.value, 10);
    if (minutes > 0) {
      console.log(`[App] Auto-refresh set to ${minutes} minutes`);
      autoRefreshTimer = setInterval(() => {
        console.log('[App] Auto-refresh triggering...');
        updateAllComponents();
      }, minutes * 60 * 1000);
    }
  }
  
  if (refreshSelect) {
    refreshSelect.addEventListener('change', setupAutoRefresh);
    setupAutoRefresh(); // 初始设置
  }

  // --- 绑定视图切换逻辑 ---
  const viewBtns = document.querySelectorAll('.view-btn');
  const viewPanes = document.querySelectorAll('.view-pane');

  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      
      // 更新按钮状态
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 切换视图面板
      viewPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `${targetView}-view`) {
          pane.classList.add('active');
          // 重新初始化/刷新特定视图
          refreshSpecificView(targetView);
        }
      });
    });
  });

  // --- 立即聚合按钮逻辑 ---
  const aggregateBtn = document.getElementById('trigger-aggregate');
  if (aggregateBtn) {
    aggregateBtn.addEventListener('click', async () => {
      aggregateBtn.disabled = true;
      const originalText = aggregateBtn.textContent;
      aggregateBtn.textContent = '聚合中...';
      
      try {
        const result = await apiClient.post('/events/aggregate');
        console.log('[App] Aggregation success:', result);
        showSuccess('聚合分析完成，正在刷新视图...');
        updateAllComponents();
      } catch (error) {
        showError('聚合失败: ' + error.message);
      } finally {
        aggregateBtn.disabled = false;
        aggregateBtn.textContent = originalText;
      }
    });
  }

  /**
   * 处理筛选条件变化
   */
  async function handleFiltersChange(filtersData) {
    updateAllComponents(filtersData);
  }

  /**
   * 刷新特定视图
   */
  async function refreshSpecificView(view) {
    const currentFilters = filters.getFilters();
    switch (view) {
      case 'timeline': await timelineChart.update(currentFilters); break;
      case 'graph': await eventGraph.update(currentFilters); break;
      case 'sankey': await eventSankey.update(currentFilters); break;
      case 'story': await storyBoard.refresh(); break;
    }
  }

  /**
   * 更新所有在线组件
   */
  async function updateAllComponents(filtersData = null) {
    const f = filtersData || filters.getFilters();
    
    // 基本列表和滚动
    eventList.applyFilters(f);
    newsScroll.update();
    
    // 只更新当前活跃的视图以节省资源
    const activeView = document.querySelector('.view-btn.active')?.dataset.view || 'timeline';
    refreshSpecificView(activeView);
  }

  function showSuccess(message) {
    // 借用 showError 的逻辑，但颜色不同
    showNotification(message, 'rgba(46, 213, 115, 0.9)');
  }

  function showError(message) {
    showNotification(message, 'rgba(255, 71, 87, 0.9)');
  }

  function showNotification(message, bgColor) {
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;top:20px;right:20px;background:${bgColor};color:white;padding:12px 20px;border-radius:8px;z-index:2000;box-shadow:0 4px 16px rgba(0,0,0,0.3);`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  /**
   * 初始化系统状态看板
   */
  async function initSystemStatus() {
    try {
      const config = await apiClient.getSystemConfig();
      const parserStatusEl = document.getElementById('parser-status');
      const refreshStatusEl = document.getElementById('refresh-status');

      if (parserStatusEl) {
        const parserNames = {
          'enhanced': '增强解析器',
          'traditional': '传统解析器',
          'llm': 'LLM解析器'
        };
        const parserName = parserNames[config.config?.defaultParser] || config.config?.defaultParser || '增强解析器';
        parserStatusEl.innerHTML = `解析器: <span style="color: #00d4ff;">${parserName}</span>`;
      }

      if (refreshStatusEl) {
        const interval = config.config?.refreshInterval || 15;
        refreshStatusEl.innerHTML = `刷新: <span style="color: #00d4ff;">${interval}分钟</span>`;
      }

      console.log('[App] System config loaded:', config.config);
    } catch (error) {
      console.error('[App] Failed to load system config:', error);
      const parserStatusEl = document.getElementById('parser-status');
      if (parserStatusEl) {
        parserStatusEl.textContent = '解析器: 未知';
      }
    }
  }
});
