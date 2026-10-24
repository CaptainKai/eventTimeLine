/**
 * LLM 原子事件提取器 (LLM ProtoEvent Extraction Engine)
 *
 * 三阶段架构：
 * Stage 1: 事件提取（原始实体，不归一化）
 * Stage 2a: 实体归一化（独立调用 LLM）
 * Stage 2b: 动作归一化（独立调用 LLM，可与 2a 并行）
 * Stage 3: 结果合并（纯代码）
 */

import { cleanText } from '../utils/parser.mjs';
import { saveLlmParseResult } from '../../lib/db/llm-parse-queries.mjs';
import {
  EVENT_TYPES,
  getActionTaxonomyText,
  ALL_STANDARD_ACTIONS,
  ACTION_SYNONYM_MAP
} from '../../lib/config/event-taxonomy.mjs';
import { socksFetch } from '../../lib/utils/socks-fetch.mjs';

/**
 * 通用 OpenAI 兼容请求
 */
export function resolveChatCompletionsUrl(value) {
  const rawValue = String(value || 'http://127.0.0.1:3100/v1').trim().replace('0.0.0.0', '127.0.0.1');
  const normalizedValue = rawValue.replace(/\/+$/, '').replace(/\/chat\/completio(?:n)?$/i, '/chat/completions');

  if (/\/chat\/completions$/i.test(normalizedValue)) return normalizedValue;
  if (/\/v\d+$/i.test(normalizedValue)) return `${normalizedValue}/chat/completions`;
  return `${normalizedValue}/v1/chat/completions`;
}

export async function callLLM(prompt, retries = 2) {
  const apiKey = process.env.OPENAI_API_KEY || 'sk-allproxy-default';
  const endpoint = resolveChatCompletionsUrl(process.env.OPENAI_BASE_URL);
  const model = process.env.OPENAI_MODEL || 'deepseek/deepseek-chat';

  const requestBody = {
    model: model,
    messages: [
      { role: 'system', content: 'You are an expert intelligence analyst. Extract atomic facts (ProtoEvents) from news text.' },
      { role: 'user', content: prompt }
    ],
    stream: false, // 显式禁用流模式，确保解析器获得完整 JSON 字符串
    max_tokens: 12000 // 增加 token 限制，防止长 JSON 被截断
  };

  for (let attempt = 1; attempt <= 1 + retries; attempt++) {
    try {
      console.log(`[LLM-Parser] Requesting ${model} at ${endpoint} (attempt ${attempt})`);

      const response = await socksFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        timeout: 300
      });

      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.text();
        } catch {
          errorBody = 'Unable to read error body';
        }
        throw new Error(`LLM API returned ${response.status}: ${errorBody}`);
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('[LLM Parser] Unexpected API response:', JSON.stringify(data).substring(0, 500));
        throw new Error('Invalid response format from LLM API');
      }

      return extractJSON(data.choices[0].message.content);
    } catch (error) {
      if (attempt <= retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.warn(`[LLM Parser] Attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`[LLM Parser] All ${attempt} attempts failed:`, error);
        throw error;
      }
    }
  }
}

/**
 * 容错 JSON 解析
 * 处理 LLM 返回的 markdown 代码块、尾逗号等问题
 */
export function extractJSON(text) {
  if (!text) return null;

  let jsonStr = text.trim();

  // 去除 markdown 代码块标记
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\s*/i, '').replace(/\s*```$/, '');
  }

  // 找到第一个 { 和最后一个 }
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }

  // 修复尾逗号
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('[LLM Parser] JSON parse failed:', parseError.message);
    console.error('[LLM Parser] Raw response:', jsonStr.substring(0, 200));
    return null;
  }
}

/**
 * 主函数：提取原子事件
 * 使用三阶段 LLM Pipeline
 */
