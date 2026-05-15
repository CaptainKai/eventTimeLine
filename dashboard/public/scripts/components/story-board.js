/**
 * 故事看板组件 (L5 Stories & L6 Hypotheses)
 */

class StoryBoard {
  constructor(containerId, apiClient) {
    this.container = document.getElementById(containerId);
    this.apiClient = apiClient;
    this.stories = [];
  }

  /**
   * 初始化
   */
  async init() {
    try {
      await this.refresh();
    } catch (error) {
      console.error('[StoryBoard] Init error:', error);
      this.renderError();
    }
  }

  /**
   * 刷新数据
   */
  async refresh() {
    const response = await this.apiClient.getStories();
    this.stories = response.data || [];
    this.render();
  }

  /**
   * 渲染面板
   */
  render() {
    if (!this.container) return;

    if (this.stories.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state" style="padding: 40px; text-align: center; color: #7f8c8d;">
          <div style="font-size: 3em; margin-bottom: 10px;">📚</div>
          <h3>暂无活跃叙事 (Stories)</h3>
          <p>当多个事件建立因果关系后，系统会自动聚合叙事链条</p>
        </div>
      `;
      return;
    }

    let html = `
      <div class="story-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; padding: 10px;">
        ${this.stories.map(story => this.renderStoryCard(story)).join('')}
      </div>
    `;

    this.container.innerHTML = html;

    // 绑定点击事件
    this.container.querySelectorAll('.story-card').forEach(card => {
      card.addEventListener('click', () => {
        const storyId = card.getAttribute('data-id');
        this.showStoryDetails(storyId);
      });
    });
  }

  /**
   * 渲染单个故事卡片
   */
  renderStoryCard(story) {
    const escalationColor = this.getEscalationColor(story.escalation_level);
    return `
      <div class="story-card" data-id="${story.id}" style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); cursor: pointer; transition: transform 0.2s; border-top: 5px solid ${escalationColor};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <span style="background: ${escalationColor}15; color: ${escalationColor}; padding: 4px 10px; border-radius: 20px; font-size: 0.75em; font-weight: bold; text-transform: uppercase;">
            ${this.getEscalationLabel(story.escalation_level)}
          </span>
          <span style="color: #95a5a6; font-size: 0.8em;">#${story.id}</span>
        </div>
        <h3 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 1.2em;">${story.title}</h3>
        <p style="color: #7f8c8d; font-size: 0.9em; margin-bottom: 15px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${story.description || '暂无详细描述'}
        </p>
        <div style="display: flex; gap: 15px; font-size: 0.85em; color: #34495e; border-top: 1px solid #f1f2f6; padding-top: 12px;">
          <span>🖇️ ${story.event_count} 个事件</span>
          <span>📈 态势: ${story.escalation_level}</span>
        </div>
      </div>
    `;
  }

  /**
   * 显示故事详情弹窗 (L5 + L6)
   */
  async showStoryDetails(storyId) {
    const response = await this.apiClient.getStoryDetails(storyId);
    const story = response.data;

    const modal = document.createElement('div');
    modal.className = 'event-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 900px; width: 90%; max-height: 90vh; overflow-y: auto;">
        <div style="margin-bottom: 30px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
             <h2 style="margin: 0;">${story.title}</h2>
             <span style="background: ${this.getEscalationColor(story.escalation_level)}; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold;">
               ${this.getEscalationLabel(story.escalation_level)}
             </span>
          </div>
          <p style="color: #34495e; font-size: 1.1em; line-height: 1.6;">${story.description || ''}</p>
        </div>

        <div class="story-detail-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
          <!-- 事件链 -->
          <div class="event-chain-section">
            <h3 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">⛓️ 核心事件链 (L3-L4)</h3>
            <div style="position: relative; padding-left: 20px; margin-top: 20px;">
              <div style="position: absolute; left: 0; top: 5px; bottom: 5px; width: 2px; background: #dfe4ea;"></div>
              ${story.events.map(event => `
                <div style="position: relative; margin-bottom: 20px;">
                  <div style="position: absolute; left: -24px; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: #3498db; border: 2px solid white;"></div>
                  <div style="font-weight: bold; font-size: 0.9em; color: #2c3e50;">${event.title}</div>
                  <div style="font-size: 0.8em; color: #7f8c8d;">${new Date(event.start_time).toLocaleDateString()}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 推演假设 -->
          <div class="hypothesis-section">
            <h3 style="border-bottom: 2px solid #eee; padding-bottom: 10px;">🔮 潜态推演假设 (L6)</h3>
            <div style="margin-top: 20px;">
              ${story.hypotheses.length === 0 ? '<p style="color: #95a5a6;">暂无 AI 推演生成的预测假设</p>' : 
                story.hypotheses.map(h => `
                  <div style="background: ${h.status === 'verified' ? '#f1f9f1' : '#f8f9fa'}; padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid ${this.getHypothesisColor(h.status)};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                      <span style="font-weight: bold; font-size: 0.85em; color: ${this.getHypothesisColor(h.status)};">${h.status.toUpperCase()}</span>
                      <span style="font-size: 0.8em; color: #7f8c8d;">概率: ${Math.round(h.probability * 100)}%</span>
                    </div>
                    <div style="font-size: 0.95em; color: #2c3e50; line-height: 1.4;">${h.content}</div>
                    ${h.status === 'verified' ? `
                      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ced6e0; font-size: 0.8em; color: #27ae60;">
                        ✅ 预测已验证: 信号关联成功
                      </div>
                    ` : ''}
                  </div>
                `).join('')
              }
            </div>
          </div>
        </div>

        <div style="margin-top: 40px; text-align: right;">
          <button class="modal-close-btn" onclick="this.closest('.event-modal').remove()">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  getEscalationColor(level) {
    if (level >= 8) return '#e74c3c'; // 危机
    if (level >= 5) return '#f39c12'; // 预警
    return '#3498db'; // 关注
  }

  getEscalationLabel(level) {
    if (level >= 8) return 'CRITICAL (危机)';
    if (level >= 5) return 'ELEVATED (预警)';
    return 'OBSERVED (关注)';
  }

  getHypothesisColor(status) {
    switch (status) {
      case 'verified': return '#27ae60';
      case 'failed': return '#e74c3c';
      case 'pending': return '#f39c12';
      default: return '#95a5a6';
    }
  }

  renderError() {
    this.container.innerHTML = '<div style="color: red; padding: 20px;">加载叙事看板失败</div>';
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StoryBoard;
}
