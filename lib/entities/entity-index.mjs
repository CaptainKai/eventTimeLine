/**
 * 实体索引和匹配系统 - 借鉴 WorldMonitor 的方法
 * 边界感知匹配 + 分层置信度 + 贪心最长短语匹配
 */

import { getAllEntities } from './entity-database.mjs';

// 索引缓存
let entityIndex = null;
let aliasIndex = null;
let keywordIndex = null;

/**
 * 初始化实体索引
 * 别名按长度降序排列，优先匹配长短语
 */
function initializeIndices() {
  if (entityIndex) return;

  const entities = getAllEntities();
  entityIndex = new Map();
  aliasIndex = new Map();
  keywordIndex = new Map();

  entities.forEach(entity => {
    // 主索引：按ID
    entityIndex.set(entity.id, entity);

    // 别名索引：按所有名称和别名，按长度降序
    const allNames = [entity.name, ...entity.aliases];
    const uniqueNames = [...new Set(allNames)];
    uniqueNames
      .sort((a, b) => b.length - a.length) // 长名称优先
      .forEach(name => {
        const normalized = normalizeText(name);
        if (!aliasIndex.has(normalized)) {
          aliasIndex.set(normalized, []);
        }
        aliasIndex.get(normalized).push({ entity, alias: name });
      });

    // 关键词索引：按每个词
    allNames.forEach(name => {
      const normalized = normalizeText(name);
      const words = normalized.split(/\s+/);
      words.forEach(word => {
        if (word.length >= 2) {
          if (!keywordIndex.has(word)) {
            keywordIndex.set(word, []);
          }
          keywordIndex.get(word).push({ entity, keyword: word });
        }
      });
    });

    // 索引实体自身的 keywords 字段
    if (entity.keywords && Array.isArray(entity.keywords)) {
      entity.keywords.forEach(kw => {
        const normalized = normalizeText(kw);
        if (!keywordIndex.has(normalized)) {
          keywordIndex.set(normalized, []);
        }
        keywordIndex.get(normalized).push({ entity, keyword: kw });
      });
    }
  });

  console.log(`Entity index initialized: ${entities.length} entities, ${aliasIndex.size} aliases, ${keywordIndex.size} keywords`);
}

/**
 * 文本规范化
 */
