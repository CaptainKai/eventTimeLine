import { query } from '../db/connection.mjs';
import { extractProtoEventsWithLLM } from '../../apis/parsers/llm-parser.mjs'; // 借用 LLM 能力

/**
 * 预测推演引擎 (L6 Inference Engine)
 */
export class InferenceEngine {
  
  /**
   * 为活跃故事生成预测假设
   */
  async generateHypotheses() {
    console.log('[InferenceEngine] Generating hypotheses for active stories...');
    
    const activeStories = await this.getActiveStoriesWithContext();
    
    for (const story of activeStories) {
      await this.deduceStoryFuture(story);
    }
  }

  /**
   * 获取故事及其背景事件
   */
  async getActiveStoriesWithContext() {
    const sql = `
      SELECT s.*, 
             json_agg(json_build_object('type', e.event_type, 'actor1', a1.canonical_name, 'actor2', a2.canonical_name)) as events_chain
      FROM stories s
      JOIN events e ON e.story_id = s.id
      LEFT JOIN entity_mapping a1 ON e.actor1_id = a1.id
      LEFT JOIN entity_mapping a2 ON e.actor2_id = a2.id
      WHERE s.status = 'active'
      GROUP BY s.id
    `;
    const { rows } = await query(sql);
    return rows;
  }

  /**
   * 利用 LLM 进行逻辑推演
   */
  async deduceStoryFuture(story) {
    // 构造 Prompt
    const eventsStr = story.events_chain
      .map(e => `${e.actor1 || '未知'} 进行了 ${e.type} (对象: ${e.actor2 || '无'})`)
      .join(' -> ');

    const prompt = `
      Based on the following sequence of events in the story "${story.title}":
      ${eventsStr}
      
      What are the 2 most likely NEXT events that could happen in this narrative?
      Return a JSON object:
      {
        "predictions": [
          {
            "predicted_event": "Short description of the event",
            "reasoning": "Logical explanation",
            "probability": 0.0 to 1.0,
            "verification_signals": ["Subject", "Action", "Object"]
          }
        ]
      }
    `;

    try {
      // 注意：这里我们复用了 LLM 接口，但逻辑是推演
      // 为了演示，我们假设 callLLM 是通用的。在实际代码中应封装一个专门的推演 call
      const result = await this.callInferenceLLM(prompt);
      
      for (const pred of result.predictions || []) {
        await this.saveHypothesis(story.id, pred);
      }
    } catch (error) {
      console.error(`[InferenceEngine] Deduction failed for story ${story.id}:`, error.message);
    }
  }

  /**
   * 闭环验证：检查新原子事件是否验证了某个假设
   */
  async verifyHypotheses(protoEvent) {
    const sql = `
      SELECT h.* 
      FROM hypotheses h
      WHERE h.status = 'pending'
    `;
    const { rows: pending } = await query(sql);
    
    for (const hypo of pending) {
      if (this.isMatch(protoEvent, hypo)) {
        console.log(`[InferenceEngine] HYPOTHESIS VERIFIED: ${hypo.predicted_event}`);
        await query("UPDATE hypotheses SET status = 'verified', updated_at = NOW() WHERE id = $1", [hypo.id]);
        
        // 可选：触发一个“预警信号”
      }
    }
  }

  isMatch(proto, hypo) {
    const signals = hypo.evidence_signals || [];
    if (signals.length < 2) return false;
    
    const subjectMatch = proto.actor?.toLowerCase().includes(signals[0].toLowerCase());
    const actionMatch = proto.action?.toLowerCase().includes(signals[1].toLowerCase());
    
    return subjectMatch && actionMatch;
  }

  async saveHypothesis(storyId, pred) {
    const sql = `
      INSERT INTO hypotheses (story_id, predicted_event, reasoning, probability, evidence_signals, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      ON CONFLICT DO NOTHING
    `;
    await query(sql, [
      storyId, pred.predicted_event, pred.reasoning, 
      pred.probability, JSON.stringify(pred.verification_signals)
    ]);
  }

  /**
   * 占位符：实际应调用 llm-parser 中的 callLLM
   */
  async callInferenceLLM(prompt) {
    // 这里暂时硬编码返回，实际应调用真实的 LLM 接口
    return {
      predictions: [
        {
          predicted_event: "进一步的报复性制裁",
          reasoning: "历史模式显示在外交谴责后通常伴随制裁",
          probability: 0.75,
          verification_signals: ["政府", "制裁", "关税"]
        }
      ]
    };
  }
}

export const inferenceEngine = new InferenceEngine();
