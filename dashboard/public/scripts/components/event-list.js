/**
 * 事件列表组件
 */

class EventList {
  constructor(containerId, apiClient, newsScroll = null) {
    this.container = document.getElementById(containerId);
    this.apiClient = apiClient;
    this.newsScroll = newsScroll;
    this.events = [];
    this.currentPage = 1;
    this.limit = 20;
    this.filters = {};
  }

  /**
   * 初始化组件
   */
  async init(options = {}) {
    this.filters = options;
    await this.loadEvents();
    this.render();
  }

  /**
   * 加载事件数据
   */
  async loadEvents(page = 1) {
    try {
      this.showLoading();

      const response = await this.apiClient.getEvents(page, this.limit, this.filters);

      if (page === 1) {
        this.events = response.data || [];
      } else {
        this.events = [...this.events, ...(response.data || [])];
      }

      this.currentPage = page;

      return response;
    } catch (error) {
      console.error('[EventList] Failed to load events:', error);
      this.showError('加载事件失败');
      return null;
    } finally {
      this.hideLoading();
    }
  }

  /**
   * 渲染事件列表
   */
  render() {
    if (this.events.length === 0) {
      this.container.innerHTML = '<div class="loading"><span>暂无事件</span></div>';
      return;
    }

    // 清空容器
    this.container.innerHTML = '';

    // 渲染事件项
    this.events.forEach(event => {
      const eventItem = this.createEventItem(event);
      this.container.appendChild(eventItem);
    });

    // 添加载更多按钮
    this.addLoadMoreButton();
  }

  /**
   * 创建事件项
   */
  createEventItem(event) {
    const item = document.createElement('div');
    item.className = 'event-item';
    item.dataset.eventId = event.id;

    // 事件标题
    const title = document.createElement('div');
    title.className = 'event-title';
    // 使用 event_type 作为标题，如果没有则使用规范化数据中的描述或默认值
    const eventTitle = event.title ||
                      (event.normalized_data?.description || event.event_type) ||
                      '未命名事件';
    title.textContent = eventTitle;

    // 事件元数据
    const meta = document.createElement('div');
    meta.className = 'event-meta';

    const metaParts = [];
    if (event.actor1_name || event.actor2_name) {
      metaParts.push(`参与者: ${event.actor1_name || '未知'} ${event.actor2_name ? ' vs ' + event.actor2_name : ''}`);
    }

    if (event.start_time) {
      metaParts.push(`时间: ${this.formatDate(event.start_time)}`);
    }

    if (event.event_type) {
      metaParts.push(`类型: ${event.event_type}`);
    }

    if (event.location_name) {
      metaParts.push(`地点: ${event.location_name}`);
    }

    if (event.importance) {
      metaParts.push(`重要性: ${event.importance.toFixed(1)}`);
    }

    if (event.tone) {
      const toneClass = event.tone > 0 ? 'positive' : event.tone < 0 ? 'negative' : 'neutral';
      const toneLabel = event.tone > 0 ? '积极' : event.tone < 0 ? '消极' : '中性';
      metaParts.push(`情感: <span class="${toneClass}">${toneLabel} (${event.tone.toFixed(2)})</span>`);
    }

    meta.innerHTML = metaParts.join(' | ');

    // 事件描述
    item.appendChild(title);
    item.appendChild(meta);

    // 证据和时间表达
    const evidenceParts = [];
    if (event.normalized_data?.evidence_snippets?.length) {
      evidenceParts.push(`证据: ${event.normalized_data.evidence_snippets.join(' | ')}`);
    }
    if (event.normalized_data?.time_expressions?.length) {
      evidenceParts.push(`时间表达: ${event.normalized_data.time_expressions.join(' | ')}`);
    }
    if (evidenceParts.length) {
      const evidenceDiv = document.createElement('div');
      evidenceDiv.className = 'event-evidence';
      evidenceDiv.style.marginTop = '0.5rem';
      evidenceDiv.textContent = evidenceParts.join(' | ');
      item.appendChild(evidenceDiv);
    }

    if (event.description) {
      const description = document.createElement('div');
      description.className = 'event-description';
      description.style.marginTop = '0.5rem';
      description.textContent = event.description;
      item.appendChild(description);
    }

    // 添加点击事件
    item.addEventListener('click', () => this.handleEventClick(event, item));

    // 添加关联新闻面板
    const newsPanel = document.createElement('div');
    newsPanel.className = 'event-news-panel';
    item.appendChild(newsPanel);

    return item;
  }

