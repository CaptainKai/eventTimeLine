/**
 * 新闻滚动组件
 */

class NewsScroll {
  constructor(containerId, apiClient, listContainerId = null) {
    this.container = document.getElementById(containerId);
    this.listContainer = listContainerId ? document.getElementById(listContainerId) : null;
    this.apiClient = apiClient;
    this.newsItems = [];
    this.currentIndex = 0;
    this.scrollInterval = null;
  }

  /**
   * 初始化组件
   */
  async init() {
    try {
      console.log('[NewsScroll] Initializing...');
      await this.loadNews();
      this.render();
      this.renderList();
      this.startAutoScroll();

      // 添加事件监听
      if (this.container) {
        this.container.addEventListener('mouseenter', () => this.stopAutoScroll());
        this.container.addEventListener('mouseleave', () => this.startAutoScroll());
      }
      
      // 开启独立的情报源实时刷新（每60秒一次）
      this.startLiveRefresh();
      
      console.log('[NewsScroll] Initialized successfully with', this.newsItems.length, 'items');

    } catch (error) {
      console.error('[NewsScroll] Initialization error:', error);
      this.renderError('加载新闻失败');
    }
  }


  /**
   * 加载新闻数据
   */
  async loadNews() {
    try {
      const response = await this.apiClient.getNews(1, 30); // 恢复获取30条
      const newNews = (response.data || []).map(news => ({
        id: news.id,
        title: news.title || '未命名新闻',
        source: news.source || '未知来源',
        timestamp: news.published_at,
        url: news.source_url || '#',
        news: news
      }));

      // 检查是否有实质性更新，避免闪烁
      if (JSON.stringify(newNews.map(n => n.id)) === JSON.stringify(this.newsItems.map(n => n.id))) {
        return false; // 无需更新
      }

      this.newsItems = newNews;
      return true; // 有更新
    } catch (error) {
      console.error('[NewsScroll] Failed to load news:', error);
      this.newsItems = this.generateFallbackNews();
      return true;
    }
  }


