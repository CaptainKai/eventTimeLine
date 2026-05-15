/**
 * 事件关系网组件 (D3.js Force-directed graph)
 */

class EventGraph {
  constructor(containerId, apiClient) {
    this.container = document.getElementById(containerId);
    this.apiClient = apiClient;
    this.svg = null;
    this.simulation = null;
    this.filters = {};
  }

  async init(options = {}) {
    this.filters = options;
    await this.update();
  }

  async update() {
    this.showLoading();
    try {
      const response = await this.apiClient.getEventGraph(this.filters);
      const { nodes = [], links = [] } = response.data || {};

      if (nodes.length === 0) {
        this.container.innerHTML = '<div class="loading"><span>暂无事件关系数据</span></div>';
        return;
      }

      this.render(nodes, links);
    } catch (error) {
      console.error('[EventGraph] Load failed:', error);
    } finally {
      this.hideLoading();
    }
  }

  render(nodes, links) {
    this.container.innerHTML = '';
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 400;

    const svg = d3.select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, width, height])
      .style('display', 'block');

    const g = svg.append('g');

    // 缩放功能
    svg.call(d3.zoom().on('zoom', (event) => {
      g.attr('transform', event.transform);
    }));

    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = g.append('g')
      .attr('stroke', '#444')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', d => Math.max(1, (d.weight || 0.5) * 2))
      .attr('stroke', d => this.getLinkColor(d.type));

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(this.drag(this.simulation));

    node.append('circle')
      .attr('r', d => Math.sqrt(d.importance) * 5 || 5)
      .attr('fill', d => this.getColor(d.type));

    node.append('title')
      .text(d => `${d.name}\n类型: ${d.type}\n重要性: ${Number(d.importance || 0).toFixed(2)}`);

    // 添加节点标签，优化显示
    node.append('text')
      .attr('x', 12)
      .attr('y', 4)
      .text(d => this.truncateText(d.name, 15))
      .style('fill', '#e0e0e0')
      .style('font-size', '10px');

    // 添加边标签
    const linkText = g.append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .attr('class', 'link-label')
      .style('font-size', '9px')
      .style('fill', '#aaa')
      .style('pointer-events', 'none')
      .text(d => this.getLinkTypeName(d.type));

    // 添加节点点击事件
    node.on('click', (_event, d) => {
      this.handleNodeClick(d);
    });

    this.simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);

      // 更新边标签位置
      linkText
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);
    });

    // 添加图例
    this.addLegend();
  }

  drag(simulation) {
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
    return d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  }

  getColor(type) {
    const colors = {
      'Fight': '#ff4757',
      'Protest': '#ffa502',
      'Assault': '#eb4d4b',
      'Consult': '#70a1ff',
      'Make statement': '#2ed573'
    };
    return colors[type] || '#00d4ff';
  }

  getLinkColor(type) {
    const colors = {
      'parent_child': '#70a1ff',
      'cause_effect': '#ff6b81',
      'evolution': '#ffa502',
      'related': '#7bed9f',
      'trigger': '#ff9f43',
      'temporal': '#a55eea',
      'sub_event': '#2ed573'
    };
    return colors[type] || '#666';
  }

  getLinkTypeName(type) {
    const typeNames = {
      'parent_child': '父子',
      'cause_effect': '因果',
      'evolution': '演变',
      'related': '相关',
      'trigger': '触发',
      'temporal': '时间',
      'sub_event': '子事件'
    };
    return typeNames[type] || type;
  }

  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 1) + '…';
  }

  /**
   * 加载原子事件
   */
  async loadProtoEvents(eventId, modal) {
    const contentDiv = modal.querySelector('#proto-events-content');
    try {
      console.log('[EventGraph] Loading proto events for event:', eventId);
      const response = await this.apiClient.getProtoEventsForEvent(eventId);
      console.log('[EventGraph] Proto events API response:', response);
      const protoEvents = response.data || [];

      if (protoEvents.length === 0) {
        contentDiv.innerHTML = '<p style="text-align: center; color: #666;">暂无原子事件数据</p>';
        return;
      }

      let html = '<ul style="margin: 0; padding: 0; list-style: none;">';
      protoEvents.slice(0, 5).forEach(event => {
        html += `
          <li style="padding: 8px; border-bottom: 1px solid #ddd; margin-bottom: 5px;">
            <div style="font-weight: bold;">${this.truncateText(event.news_title || '', 50)}</div>
            <div style="font-size: 0.85em; color: #666; margin-top: 4px;">
              ${event.actor_raw || ''} ${event.action_raw || ''} ${event.object_raw || ''}
            </div>
            ${event.event_time ? `<div style="font-size: 0.8em; color: #999;">${new Date(event.event_time).toLocaleString()}</div>` : ''}
          </li>
        `;
      });

      if (protoEvents.length > 5) {
        html += `<li style="padding: 8px; text-align: center; color: #666;">+${protoEvents.length - 5} 个更多原子事件...</li>`;
      }

      html += '</ul>';
      contentDiv.innerHTML = html;
    } catch (error) {
      console.error('[EventGraph] Load proto events error:', error);
      contentDiv.innerHTML = `
        <div style="color: red; padding: 15px;">
          <strong>加载失败:</strong> ${error.message || '未知错误'}
        </div>
      `;
    }
  }

  /**
   * 加载相关新闻
   */
  async loadRelatedNews(eventId, modal) {
    const contentDiv = modal.querySelector('#news-content');
    try {
      const response = await this.apiClient.getNewsForEvent(eventId);
      const newsList = response.data || [];

      if (newsList.length === 0) {
        contentDiv.innerHTML = '<p style="text-align: center; color: #666;">暂无相关新闻</p>';
        return;
      }

      let html = '<ul style="margin: 0; padding: 0; list-style: none;">';
      newsList.slice(0, 5).forEach(news => {
        html += `
          <li style="padding: 8px; border-bottom: 1px solid #ddd; margin-bottom: 5px;">
            <div style="font-weight: bold;">${this.truncateText(news.title || '', 50)}</div>
            ${news.source ? `<div style="font-size: 0.8em; color: #999;">来源: ${news.source}</div>` : ''}
            ${news.publish_time ? `<div style="font-size: 0.8em; color: #999;">时间: ${new Date(news.publish_time).toLocaleString()}</div>` : ''}
          </li>
        `;
      });

      if (newsList.length > 5) {
        html += `<li style="padding: 8px; text-align: center; color: #666;">+${newsList.length - 5} 个更多新闻...</li>`;
      }

      html += '</ul>';
      contentDiv.innerHTML = html;
    } catch (error) {
      console.error('[EventGraph] Load related news error:', error);
      contentDiv.innerHTML = `
        <div style="color: red; padding: 15px;">
          <strong>加载失败:</strong> ${error.message || '未知错误'}
        </div>
      `;
    }
  }

  addLegend() {
    const legendData = [
      { type: 'parent_child', name: '父子关系' },
      { type: 'cause_effect', name: '因果关系' },
      { type: 'evolution', name: '演变关系' },
      { type: 'trigger', name: '触发关系' },
      { type: 'temporal', name: '时间关系' },
      { type: 'sub_event', name: '子事件' },
      { type: 'related', name: '相关关系' }
    ];

    const svg = d3.select(this.container).select('svg');

    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', 'translate(10, 10)');

    // 图例背景
    legend.append('rect')
      .attr('x', -5)
      .attr('y', -5)
      .attr('width', 150)
      .attr('height', legendData.length * 20 + 10)
      .attr('fill', 'rgba(10, 14, 39, 0.9)')
      .attr('stroke', 'rgba(255, 255, 255, 0.2)')
      .attr('rx', 6);

    legendData.forEach((item, index) => {
      const legendItem = legend.append('g')
        .attr('transform', `translate(0, ${index * 20})`);

      // 图例线条
      legendItem.append('line')
        .attr('x1', 0)
        .attr('y1', 8)
        .attr('x2', 25)
        .attr('y2', 8)
        .attr('stroke', this.getLinkColor(item.type))
        .attr('stroke-width', 2);

      // 图例文字
      legendItem.append('text')
        .attr('x', 30)
        .attr('y', 11)
        .text(item.name)
        .style('fill', '#e0e0e0')
        .style('font-size', '11px');
    });
  }

  showLoading() {
    this.container.innerHTML = '<div class="loading"><div class="spinner"></div><span>计算力导向图中...</span></div>';
  }

  hideLoading() {
    const l = this.container.querySelector('.loading');
    if (l) l.remove();
  }

  /**
   * 处理节点点击事件
   */
  async handleNodeClick(nodeData) {
    // 创建详情弹窗
    const modal = document.createElement('div');
    modal.className = 'event-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>${nodeData.name}</h2>
        <p>类型: ${nodeData.type}</p>
        <p>重要性: ${Number(nodeData.importance || 0).toFixed(2)}</p>
        <p>新闻数量: ${Number(nodeData.total_news_count || 0)}</p>
        ${nodeData.start_time ? `<p>时间: ${new Date(nodeData.start_time).toLocaleString()}</p>` : ''}

        <!-- 原子事件区域 -->
        <div id="proto-events" class="proto-events" style="margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
          <h3 style="margin-top: 0;">原子事件</h3>
          <div id="proto-events-content" style="max-height: 300px; overflow-y: auto;">
            <div class="loading" style="text-align: center; padding: 20px;">
              <div class="spinner"></div>
              <span>正在加载...</span>
            </div>
          </div>
        </div>

        <!-- 相关新闻区域 -->
        <div id="related-news" class="related-news" style="margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
          <h3 style="margin-top: 0;">相关新闻</h3>
          <div id="news-content" style="max-height: 300px; overflow-y: auto;">
            <div class="loading" style="text-align: center; padding: 20px;">
              <div class="spinner"></div>
              <span>正在加载...</span>
            </div>
          </div>
        </div>

        <button onclick="this.closest('.event-modal').remove()">关闭</button>
      </div>
    `;
    document.body.appendChild(modal);

    // 加载原子事件和相关新闻
    await Promise.all([
      this.loadProtoEvents(nodeData.id, modal),
      this.loadRelatedNews(nodeData.id, modal)
    ]);
  }

  /**
   * 加载解析结果
   */
  async loadParseResults(eventId, modal, method = 'traditional') {
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
      const response = await this.apiClient.parseEvent(eventId, method);
      const parseResult = response.data.parse_result;
      const duration = response.data.parse_duration_ms;

      this.renderParseResults(contentDiv, parseResult, method, duration);
    } catch (error) {
      console.error('[EventGraph] Parse error:', error);
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
    let html = `
      <div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">
        解析方法: ${method === 'traditional' ? '传统解析器' : (method === 'llm' ? 'LLM解析器' : method)} | 耗时: ${duration}ms
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
}