export async function extractProtoEventsWithLLM(title, content, options = {}) {
  const { newsId = null, saveResult = true } = options;
  const startTime = Date.now();
  console.log('[LLM Parser] Starting three-stage extraction...');

  try {
    // Stage 1: 提取原始事件
    const stage1Result = await extractRawEvents(title, content);

    if (!stage1Result || stage1Result.length === 0) {
      console.log('[LLM Parser] No events extracted in Stage 1');
      return buildEmptyResult(newsId, startTime, saveResult, title, content);
    }

    // 收集所有实体和动作（去重）
    const allEntities = collectUniqueEntities(stage1Result);
    const allActions = collectUniqueActions(stage1Result);

    // Stage 2a & 2b: 并行调用实体归一化和动作归一化
    const [normalizedEntities, normalizedActions] = await Promise.all([
      normalizeEntitiesStage(allEntities, { newsId }),
      normalizeActionsStage(allActions, { newsId })
    ]);

    // Stage 3: 合并结果
    const protoEvents = mergeResults(stage1Result, normalizedEntities, normalizedActions);

    // 保存结果
    if (saveResult && newsId) {
      const duration = Date.now() - startTime;
      try {
        await saveLlmParseResult({
          news_id: newsId,
          prompt: buildEventExtractionPrompt(title, content),
          raw_response: { stage1: stage1Result, normalizedEntities, normalizedActions },
          proto_event_count: protoEvents.length,
          model_used: process.env.OPENAI_MODEL || 'deepseek/deepseek-chat',
          parse_duration_ms: duration,
          status: 'success',
          error_message: null
        });
      } catch (saveError) {
        console.error('[LLM Parser] Failed to save result:', saveError.message);
      }
    }

    return {
      proto_events: protoEvents,
      topic: detectTopicFromEvents(protoEvents),
      sentiment: 0,
      metadata: {
        model_used: process.env.OPENAI_MODEL || 'deepseek/deepseek-chat',
        extracted_at: new Date().toISOString(),
        extraction_mode: 'llm_three_stage_v1',
        stage1_event_count: stage1Result.length,
        normalized_entity_count: normalizedEntities.size,
        normalized_action_count: normalizedActions.size
      }
    };
  } catch (error) {
    console.error('[LLM Parser] Three-stage extraction failed:', error.message);
    if (saveResult && newsId) {
      try {
        await saveLlmParseResult({
          news_id: newsId,
          prompt: buildEventExtractionPrompt(title, content),
          raw_response: null,
          proto_event_count: 0,
          model_used: process.env.OPENAI_MODEL || 'deepseek/deepseek-chat',
          parse_duration_ms: Date.now() - startTime,
          status: 'failed',
          error_message: error.message
        });
      } catch (saveError) {
        console.error('[LLM Parser] Failed to save error result:', saveError.message);
      }
    }
    return { proto_events: [], topic: 'general', sentiment: 0 };
  }
}

/**
 * ========== Stage 1: 事件提取 ==========
 */

async function extractRawEvents(title, content) {
  const prompt = buildEventExtractionPrompt(title, content);
  const result = await callLLM(prompt);

  if (!result) {
    console.warn('[LLM Parser] Stage 1 returned null');
    return [];
  }

  const events = Array.isArray(result.events) ? result.events : [];
  console.log(`[LLM Parser] Stage 1 extracted ${events.length} raw events`);

  return events.map(validateRawEvent).filter(Boolean);
}

/**
 * 构建 Stage 1 提示词
 */
