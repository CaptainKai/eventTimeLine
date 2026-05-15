/**
 * Entity Normalizer for LLM Pipeline
 *
 * Stage 2a: Normalize entities extracted by Stage 1 using LLM
 * Handles hierarchy (parent-child relationships) and persists to entity_mapping table
 */

import { getOrCreateEntityWithHierarchy, getEntityByCanonicalName, getEntityHierarchy } from '../db/entity-queries.mjs';
import { callLLM } from '../parsers/llm-parser.mjs';
import { getEntityHierarchyRulesText, ENTITY_TYPES } from '../config/event-taxonomy.mjs';

/**
 * 实体归一化结果缓存，避免同一 raw_name 重复调用 LLM
 */
const normalizationCache = new Map();

/**
 * 清理缓存（每个新闻处理完后可调用）
 */
export function clearNormalizationCache() {
  normalizationCache.clear();
}

/**
 * 对一组实体进行归一化（Stage 2a）
 * @param {Array<string>} entities - 原始实体名称数组（去重后）
 * @param {object} context - 上下文信息 { source, newsId }
 * @returns {Map<string, object>} rawName -> { canonicalName, entityType, parentEntity, confidence }
 */
export async function normalizeEntities(entities, context = {}) {
  if (!entities || entities.length === 0) {
    return new Map();
  }

  const results = new Map();
  const uncachedEntities = [];

  // 先查缓存，只对未命中的实体调用 LLM
  for (const rawName of entities) {
    if (normalizationCache.has(rawName)) {
      results.set(rawName, normalizationCache.get(rawName));
    } else {
      uncachedEntities.push(rawName);
    }
  }

  if (uncachedEntities.length === 0) {
    return results;
  }

  // 调用 LLM 进行归一化
  const normalized = await callEntityNormalizationLLM(uncachedEntities, context);

  // 合并结果
  for (const [rawName, normInfo] of Object.entries(normalized)) {
    results.set(rawName, normInfo);
    normalizationCache.set(rawName, normInfo);
  }

  return results;
}

/**
 * 调用 LLM 对实体进行归一化
 */
async function callEntityNormalizationLLM(entities, context = {}) {
  if (!entities || entities.length === 0) return {};

  const prompt = buildEntityNormalizationPrompt(entities);

  try {
    const result = await callLLM(prompt);
    const normalized = result?.results || [];

    const normalizedMap = {};
    for (const item of normalized) {
      if (item.raw_name) {
        normalizedMap[item.raw_name] = {
          canonical_name: item.canonical_name || item.raw_name,
          entity_type: ENTITY_TYPES.includes(item.entity_type) ? item.entity_type : 'organization',
          parent_entity: item.parent_entity || null,
          confidence: Number.isFinite(item.confidence) ? item.confidence : 0.8
        };
      }
    }

    return normalizedMap;
  } catch (error) {
    console.error('[EntityNormalizer] LLM normalization failed:', error.message);
    // 失败时返回原始名称作为归一化结果
    const fallback = {};
    for (const rawName of entities) {
      fallback[rawName] = {
        canonical_name: rawName,
        entity_type: 'organization',
        parent_entity: null,
        confidence: 0.5
      };
    }
    return fallback;
  }
}

/**
 * 构建实体归一化 prompt
 */
function buildEntityNormalizationPrompt(entities) {
  const entitiesJson = JSON.stringify({ entities }, null, 2);

  return `你是一个实体归一化系统。

任务：对给定的实体名称列表，判断每个实体的规范名称、类型和层级关系。

实体类型（共8种，必须且只能使用以下类型）：
${ENTITY_TYPES.join(', ')}

层级规则：
${getEntityHierarchyRulesText()}

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
 * 将归一化结果持久化到数据库
 * @param {Map<string, object>} normalizedEntities - rawName -> { canonicalName, entityType, parentEntity, confidence }
 * @param {object} context - 上下文
 * @returns {Map<string, object>} rawName -> { entityId, canonicalName, entityType, parentEntityId }
 */
export async function persistNormalizedEntities(normalizedEntities, context = {}) {
  const results = new Map();

  for (const [rawName, normInfo] of normalizedEntities) {
    try {
      const { entity } = await getOrCreateEntityWithHierarchy(
        rawName,
        normInfo.canonical_name,
        normInfo.entity_type,
        normInfo.parent_entity,
        normInfo.confidence
      );

      results.set(rawName, {
        entityId: entity.id,
        canonicalName: entity.canonical_name,
        entityType: entity.entity_type,
        parentEntityId: entity.parent_entity_id,
        parentCanonicalName: normInfo.parent_entity
      });
    } catch (error) {
      console.error(`[EntityNormalizer] Failed to persist entity "${rawName}":`, error.message);
      // 即使持久化失败，也返回内存中的结果
      results.set(rawName, {
        entityId: null,
        canonicalName: normInfo.canonical_name,
        entityType: normInfo.entity_type,
        parentEntityId: null,
        parentCanonicalName: normInfo.parent_entity
      });
    }
  }

  return results;
}

/**
 * 完整流程：对实体列表进行归一化并持久化
 * @param {Array<string>} entities - 原始实体名称数组
 * @param {object} context - 上下文
 * @returns {Map<string, object>} rawName -> { entityId, canonicalName, entityType, parentEntityId }
 */
export async function normalizeAndPersistEntities(entities, context = {}) {
  // 1. 归一化（调用 LLM）
  const normalized = await normalizeEntities(entities, context);

  // 2. 持久化到数据库
  const persisted = await persistNormalizedEntities(normalized, context);

  return persisted;
}