  /**
   * 渲染静态列表
   */
  renderList() {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = '';

    if (this.newsItems.length === 0) {
      this.listContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">暂无报道</div>';
      return;
    }

    this.newsItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'news-list-item';
      div.innerHTML = `
        <div class="news-title">${item.title}</div>
        <div class="news-meta">
          <span>${item.source}</span> • <span>${this.formatTime(item.timestamp)}</span>
        </div>
      `;
      div.addEventListener('click', () => this.showNewsDetails(item.news));
      this.listContainer.appendChild(div);
    });
  }

  /**
   * 渲染新闻滚动 (Ticker 样式)
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = '';
    
    // 强制容器只显示一行高度
    this.container.style.height = '40px';
    this.container.style.overflow = 'hidden';
    this.container.style.background = 'rgba(10, 14, 39, 0.6)';
    this.container.style.borderRadius = '4px';


    if (this.newsItems.length === 0) {
      this.container.innerHTML = '<div class="loading-mini" style="line-height:40px; text-align:center;"><span>同步中...</span></div>';
      return;
    }


    // 创建滚动容器
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'scroll-container';
    scrollContainer.style.position = 'relative';
    scrollContainer.style.transition = 'transform 0.5s ease-in-out';

    // 添加新闻项
    this.newsItems.forEach(news => {
      const item = document.createElement('div');
      item.className = 'news-ticker-item';
      item.style.height = '40px';
      item.style.lineHeight = '40px';
      item.style.padding = '0 15px';
      item.style.whiteSpace = 'nowrap';
      item.style.overflow = 'hidden';
      item.style.textOverflow = 'ellipsis';
      item.style.cursor = 'pointer';
      
      item.innerHTML = `
        <span style="color: #00d4ff; font-weight: bold; margin-right: 10px;">[${news.source}]</span>
        <span style="color: #fff;">${news.title}</span>
      `;
      
      item.addEventListener('click', () => this.showNewsDetails(news.news));
      scrollContainer.appendChild(item);
    });

    this.container.appendChild(scrollContainer);
  }

  /**
   * 开始自动滚动
   */
  startAutoScroll() {
    this.stopAutoScroll();
    this.scrollInterval = setInterval(() => this.scroll(), 5000);
  }

  /**
   * 停止自动滚动
   */
  stopAutoScroll() {
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
      this.scrollInterval = null;
    }
  }

  /**
   * 开启实时刷新（静默更新）
   */
  startLiveRefresh() {
    this.stopLiveRefresh();
    this.liveRefreshInterval = setInterval(() => {
      console.log('[NewsScroll] Live-refreshing data (5s interval)...');
      this.update();
    }, 5000); // 改为5秒刷新一次
  }

  /**
   * 停止实时刷新
   */
  stopLiveRefresh() {
    if (this.liveRefreshInterval) {
      clearInterval(this.liveRefreshInterval);
      this.liveRefreshInterval = null;
    }
  }

  /**
   * 滚动到下一条新闻
   */
  scroll() {
    if (this.newsItems.length <= 1) return;
    this.currentIndex = (this.currentIndex + 1) % this.newsItems.length;

    const scrollContainer = this.container.querySelector('.scroll-container');
    const itemHeight = 40; // 匹配 Ticker 高度
    const offset = -this.currentIndex * itemHeight;

    if (scrollContainer) {
      scrollContainer.style.transform = `translateY(${offset}px)`;
    }
  }


  /**
   * 处理新闻点击
   */
  handleNewsClick(news) {
    console.log('News clicked:', news);
    if (news.url && news.url !== '#') {
      window.open(news.url, '_blank');
    } else if (news.news) {
      // 显示新闻详情弹窗
      this.showNewsDetails(news.news);
    }
  }

  /**
   * 显示新闻详情弹窗
   */
  showNewsDetails(news) {
    // 创建详情弹窗
    const modal = document.createElement('div');
    modal.className = 'event-modal';
    modal.innerHTML = `
        <!-- 1. 新闻详情 -->
        <div class="news-content-section" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
          <h2 style="color: #2c3e50; margin-bottom: 10px;">${news.title || '未命名新闻'}</h2>
          <div style="display: flex; gap: 15px; color: #7f8c8d; font-size: 0.9em; margin-bottom: 15px;">
            <span>📅 ${this.formatDate(news.published_at)}</span>
            <span>🌐 来源: ${news.source || '未知'}</span>
            <span>📊 权重: ${news.importance?.toFixed(1) || 'N/A'}</span>
          </div>
          ${news.content ? `<div style="line-height: 1.6; color: #34495e;">${news.content.substring(0, 800)}${news.content.length > 800 ? '...' : ''}</div>` : ''}
          ${news.source_url ? `<div style="margin-top: 15px;"><a href="${news.source_url}" target="_blank" style="color: #3498db;">阅读原文 →</a></div>` : ''}
        </div>

        <!-- 2. 情报演进 (L1 -> L2 -> L3) -->
        <div id="intelligence-lineage" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 10px; border-left: 4px solid #3498db;">
          <h3 style="margin-top: 0; font-size: 1.1em; color: #2980b9;">🧬 情报血统 (L1 → L2 → L3)</h3>
          <div id="lineage-content">
            <div class="loading-mini" style="text-align: center; padding: 10px;">
              <div class="spinner-mini"></div>
              <span>正在追踪数据演进...</span>
            </div>
          </div>
        </div>

        <!-- 3. 解析方式指示器 -->
        <div id="parse-method-indicator" style="margin-bottom: 20px; padding: 10px 15px; background: #e8f5e9; border-radius: 8px; border-left: 4px solid #4caf50;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.2em;">⚙️</span>
            <div>
              <div style="font-weight: 600; color: #2e7d32; font-size: 0.95em;">解析方式</div>
              <div style="color: #666; font-size: 0.85em;">选择下方按钮进行解析测试</div>
            </div>
          </div>
        </div>

        <!-- 3. 解析模拟区域 (原本的区域) -->
        <div id="parse-results" class="parse-results" style="padding: 15px; background: #fff; border: 1px dashed #ccc; border-radius: 8px;">
          <h3 style="margin-top: 0; font-size: 1em; color: #7f8c8d;">🔬 即时解析测试 (Sandbox)</h3>
          <div id="parse-content" style="max-height: 200px; overflow-y: auto;">
             <div style="text-align: center; color: #999;">点击下方按钮进行解析测试</div>
          </div>
          <div id="parse-methods" style="margin-top: 10px;">
            <button id="parse-traditional" class="btn-mini">传统解析</button>
            <button id="parse-llm" class="btn-mini">LLM解析</button>
          </div>
        </div>

        <button class="modal-close-btn" onclick="this.closest('.event-modal').remove()">关闭</button>
      </div>
    `;
    document.body.appendChild(modal);

    // 加载情报血统
    this.loadLineage(news.id, modal);

    // 添加解析方法切换事件
    const btnTraditional = modal.querySelector('#parse-traditional');
    const btnLLM = modal.querySelector('#parse-llm');

    btnTraditional.addEventListener('click', () => {
      this.loadParseResults(news.id, modal, 'traditional');
    });

    btnLLM.addEventListener('click', () => {
      this.loadParseResults(news.id, modal, 'llm');
    });
  }

  /**
   * 加载解析结果
   */
  async loadParseResults(newsId, modal, method = 'traditional') {
    const contentDiv = modal.querySelector('#parse-content');
    const btnTraditional = modal.querySelector('#parse-traditional');
    const btnLLM = modal.querySelector('#parse-llm');

    // 显示加载状态
    contentDiv.innerHTML = `
      <div class="loading" style="text-align: center; padding: 20px;">
        <div class="spinner"></div>
        <span>正在解析...</span>
      </div>
    `;

    // 更新按钮状态
    if (btnTraditional) {
      btnTraditional.disabled = method === 'traditional';
    }
    if (btnLLM) {
      btnLLM.disabled = method === 'llm';
    }

    try {
      const response = await this.apiClient.parseNews(newsId, method);
      const parseResult = response.data.parse_result;
      const duration = response.data.parse_duration_ms;

      this.renderParseResults(contentDiv, parseResult, method, duration);
    } catch (error) {
      console.error('[NewsScroll] Parse error:', error);
      contentDiv.innerHTML = `
        <div style="color: red; padding: 15px;">
          <strong>解析失败:</strong> ${error.message || '未知错误'}
        </div>
      `;
    }

    // 恢复按钮状态
    if (btnTraditional) {
      btnTraditional.disabled = false;
    }
    if (btnLLM) {
      btnLLM.disabled = false;
    }
  }

  /**
   * 渲染解析结果
   */
  renderParseResults(contentDiv, parseResult, method, duration) {
    const methodNames = {
      'traditional': '传统解析器',
      'enhanced': '增强解析器',
      'llm': 'LLM解析器'
    };
    const methodDisplayName = methodNames[method] || method;

    let html = `
      <div style="font-size: 0.9em; color: #666; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; margin-right: 8px;">${methodDisplayName}</span>
          <span>耗时: ${duration}ms</span>
        </div>
      </div>
    `;

    const protoEvents = Array.isArray(parseResult?.proto_events) ? parseResult.proto_events : [];
    html += `
      <div style="margin-bottom: 10px;">
        <strong>原子事件数:</strong>
        <span style="font-weight: 700; color: ${protoEvents.length > 0 ? '#2e7d32' : '#c62828'};">
          ${protoEvents.length}
        </span>
      </div>
    `;

    if (protoEvents.length > 0) {
      html += `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${protoEvents.map((pe, idx) => {
            const eventType = pe?.metadata?.event_type || '';
            const actors = Array.isArray(pe?.metadata?.actors) ? pe.metadata.actors : [];
            const objects = Array.isArray(pe?.metadata?.objects) ? pe.metadata.objects : [];
            const conf = typeof pe?.confidence === 'number' ? pe.confidence : null;
            const confColor = conf !== null ? (conf > 0.7 ? '#2e7d32' : conf > 0.5 ? '#ef6c00' : '#c62828') : '#666';

            return `
              <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px; background: #fff;">
                <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:6px;">
                  <div style="font-weight:700; color:#34495e;">事件 #${idx + 1}</div>
                  <div style="font-size: 0.85em; color:${confColor}; font-weight:700;">
                    ${conf !== null ? `置信度 ${(conf * 100).toFixed(0)}%` : ''}
                  </div>
                </div>
                <div style="font-size:0.9em; line-height:1.5; color:#2c3e50;">
                  <div><strong>actor:</strong> ${pe.actor || '-'}</div>
                  <div><strong>action:</strong> ${pe.action || '-'}</div>
                  <div><strong>object:</strong> ${pe.object || '-'}</div>
                  ${pe.location ? `<div><strong>location:</strong> ${pe.location}</div>` : ''}
                  ${pe.time ? `<div><strong>time:</strong> ${pe.time}</div>` : ''}
                  ${eventType ? `<div><strong>event_type:</strong> <span style="background:#e3f2fd;color:#1565c0;padding:1px 6px;border-radius:999px;">${eventType}</span></div>` : ''}
                  ${(actors.length > 1 || objects.length > 1) ? `
                    <div style="margin-top:6px; font-size:0.85em; color:#666;">
                      ${actors.length > 0 ? `<div>actors: ${actors.join(', ')}</div>` : ''}
                      ${objects.length > 0 ? `<div>objects: ${objects.join(', ')}</div>` : ''}
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      html += `<div style="color:#999; font-size:0.9em;">未提取到原子事件</div>`;
    }

    contentDiv.innerHTML = html;
  }

  /**
   * 加载情报血统数据 (L2, L3)
   */
  async loadLineage(newsId, modal) {
    const lineageDiv = modal.querySelector('#lineage-content');
    try {
      const response = await this.apiClient.getNewsLineage(newsId);
      this.renderLineage(lineageDiv, response.data);
    } catch (error) {
      console.error('[NewsScroll] Lineage error:', error);
      lineageDiv.innerHTML = '<div style="color: #95a5a6; font-size: 0.9em;">暂无血统追溯数据（可能尚未完成分析）</div>';
    }
  }

  /**
   * 渲染情报血统
   */
  renderLineage(container, data) {
    const { proto_events, canonical_event_id } = data;

    if (!proto_events || proto_events.length === 0) {
      container.innerHTML = '<div style="color: #95a5a6; font-size: 0.9em;">系统未发现该新闻的原子事实</div>';
      return;
    }

    let html = `
      <div class="lineage-flow" style="display: flex; flex-direction: column; gap: 10px;">
        <div class="lineage-step">
          <div style="font-weight: bold; font-size: 0.85em; color: #7f8c8d; margin-bottom: 5px;">[L2] 提取的原子事实 (Proto-Events):</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${proto_events.map(pe => {
              // 构建显示文本，只显示有值的部分
              const parts = [];
              if (pe.actor_name) {
                parts.push(`<span style="color: #2980b9; font-weight: 600;">${pe.actor_name}</span>`);
              }
              if (pe.action_raw && pe.action_raw !== '发生') {
                parts.push(`<span style="color: #e67e22;">${pe.action_raw}</span>`);
              }
              if (pe.object_name) {
                parts.push(`<span style="color: #27ae60;">${pe.object_name}</span>`);
              }
              // 如果没有任何内容，显示默认信息
              if (parts.length === 0) {
                parts.push(`<span style="color: #95a5a6;">原子事件</span>`);
              }
              return `
                <div class="proto-badge" style="background: #fff; border: 1px solid #d1d8e0; padding: 5px 10px; border-radius: 6px; font-size: 0.85em; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                  ${parts.join(' ')}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="text-align: center; color: #bdc3c7; font-size: 1.2em;">↓</div>

        <div class="lineage-step">
          <div style="font-weight: bold; font-size: 0.85em; color: #7f8c8d; margin-bottom: 5px;">[L3] 坍缩至标准事件 (Canonical Event):</div>
          ${canonical_event_id ? `
            <div style="background: #e3f2fd; border: 1px solid #bbdefb; padding: 8px 12px; border-radius: 6px; display: inline-block;">
              <span style="color: #1976d2; font-weight: bold;">ID: ${canonical_event_id}</span>
              <span style="margin-left: 10px; font-size: 0.9em; color: #666;">(点击事件列表可查看更多)</span>
            </div>
          ` : `
            <div style="color: #e74c3c; font-size: 0.85em;">尚未归并至任何标准事件</div>
          `}
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * 格式化日期
   */
  formatDate(dateString) {
    if (!dateString) return '未知';

    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) {
      return `${minutes}分钟前`;
    } else if (hours < 24) {
      return `${hours}小时前`;
    } else {
      return `${days}天前`;
    }
  }

  /**
   * 更新数据
   */
  async update() {
    try {
      const hasChanged = await this.loadNews();
      if (!hasChanged) return; // 数据没变，不重新渲染
      
      console.log('[NewsScroll] Updating news feed (data changed)...');
      this.currentIndex = 0;
      this.render();
      this.renderList();
    } catch (error) {
      console.error('[NewsScroll] Update error:', error);
    }
  }


  /**
   * 销毁组件
   */
  destroy() {
    this.stopAutoScroll();
    this.stopLiveRefresh();
    this.container.innerHTML = '';
  }

}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NewsScroll;
}
