/**
 * 筛选组件
 */

class Filters {
  constructor(containerId, apiClient, onFiltersChange) {
    this.container = document.getElementById(containerId);
    this.apiClient = apiClient;
    this.onFiltersChange = onFiltersChange;
    this.filters = {};
  }

  /**
   * 初始化组件
   */
  async init() {
    this.render();
    await this.loadDynamicOptions();
    this.bindEvents();
  }

  /**
   * 渲染筛选界面
   */
  render() {
    // 清空容器
    this.container.innerHTML = `
      <div class="filter-group">
        <label for="event-type">事件类型:</label>
        <select id="event-type">
          <option value="">所有类型</option>
          <option value="Make statement">声明</option>
          <option value="Discuss material cooperation">讨论合作</option>
          <option value="Provide diplomatic aid">提供外交援助</option>
          <option value="Demand">要求</option>
          <option value="Disapprove">反对</option>
          <option value="Reject">拒绝</option>
          <option value="Threaten">威胁</option>
          <option value="Protest">抗议</option>
          <option value="Assault">攻击</option>
          <option value="Fight">战斗</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="topic">主题领域:</label>
        <select id="topic">
          <option value="">所有主题</option>
          <option value="politics">政治</option>
          <option value="diplomacy">外交</option>
          <option value="economy">经济</option>
          <option value="military">军事</option>
          <option value="market">市场/金融</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="actor">主要参与者:</label>
        <select id="actor">
          <option value="">所有参与者</option>
          <option value="USA">美国</option>
          <option value="CHN">中国</option>
          <option value="RUS">俄罗斯</option>
          <option value="UK">英国</option>
          <option value="FRA">法国</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="location">地点:</label>
        <select id="location">
          <option value="">所有地点</option>
          <option value="Washington">华盛顿</option>
          <option value="Beijing">北京</option>
          <option value="Moscow">莫斯科</option>
          <option value="London">伦敦</option>
          <option value="Paris">巴黎</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="start-date">开始日期:</label>
        <input type="date" id="start-date">
      </div>

      <div class="filter-group">
        <label for="end-date">结束日期:</label>
        <input type="date" id="end-date">
      </div>

      <div class="filter-group">
        <label for="refresh-interval">刷新频率:</label>
        <select id="refresh-interval">
          <option value="0">手动刷新</option>
          <option value="1">1 分钟</option>
          <option value="5">5 分钟</option>
          <option value="15" selected>15 分钟</option>
          <option value="30">30 分钟</option>
          <option value="60">1 小时</option>
        </select>
      </div>

      <div class="filter-group" style="justify-content: flex-end;">
        <button id="apply-filters">应用筛选</button>
        <button id="reset-filters">重置</button>
        <button id="trigger-aggregate">立即聚合分析</button>
      </div>
    `;
  }

  async loadDynamicOptions() {
    try {
      const [actors, locations] = await Promise.all([
        this.apiClient.getEntities('actor', 1, 50),
        this.apiClient.getEntities('location', 1, 50),
      ]);

      this.fillSelect('actor', actors.data || []);
      this.fillSelect('location', locations.data || []);
    } catch (error) {
      console.error('[Filters] Failed to load dynamic options:', error);
    }
  }

  fillSelect(selectId, items) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const defaultOption = select.querySelector('option')?.outerHTML || '<option value="">全部</option>';
    select.innerHTML = defaultOption;

    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.canonical_name;
      select.appendChild(option);
    });
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 应用筛选按钮
    const applyBtn = document.getElementById('apply-filters');
    applyBtn.addEventListener('click', () => this.applyFilters());

    // 重置按钮
    const resetBtn = document.getElementById('reset-filters');
    resetBtn.addEventListener('click', () => this.resetFilters());

    // 即时筛选（可选）
    ['event-type', 'topic', 'actor', 'location', 'start-date', 'end-date'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => this.applyFilters());
      }
    });
  }

  /**
   * 应用筛选条件
   */
  applyFilters() {
    const filters = {
      type: document.getElementById('event-type').value || null,
      topic: document.getElementById('topic').value || null,
      actor: document.getElementById('actor').value || null,
      location: document.getElementById('location').value || null,
      startDate: document.getElementById('start-date').value || null,
      endDate: document.getElementById('end-date').value || null,
    };

    // 清理空值
    this.filters = Object.fromEntries(
      Object.entries(filters).filter(([_, value]) => value !== null && value !== '')
    );

    // 通知父组件
    if (this.onFiltersChange) {
      this.onFiltersChange(this.filters);
    }
  }

  /**
   * 重置筛选条件
   */
  resetFilters() {
    // 重置表单
    document.getElementById('event-type').value = '';
    document.getElementById('topic').value = '';
    document.getElementById('actor').value = '';
    document.getElementById('location').value = '';
    document.getElementById('start-date').value = '';
    document.getElementById('end-date').value = '';

    // 清空筛选条件
    this.filters = {};

    // 通知父组件
    if (this.onFiltersChange) {
      this.onFiltersChange(this.filters);
    }
  }

  /**
   * 获取当前筛选条件
   */
  getFilters() {
    return { ...this.filters };
  }

  /**
   * 设置筛选条件（外部调用）
   */
  setFilters(filters) {
    this.filters = { ...filters };
    this.updateUI();
  }

  /**
   * 更新UI显示
   */
  updateUI() {
    document.getElementById('event-type').value = this.filters.type || '';
    document.getElementById('topic').value = this.filters.topic || '';
    document.getElementById('actor').value = this.filters.actor || '';
    document.getElementById('location').value = this.filters.location || '';
    document.getElementById('start-date').value = this.filters.startDate || '';
    document.getElementById('end-date').value = this.filters.endDate || '';
  }

  /**
   * 启用/禁用筛选
   */
  setDisabled(disabled) {
    ['event-type', 'topic', 'actor', 'location', 'start-date', 'end-date', 'apply-filters', 'reset-filters', 'trigger-aggregate'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.disabled = disabled;
      }
    });
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Filters;
}