  /**
   * 处理事件点击
   */
  async handleEventClick(event, itemElement) {
    const isExpanded = itemElement.classList.contains('expanded');

    // 如果已经展开，则折叠
    if (isExpanded) {
      itemElement.classList.remove('expanded');
      return;
    }

    // 展开并加载新闻
    itemElement.classList.add('expanded');

    const newsPanel = itemElement.querySelector('.event-news-panel');
    if (!newsPanel.dataset.loaded) {
      newsPanel.innerHTML = '<div class="loading-small">加载原子事件和关联新闻...</div>';
      try {
        // 并行获取原子事件和关联新闻
        const [protoEventsResponse, newsResponse] = await Promise.all([
          this.apiClient.getProtoEventsForEvent(event.id),
          this.apiClient.getNewsForEvent(event.id)
        ]);

        const protoEvents = protoEventsResponse.data || [];
        const newsItems = newsResponse.data || [];

        let contentHTML = '';

        // 显示原子事件（已去重）
        if (protoEvents.length > 0) {
          contentHTML += `
            <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
              <h4 style="margin: 0 0 10px 0; color: #34495e; font-size: 0.9em;">🔍 原子事件（${protoEvents.length}个，已去重）</h4>
              <div class="proto-events-list" style="display: flex; flex-wrap: wrap; gap: 8px;">
          `;

          protoEvents.forEach(pe => {
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
            if (parts.length === 0) {
              parts.push(`<span style="color: #95a5a6;">原子事件</span>`);
            }

            const locationStr = pe.location_name ? ` <span style="color: #95a5a6;">@${pe.location_name}</span>` : '';
            const timeStr = pe.event_time ? ` <span style="color: #7f8c8d; font-size: 0.8em;">(${new Date(pe.event_time).toLocaleDateString()})</span>` : '';

            contentHTML += `
              <div class="proto-badge" style="background: #fff; border: 1px solid #d1d8e0; padding: 5px 10px; border-radius: 6px; font-size: 0.85em; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                ${parts.join(' ')}${locationStr}${timeStr}
                ${pe.news_id ? ` <a href="#" style="color: #3498db; font-size: 0.7em;" onclick="event.preventDefault(); console.log('News ID: ${pe.news_id}')">[查看来源]</a>` : ''}
              </div>
            `;
          });

          contentHTML += '</div></div>';
        }

        // 显示关联新闻
        if (newsItems.length > 0) {
          contentHTML += `
            <div>
              <h4 style="margin: 0 0 10px 0; color: #34495e; font-size: 0.9em;">📰 关联新闻（${newsItems.length}条）</h4>
          `;

          newsItems.forEach(news => {
            contentHTML += `
              <div class="associated-news-item" style="padding: 8px 10px; margin-bottom: 8px; background: #f8f9fa; border-radius: 6px; cursor: pointer; transition: background 0.2s;">
                <span class="news-tag" style="background: #3498db; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7em; margin-right: 8px;">${news.source || '未知'}</span>
                <span style="color: #2c3e50; font-size: 0.85em;">${news.title}</span>
                <div style="font-size: 0.75rem; color: #707070; margin-top: 4px;">${this.formatDate(news.published_at)}</div>
              </div>
            `;
          });

          contentHTML += '</div>';
        }

        if (protoEvents.length === 0 && newsItems.length === 0) {
          contentHTML = '<div style="font-size: 0.8rem; color: #a0a0a0;">无关联原子事件和新闻</div>';
        }

        newsPanel.innerHTML = contentHTML;

        // 绑定新闻点击事件
        newsPanel.querySelectorAll('.associated-news-item').forEach((item, index) => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const news = newsItems[index];
            if (this.newsScroll) {
              this.newsScroll.showNewsDetails(news);
            } else {
              this.showNewsDetail(news.id);
            }
          });
        });

