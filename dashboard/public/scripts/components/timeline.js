/**
 * 时间线图表组件
 */

class TimelineChart {
  constructor(containerId, apiClient) {
    this.container = document.getElementById(containerId);
    this.apiClient = apiClient;
    this.chart = null;
    this.series = [];
    this.timelineItems = [];
    this.filteredDate = null;
    this.filters = {};
  }

  async init(options = {}) {
    this.filters = options;
    await this.loadData();
    this.render();
  }

  async loadData() {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const [seriesResponse, itemsResponse] = await Promise.all([
        this.apiClient.getTimeline(
          this.filters.startDate || startDate,
          this.filters.endDate || endDate,
          'day',
          {
            type: this.filters.type,
            actor: this.filters.actor,
            location: this.filters.location,
          }
        ),
        this.apiClient.getTimelineItems(
          this.filters.startDate || startDate,
          this.filters.endDate || endDate,
          {
            type: this.filters.type,
            actor: this.filters.actor,
            location: this.filters.location,
          }
        ),
      ]);

      this.series = this.processSeries(seriesResponse.data);
      this.timelineItems = itemsResponse.data || [];
    } catch (error) {
      console.error('[TimelineChart] Failed to load data:', error);
      this.series = [];
      this.timelineItems = [];
    }
  }

  processSeries(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }

    const aggregated = {};
    rawData.forEach(item => {
      if (!aggregated[item.date]) {
        aggregated[item.date] = {
          date: item.date,
          event_count: 0,
          avg_sentiment: 0,
          total_mentions: 0,
        };
      }

      aggregated[item.date].event_count += Number(item.event_count || 0);
      aggregated[item.date].avg_sentiment = Number(item.avg_sentiment || 0);
      aggregated[item.date].total_mentions += Number(item.total_mentions || 0);
    });

    return Object.values(aggregated).sort((a, b) => a.date.localeCompare(b.date));
  }

  groupTimelineItems() {
    const grouped = {};
    const filteredItems = this.filteredDate
      ? this.timelineItems.filter(item => this.extractDate(item.start_time) === this.filteredDate)
      : this.timelineItems;

    filteredItems.forEach(item => {
      const date = this.extractDate(item.start_time);
      if (!grouped[date]) {
        grouped[date] = [];
      }

      grouped[date].push(item);
    });

    return Object.entries(grouped)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items }));
  }

  render() {
    this.destroy();
    this.container.innerHTML = '';

    const chartHost = document.createElement('div');
    chartHost.className = 'timeline-chart-host';

    const feedHost = document.createElement('div');
    feedHost.className = 'timeline-feed';

    this.container.appendChild(chartHost);
    this.container.appendChild(feedHost);

    this.renderChart(chartHost);
    this.renderFeed(feedHost);
  }

  renderChart(host) {
    if (!this.series.length) {
      host.innerHTML = '<div class="loading"><span>暂无时间序列数据</span></div>';
      return;
    }

    const canvas = document.createElement('canvas');
    host.appendChild(canvas);

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: this.series.map(item => item.date),
        datasets: [
          {
            label: '事件数量',
            data: this.series.map(item => item.event_count),
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0, 212, 255, 0.1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              afterBody: context => {
                const point = this.series.find(item => item.date === context[0].label);
                if (!point) return '';
                return `平均情感: ${point.avg_sentiment.toFixed(2)} | 总提及: ${point.total_mentions}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#a0a0a0' },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#a0a0a0' },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
        },
        onClick: (_, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            this.filteredDate = this.series[index].date;
            this.renderFeed(this.container.querySelector('.timeline-feed'));
          }
        },
      },
    });
  }

  renderFeed(host) {
    if (!host) return;

    const groups = this.groupTimelineItems();
    host.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'timeline-feed-header';
    header.innerHTML = `
      <strong>事件时间展示</strong>
      ${this.filteredDate ? `<button class="timeline-reset">清除日期筛选</button>` : ''}
    `;
    host.appendChild(header);

    const reset = header.querySelector('.timeline-reset');
    if (reset) {
      reset.addEventListener('click', () => {
        this.filteredDate = null;
        this.renderFeed(host);
      });
    }

    if (!groups.length) {
      host.innerHTML += '<div class="loading"><span>暂无可展示事件</span></div>';
      return;
    }

    groups.forEach(group => {
      const section = document.createElement('section');
      section.className = 'timeline-date-group';

      const title = document.createElement('h3');
      title.textContent = group.date;
      section.appendChild(title);

      group.items.forEach(item => {
        const card = document.createElement('article');
        card.className = 'timeline-event-card';
        const milestones = Array.isArray(item.milestones) ? item.milestones : [];
        const milestoneText = milestones
          .slice(0, 3)
          .map(milestone => `${this.extractDate(milestone.milestone_time)} ${milestone.title || milestone.milestone_type}`)
          .join(' | ');

        card.innerHTML = `
          <div class="timeline-event-head">
            <strong>${item.title || item.event_type}</strong>
            <span>${item.event_type}</span>
          </div>
          <div class="timeline-event-meta">
            <span>时间: ${this.formatDateTime(item.start_time)}</span>
            <span>参与者: ${item.actor1_name || '未知'}${item.actor2_name ? ` -> ${item.actor2_name}` : ''}</span>
            <span>地点: ${item.location_name || '未知'}</span>
            <span>新闻数: ${item.total_news_count || 0}</span>
          </div>
          <p>${item.description || '暂无描述'}</p>
          <div class="timeline-milestones">${milestoneText || '暂无里程碑'}</div>
        `;

        section.appendChild(card);
      });

      host.appendChild(section);
    });
  }

  extractDate(value) {
    return new Date(value).toISOString().split('T')[0];
  }

  formatDateTime(value) {
    return new Date(value).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async applyFilters(options) {
    this.filters = options;
    this.filteredDate = null;
    await this.loadData();
    this.render();
  }

  async resetFilters() {
    this.filters = {};
    this.filteredDate = null;
    await this.loadData();
    this.render();
  }

  async update(nextFilters = null) {
    if (nextFilters) {
      this.filters = nextFilters;
    }

    await this.loadData();
    this.render();
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TimelineChart;
}