export function buildEventExtractionPrompt(title, content) {
  return `
你是一个事件抽取系统。

任务：从新闻中提取"客观发生的事件"，不要总结。

事件的定义：
- 任何已经发生、正在发生、或已被当事人公开宣布的动作/行为都是事件
- 公众人物的声明、批评、表态本身是事件（如"特朗普批评某政策"）
- 已宣布的未来计划也是事件（如"宣布下周举行会谈"），但标记为 future
- 新闻作者自己的分析评论不是事件（如"分析师认为..."），除非引用了具体人物

硬性要求：
1. 你必须穷尽新闻中每一个可识别的原子事件。遗漏事件是不可接受的错误。
2. 一条新闻可能包含多个事件，必须全部列出。
3. 复合动作必须拆分：如果一句话中包含"动作A+动作B"（如"宣布出售"、"威胁制裁"），必须拆成两个独立事件。
4. 多客体必须展开：如果动作作用于多个对象（如"向A和B出售"），每个对象独立成事件。
5. 模糊指代必须解析：不允许输出"双方"、"有关方面"等模糊词，必须还原为具体实体名称。
6. action 字段只填核心动词短语，不含修饰语（"正式宣布"→"宣布"）。
7. actors 和 objects 保留原文名称，不要自行翻译或归一化。
8. 关键数值（金额、数量、百分比、时间期限）必须提取到 details 字段。
9. event_type 必须且只能从以下枚举中选择：
   ${EVENT_TYPES.join(', ')}

输出必须是一个 JSON 对象，且只包含一个字段 events，格式如下：
{
  "events": [
    {
      "actors": ["行为主体，数组，保留原文"],
      "action": "核心动词短语",
      "objects": ["作用对象，数组，保留原文"],
      "details": { "金额": "如涉及金额", "数量": "如涉及数量", "其他": "其他关键数值" },
      "location": "地点，没有则空字符串",
      "time": "时间，没有则空字符串",
      "event_type": "事件类型枚举值",
      "temporal_status": "past/ongoing/future",
      "confidence": 0.0到1.0,
      "evidence_snippet": "原文中支撑此事件的句子"
    }
  ]
}

details 字段规则：只放关键数值信息，没有则为空对象 {}。不要放描述性文本。

不要输出解释文字，不要输出 Markdown，不要输出多余字段。

新闻标题：${title}
新闻正文：${content || ''}
`;
}

/**
 * 验证并标准化原始事件
 */
function validateRawEvent(event) {
  if (!event || typeof event !== 'object') return null;

  const actors = sanitizeStringArray(event.actors);
  const objects = sanitizeStringArray(event.objects);
  const action = cleanText(event.action || '');
  const eventType = cleanText(String(event.event_type || '')).toLowerCase();
  const location = cleanText(event.location || '');
  const time = cleanText(event.time || '');
  const temporalStatus = cleanText(event.temporal_status || 'past');
  const confidence = Number.isFinite(Number(event.confidence)) ? Number(event.confidence) : 0.7;
  const details = typeof event.details === 'object' && event.details !== null ? event.details : {};
  const evidenceSnippet = cleanText(event.evidence_snippet || '');

  // 必须有 action
  if (!action) return null;

  // 过滤完全无意义的事件（既没有 actor 也没有 object）
  if (actors.length === 0 && objects.length === 0) return null;

  return {
    actors,
    action,
    objects,
    details,
    location: location || null,
    time: time || null,
    event_type: EVENT_TYPES.includes(eventType) ? eventType : null,
    temporal_status: ['past', 'ongoing', 'future'].includes(temporalStatus) ? temporalStatus : 'past',
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence_snippet: evidenceSnippet || null
  };
}

/**
 * ========== Stage 2a: 实体归一化 ==========
 */

async function normalizeEntitiesStage(entities, _context = {}) {
  if (!entities || entities.length === 0) {
    return new Map();
  }

  const prompt = buildEntityNormalizationPrompt(entities);

  try {
    const result = await callLLM(prompt);
    const normalized = result?.results || [];

    const normalizedMap = new Map();
    for (const item of normalized) {
      if (item.raw_name) {
        normalizedMap.set(item.raw_name, {
          canonicalName: item.canonical_name || item.raw_name,
          entityType: item.entity_type || 'organization',
          parentEntity: item.parent_entity || null,
          confidence: Number.isFinite(item.confidence) ? item.confidence : 0.8
        });
      }
    }

    console.log(`[LLM Parser] Stage 2a normalized ${normalizedMap.size} entities`);
    return normalizedMap;
  } catch (error) {
    console.error('[LLM Parser] Stage 2a failed:', error.message);
    // 失败时返回原始名称作为归一化结果
    const fallback = new Map();
    for (const rawName of entities) {
      fallback.set(rawName, {
        canonicalName: rawName,
        entityType: 'organization',
        parentEntity: null,
        confidence: 0.5
      });
    }
    return fallback;
  }
}

/**
 * 构建 Stage 2a 提示词
 */