function normalizeText(text) {
  return String(text || '').toLowerCase()
    .replace(/[^\w\s一-鿿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 英文词边界正则匹配：\bWORD\b
 */
function createEnglishBoundaryRegex(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

/**
 * 自动判断中英文并使用正确的匹配方式
 * 英文：使用 \b 词边界（避免 "rome" 匹配 "Jerome"）
 * 中文：使用 includes（词典实体已精选，且中文无明确词边界）
 */
function containsWithBoundary(text, word) {
  if (/[一-鿿]/.test(word)) {
    return text.includes(word);
  }
  const regex = createEnglishBoundaryRegex(word);
  return regex.test(text);
}

/**
 * 基于匹配类型的分层置信度评分
 */
function calculateMatchScore(matchType, matchedAlias) {
  if (!matchedAlias) return 0.1;

  if (matchType === 'exact') {
    const aliasLen = matchedAlias.length;
    if (aliasLen > 3) return 0.95;
    return 0.85; // 短名称如 "EU", "UK", "AI"
  }
  if (matchType === 'keyword') return 0.70;
  if (matchType === 'substring') return 0.50;
  return 0.1;
}

/**
 * 实体匹配 - 三阶段：边界精确匹配 → 关键词 → 子字符串
 */
function matchEntities(text) {
  initializeIndices();
  const matches = new Map();

  // --- Pass 1: 边界感知精确匹配（别名按长度降序，优先长短语）---
  for (const [normalizedName, entries] of aliasIndex) {
    if (normalizedName.length < 2) continue;

    // 使用词边界匹配而非简单的 includes()
    if (containsWithBoundary(text, normalizedName)) {
      for (const { entity, alias } of entries) {
        const score = calculateMatchScore('exact', alias);
        if (score > 0.5) {
          if (!matches.has(entity.id) || score > matches.get(entity.id).score) {
            matches.set(entity.id, { entity, score, type: 'exact', matchedAlias: alias });
          }
        }
      }
    }
  }

  // --- Pass 2: 关键词匹配（处理变体）---
  const textWords = normalizeText(text).split(/\s+/);
  for (const word of textWords) {
    if (word.length >= 3 && keywordIndex.has(word)) {
      const entries = keywordIndex.get(word);
      for (const { entity, keyword } of entries) {
        // 跳过已在 Pass 1 中匹配的实体
        if (matches.has(entity.id) && matches.get(entity.id).score >= 0.85) continue;

        const score = calculateMatchScore('keyword', keyword);
        if (score > 0.3) {
          if (!matches.has(entity.id) || score > matches.get(entity.id).score) {
            matches.set(entity.id, { entity, score, type: 'keyword', matchedAlias: keyword });
          }
        }
      }
    }
  }

  // --- Pass 3: 子字符串匹配（最低优先级）---
  for (const word of textWords.filter(w => w.length >= 4)) {
    for (const entity of getAllEntities()) {
      if (matches.has(entity.id)) continue;
      if (entity.name.toLowerCase().includes(word) ||
          entity.aliases.some(a => a.toLowerCase().includes(word))) {
        const score = calculateMatchScore('substring', entity.name);
        if (score > 0.4) {
          matches.set(entity.id, { entity, score, type: 'substring', matchedAlias: entity.name });
        }
      }
    }
  }

  // 去重和排序
  const results = [...matches.values()];
  return results
    .sort((a, b) => b.score - a.score)
    .map(match => ({
      ...match.entity,
      match_score: match.score,
      match_type: match.type,
    }));
}

/**
 * 分类统计
 */
function countEntityTypes(text) {
  const matches = matchEntities(text);
  const typeCounts = new Map();

  matches.forEach(match => {
    typeCounts.set(match.type, (typeCounts.get(match.type) || 0) + 1);
  });

  return Array.from(typeCounts.entries()).map(([type, count]) => ({
    type,
    count,
    percentage: (count / matches.length * 100).toFixed(1)
  }));
}

/**
 * 获取文本中提到的实体
 */
export function extractEntities(text) {
  const matches = matchEntities(text);
  return matches.slice(0, 10);
}

/**
 * 获取指定类型的实体
 */
export function extractEntitiesByType(text, types) {
  const matches = matchEntities(text);
  return matches.filter(m => types.includes(m.type));
}

/**
 * 获取指定类别的实体
 */
export function extractEntitiesByCategory(text, categories) {
  const matches = matchEntities(text);
  return matches.filter(m => categories.includes(m.category));
}

/**
 * 按实体类型分组
 */
export function groupEntitiesByType(text) {
  const matches = matchEntities(text);
  const groups = {};

  matches.forEach(match => {
    if (!groups[match.type]) {
      groups[match.type] = [];
    }
    groups[match.type].push(match);
  });

  return groups;
}

/**
 * 获取实体的关系网络
 */
export function getEntityRelations(entityId) {
  initializeIndices();
  const entity = entityIndex.get(entityId);
  if (!entity) return [];

  const related = getAllEntities().filter(e =>
    e.id !== entityId &&
    (e.category === entity.category ||
     (e.category && entity.category && e.category.includes(entity.category)) ||
     e.sector === entity.sector)
  );

  return related.map(e => ({
    entity: e,
    relation_type: e.category === entity.category ? 'same-category' :
                  e.sector === entity.sector ? 'same-sector' : 'related',
    relevance_score: e.category === entity.category ? 0.8 : 0.6
  })).sort((a, b) => b.relevance_score - a.relevance_score);
}

/**
 * 调试函数：打印匹配详情
 */
export function debugEntityExtraction(text) {
  const matches = matchEntities(text);
  console.log(`=== Entity Extraction Debug ===`);
  console.log(`Text: "${text}"`);
  console.log(`Matches found: ${matches.length}`);

  matches.forEach(match => {
    console.log(`  - ${match.name} (${match.type}) [${(match.match_score * 100).toFixed(0)}%]`);
  });

  if (matches.length === 0) {
    console.log(`  No entities found in this text.`);
  }

  return matches;
}

// 初始化索引
initializeIndices();