        newsPanel.dataset.loaded = 'true';
      } catch (error) {
        console.error('[EventList] Load details error:', error);
        newsPanel.innerHTML = '<div style="color: #ff4757;">加载失败</div>';
      }
    }
  }

  /**
   * 显示新闻详情
   */
  async showNewsDetail(newsId) {
    const modal = document.getElementById('news-modal');
    const titleEl = document.getElementById('news-title');
    const sourceEl = document.getElementById('news-source');
    const timeEl = document.getElementById('news-time');
    const contentEl = document.getElementById('news-content');

    // 显示模态框并置空
    modal.classList.add('active');
    titleEl.textContent = '加载中...';
    contentEl.textContent = '';

    try {
      const response = await this.apiClient.getNewsById(newsId);
      const news = response.data;
      
      titleEl.textContent = news.title;
      sourceEl.textContent = news.source || '未知';
      timeEl.textContent = this.formatDate(news.published_at);
      contentEl.innerHTML = (news.content || '无内容').replace(/\n/g, '<br>');

      // 绑定关闭事件
      document.getElementById('modal-close').onclick = () => {
        modal.classList.remove('active');
      };
      
      // 点击外部关闭
      modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('active');
      };
    } catch (error) {
      titleEl.textContent = '加载失败';
    }
  }

  /**
   * 显示事件详情
   */
  showEventDetails(event) {
    // 简单的详情弹窗
    const details = `
事件: ${event.title || event.event_type}
类型: ${event.event_type}
时间: ${this.formatDate(event.start_time)}
地点: ${event.location_name || '未知'}

参与者:
${event.actor1_name || '未知'}
${event.actor2_name ? event.actor2_name : ''}

重要性: ${event.current_importance?.toFixed(1) || '未知'}
情感: ${event.current_tone?.toFixed(2) || '未知'}

${event.description ? '\n描述: ' + event.description : ''}

总提及数: ${event.total_mentions || 0}
新闻数量: ${event.total_news_count || 0}
    `;

    // 实际应用中应该使用更美观的模态框
    console.log('Event details:', details);
    alert(details);
  }

  /**
   * 添加加载更多按钮
   */
  addLoadMoreButton() {
    const loadMoreBtn = document.createElement('div');
    loadMoreBtn.className = 'load-more';
    loadMoreBtn.style.padding = '1rem';
    loadMoreBtn.style.textAlign = 'center';
    loadMoreBtn.innerHTML = '<button style="width: 100%;">加载更多</button>';

    const button = loadMoreBtn.querySelector('button');
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = '加载中...';

      const response = await this.loadEvents(this.currentPage + 1);

      if (response && response.data && response.data.length > 0) {
        this.render();
      } else {
        button.textContent = '已加载全部';
        button.disabled = true;
      }
    });

    this.container.appendChild(loadMoreBtn);
  }

  /**
   * 显示加载状态
   */
  showLoading() {
    if (!this.container.querySelector('.loading')) {
      const loading = document.createElement('div');
      loading.className = 'loading';
      loading.innerHTML = '<div class="spinner"></div><span>加载中...</span>';
      this.container.innerHTML = '';
      this.container.appendChild(loading);
    }
  }

  /**
   * 隐藏加载状态
   */
  hideLoading() {
    const loading = this.container.querySelector('.loading');
    if (loading) {
      loading.remove();
    }
  }

  /**
   * 显示错误信息
   */
  showError(message) {
    const error = document.createElement('div');
    error.className = 'error';
    error.style.color = '#ff4757';
    error.textContent = message;
    this.container.appendChild(error);
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
   * 应用筛选条件
   */
  async applyFilters(options) {
    this.filters = options;
    this.currentPage = 1;
    await this.loadEvents(1);
    this.render();
  }

  /**
   * 重置筛选条件
   */
  async resetFilters() {
    this.filters = {};
    this.currentPage = 1;
    await this.loadEvents(1);
    this.render();
  }

  /**
   * 更新事件数据
   */
  async update() {
    await this.loadEvents(1);
    this.render();
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EventList;
}