function buildEntityNormalizationPrompt(entities) {
  const entitiesJson = JSON.stringify({ entities }, null, 2);

  return `你是一个实体归一化系统。

任务：对给定的实体名称列表，判断每个实体的规范名称、类型和层级关系。

实体类型（共8种，必须且只能使用以下类型）：
country, organization, person, location, military_unit, company, international_org, region

层级规则：
- 国家: 使用标准英文全名 (United States, China, Russia, Japan, France, Germany, United Kingdom, etc.)
- 国家下属机构: parent_entity 填国家名，entity_type 为 organization
  例: "美国国防部" -> canonical_name="Department of Defense", entity_type="organization", parent_entity="United States"
  例: "中国人民银行" -> canonical_name="People's Bank of China", entity_type="organization", parent_entity="China"
- 国际组织: entity_type="international_org" (如 NATO, UN, EU, WTO, IMF, OPEC, BRICS, SCO)
- 军事单位: entity_type="military_unit" (如 "海军陆战队", "第82空降师")
- 公司: entity_type="company" (如 Apple, Gazprom, Huawei, Saudi Aramco)
- 人物: entity_type="person"，给出全名或通用称呼
- 地区/省份: entity_type="region"
- 城市/地点: entity_type="location"
- 如果实体是某组织的下属机构，先找父级组织，再找国家

要求：
1. 每个实体必须给出：raw_name（原文）、canonical_name（规范名称）、entity_type（类型）、parent_entity（父实体，无则填 null）
2. 规范名称使用通用英文或中文标准名
3. 如果实体是某国下属机构，parent_entity 填国家名（如 "United States"）
4. 如果实体是国际组织（如 NATO、UN），parent_entity 填 null，entity_type 为 international_org
5. 如果无法判断类型，保持原样，entity_type 填 "organization"
6. confidence 表示判断置信度，0.0-1.0

输出必须是一个 JSON 对象，格式如下：
{
  "results": [
    {
      "raw_name": "原文",
      "canonical_name": "规范名称",
      "entity_type": "类型",
      "parent_entity": "父实体或null",
      "confidence": 0.95
    }
  ]
}

不要输出解释文字，不要输出 Markdown。

输入实体列表：
${entitiesJson}`;
}

/**
 * ========== Stage 2b: 动作归一化 ==========
 */

async function normalizeActionsStage(actions, _context = {}) {
  if (!actions || actions.length === 0) {
    return new Map();
  }

  const prompt = buildActionNormalizationPrompt(actions);

  try {
    const result = await callLLM(prompt);
    const normalized = result?.results || [];

    const normalizedMap = new Map();
    for (const item of normalized) {
      if (item.raw_action) {
        normalizedMap.set(item.raw_action, {
          normalizedAction: item.normalized_action || item.raw_action,
          actionCategory: item.action_category || null,
          isStandardMatch: item.is_standard_match !== false,
          suggestedNewAction: item.suggested_new_action || null
        });
      }
    }

    console.log(`[LLM Parser] Stage 2b normalized ${normalizedMap.size} actions`);
    return normalizedMap;
  } catch (error) {
    console.error('[LLM Parser] Stage 2b failed:', error.message);
    // 失败时使用 ACTION_SYNONYM_MAP 兜底
    const fallback = new Map();
    for (const rawAction of actions) {
      const matchedAction = ACTION_SYNONYM_MAP[rawAction];
      fallback.set(rawAction, {
        normalizedAction: matchedAction || rawAction,
        actionCategory: null,
        isStandardMatch: !!matchedAction,
        suggestedNewAction: null
      });
    }
    return fallback;
  }
}

/**
 * 构建 Stage 2b 提示词
 */
function buildActionNormalizationPrompt(actions) {
  const actionsJson = JSON.stringify({ actions }, null, 2);

  return `你是一个动作归一化系统。

任务：对给定的动作短语列表，将每个映射到最匹配的标准动作标签。

标准动作分类体系：
${getActionTaxonomyText()}

要求：
1. 每个动作必须给出：raw_action（原文）、normalized_action（标准动作标签）、action_category（分类）
2. 如果完全匹配到标准动作，is_standard_match 填 true
3. 如果没有完全匹配但有近似匹配，is_standard_match 填 false，并给出 suggested_new_action
4. 如果完全无法匹配，normalized_action 保持原文，is_standard_match 填 false

输出必须是一个 JSON 对象，格式如下：
{
  "results": [
    {
      "raw_action": "原文动作",
      "normalized_action": "标准动作标签",
      "action_category": "分类",
      "is_standard_match": true或false,
      "suggested_new_action": "建议的新标签或null"
    }
  ]
}

不要输出解释文字，不要输出 Markdown。

输入动作列表：
${actionsJson}`;
}

