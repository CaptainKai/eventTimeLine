import { query } from '../db/connection.mjs';

/**
 * 叙事管理引擎 (L5 Story Manager)
 */
export class StoryManager {
  
  /**
   * 基于事件关系自动发现并更新 Story 子图
   */
  async syncStories() {
    console.log('[StoryManager] Syncing stories from event graph...');
    
    // 1. 查找所有未分配 Story 但具有强因果关系的事件对
    const sql = `
      SELECT r.source_event_id, r.target_event_id, r.relationship_type, 
             e1.story_id as source_story_id, e2.story_id as target_story_id,
             e1.event_type as source_type, e2.event_type as target_type
      FROM event_relationships r
      JOIN events e1 ON r.source_event_id = e1.id
      JOIN events e2 ON r.target_event_id = e2.id
      WHERE r.relationship_type IN ('cause_effect', 'trigger', 'evolution')
      AND (e1.story_id IS NULL OR e2.story_id IS NULL OR e1.story_id != e2.story_id)
    `;
    
    const { rows: links } = await query(sql);
    
    for (const link of links) {
      await this.handleRelationshipLink(link);
    }
    
    // 2. 更新所有活跃 Story 的态势指标 (Escalation Level)
    await this.updateEscalationLevels();
    
    return links.length;
  }

  /**
   * 处理单条关系链导致的故事演进
   */
  async handleRelationshipLink(link) {
    const { source_event_id, target_event_id, source_story_id, target_story_id } = link;
    
    if (!source_story_id && !target_story_id) {
      // 场景 A: 两个孤立事件产生了关系 -> 创建新 Story
      await this.createNewStory(source_event_id, target_event_id);
    } 
    else if (source_story_id && !target_story_id) {
      // 场景 B: 现有 Story 扩张吸收新事件
      await this.assignEventToStory(target_event_id, source_story_id);
    }
    else if (!source_story_id && target_story_id) {
      // 场景 C: 现有 Story 追溯吸收前置事件
      await this.assignEventToStory(source_event_id, target_story_id);
    }
    else if (source_story_id !== target_story_id) {
      // 场景 D: 两个 Story 合并 (复杂场景，暂时取 source_story)
      await this.mergeStories(source_story_id, target_story_id);
    }
  }

  async createNewStory(e1, e2) {
    const { rows: events } = await query('SELECT event_type, normalized_data FROM events WHERE id IN ($1, $2)', [e1, e2]);
    const title = `叙事: ${events[0].event_type} 引发的演变`;
    
    const { rows } = await query(`
      INSERT INTO stories (title, theme, status, first_event_at)
      VALUES ($1, $2, 'active', NOW())
      RETURNING id
    `, [title, events[0].normalized_data?.topic || 'general']);
    
    const storyId = rows[0].id;
    await this.assignEventToStory(e1, storyId);
    await this.assignEventToStory(e2, storyId);
  }

  async assignEventToStory(eventId, storyId) {
    await query('UPDATE events SET story_id = $1 WHERE id = $2', [storyId, eventId]);
  }

  async mergeStories(story1Id, story2Id) {
    // 将 story2 的所有事件移交给 story1
    await query('UPDATE events SET story_id = $1 WHERE story_id = $2', [story1Id, story2Id]);
    // 标记 story2 为已关闭/合并
    await query("UPDATE stories SET status = 'merged' WHERE id = $1", [story2Id]);
  }

  /**
   * 计算并更新故事的升级级别 (Escalation)
   */
  async updateEscalationLevels() {
    const sql = `
      SELECT s.id, COUNT(e.id) as event_count, 
             AVG(e.current_importance) as avg_importance,
             MAX(e.updated_at) as last_update
      FROM stories s
      JOIN events e ON e.story_id = s.id
      WHERE s.status = 'active'
      GROUP BY s.id
    `;
    
    const { rows: stories } = await query(sql);
    
    for (const story of stories) {
      // 简单的升级逻辑：事件越多、重要性越高、更新越近，等级越高
      let level = 1;
      if (story.event_count > 5) level += 2;
      if (story.avg_importance > 0.7) level += 3;
      
      // 时间衰减逻辑 (如果超过 3 天没更新，等级下降)
      const hoursSinceUpdate = (new Date() - new Date(story.last_update)) / (1000 * 3600);
      if (hoursSinceUpdate > 72) level = Math.max(1, level - 2);
      
      await query('UPDATE stories SET escalation_level = $1, updated_at = NOW() WHERE id = $2', [
        Math.min(10, level), 
        story.id
      ]);
    }
  }
}

export const storyManager = new StoryManager();