/**
 * ========== Stage 3: 结果合并 ==========
 */

function mergeResults(rawEvents, normalizedEntities, normalizedActions) {
  return rawEvents.map(event => {
    // 归一化 actors
    const normalizedActors = event.actors.map(actor => {
      const norm = normalizedEntities.get(actor);
      return norm ? norm.canonicalName : actor;
    });

    // 归一化 objects
    const normalizedObjects = event.objects.map(obj => {
      const norm = normalizedEntities.get(obj);
      return norm ? norm.canonicalName : obj;
    });

    // 归一化 action
    let normalizedAction = event.action;
    let actionCategory = null;
    let isStandardAction = false;

    const actionNorm = normalizedActions.get(event.action);
    if (actionNorm) {
      normalizedAction = actionNorm.normalizedAction;
      actionCategory = actionNorm.actionCategory;
      isStandardAction = actionNorm.isStandardMatch;
    } else if (ALL_STANDARD_ACTIONS.includes(event.action.toLowerCase())) {
      isStandardAction = true;
    } else if (ACTION_SYNONYM_MAP[event.action]) {
      normalizedAction = ACTION_SYNONYM_MAP[event.action];
      isStandardAction = true;
    }

    return {
      actor: normalizedActors[0] || null,
      action: normalizedAction,
      object: normalizedObjects[0] || null,
      location: event.location,
      time: event.time,
      confidence: event.confidence,
      metadata: {
        actors: normalizedActors,
        objects: normalizedObjects,
        raw_actors: event.actors,
        raw_objects: event.objects,
        raw_action: event.action,
        normalized_action: normalizedAction,
        action_category: actionCategory,
        is_standard_action: isStandardAction,
        event_type: event.event_type,
        temporal_status: event.temporal_status,
        details: event.details,
        evidence_snippet: event.evidence_snippet,
        // 实体归一化信息供后续使用
        entity_normalized: Object.fromEntries(normalizedEntities),
        action_normalized: actionNorm || null
      }
    };
  });
}

/**
 * ========== 工具函数 ==========
 */

function sanitizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => cleanText(String(value || ''))).filter(Boolean);
}

function collectUniqueEntities(events) {
  const entitySet = new Set();
  for (const event of events) {
    for (const actor of event.actors || []) {
      entitySet.add(actor);
    }
    for (const obj of event.objects || []) {
      entitySet.add(obj);
    }
  }
  return Array.from(entitySet);
}

function collectUniqueActions(events) {
  const actionSet = new Set();
  for (const event of events) {
    if (event.action) {
      actionSet.add(event.action);
    }
  }
  return Array.from(actionSet);
}

function detectTopicFromEvents(events) {
  if (!events.length) return 'general';
  return events[0]?.metadata?.event_type || 'general';
}

async function buildEmptyResult(newsId, startTime, saveResult, title, content) {
  if (saveResult && newsId) {
    try {
      await saveLlmParseResult({
        news_id: newsId,
        prompt: buildEventExtractionPrompt(title, content),
        raw_response: null,
        proto_event_count: 0,
        model_used: process.env.OPENAI_MODEL || 'deepseek/deepseek-chat',
        parse_duration_ms: Date.now() - startTime,
        status: 'success',
        error_message: null
      });
    } catch (saveError) {
      console.error('[LLM Parser] Failed to save empty result:', saveError.message);
    }
  }
  return { proto_events: [], topic: 'general', sentiment: 0 };
}

// 保留旧函数名作为别名，兼容现有代码
export { buildEventExtractionPrompt as buildEventExtractionPromptOld };

export default {
  extractProtoEventsWithLLM,
  callLLM,
  extractJSON,
  buildEventExtractionPrompt
};
