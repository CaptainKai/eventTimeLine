/**
 * Entity Linking（实体对齐）系统 - 解决歧义问题
 * 实现实体消歧和标准化功能
 */

import { getAllEntities } from './entity-database.mjs';

/**
 * 歧义实体消歧表
 */
const DISAMBIGUATION_RULES = {
  // 公司 vs 水果
  Apple: {
    company: [
      '科技', '科技公司', '苹果公司', 'Apple Inc.', 'iPhone', 'iPad', 'iOS',
      'MacBook', 'Macintosh', '苹果手机', '苹果电脑', '苹果产品', '股票'
    ],
    fruit: [
      '水果', '苹果', '苹果汁', '苹果派', '苹果酱', '水果沙拉', '果园', '农业'
    ]
  },
  // 银行 vs 河流
  Bank: {
    bank: [
      '银行', '金融', '储蓄', '贷款', '利息', '账户', 'ATM', '金融机构',
      '央行', '商业银行', '投资银行'
    ],
    river: [
      '银行', '河岸', '河流', '河流', '水', '钓鱼', '游泳', '船', '桥梁', '河流'
    ]
  },
  // 苹果公司 vs 其他苹果相关实体
  apple: {
    company: [
      'Apple', '科技', 'iPhone', 'iPad', 'MacBook', 'iOS', 'App Store',
      '苹果公司', '苹果手机', '苹果电脑', '苹果产品'
    ],
    fruit: [
      '苹果', '水果', '苹果汁', '苹果派', '果园', '农业', '榨汁', '水果沙拉'
    ]
  },
  // Microsoft vs 其他含义
  Microsoft: {
    company: [
      '微软', 'Windows', 'Office', 'Azure', '云计算', '操作系统',
      '软件', '比尔·盖茨', '比尔盖茨', '科技公司', '云服务'
    ]
  },
  // Google vs 其他含义
  Google: {
    company: [
      '谷歌', '搜索引擎', '搜索引擎', 'Android', 'Chrome', 'Gmail',
      '地图', 'YouTube', '云端', '搜索', 'AI'
    ]
  },
  // Tesla vs 其他含义 (如特斯拉线圈)
  Tesla: {
    company: [
      '特斯拉', '电动车', '电动汽车', 'Elon Musk', '埃隆·马斯克',
      'SpaceX', '自动驾驶', '特斯拉汽车', '电池', '超充'
    ],
    scientist: [
      '物理学家', '科学家', '特斯拉线圈', '特斯拉定律', '电磁学',
      '尼古拉·特斯拉', 'Nikola Tesla'
    ]
  }
};

/**
 * 实体消歧函数
 */
function disambiguateEntity(entityName, context) {
  const lowerEntityName = entityName.toLowerCase();
  const lowerContext = context.toLowerCase();

  // 处理 Apple 歧义
  if (lowerEntityName === 'apple' || entityName === 'Apple') {
    const isCompany = DISAMBIGUATION_RULES.Apple.company.some(kw =>
      lowerContext.includes(kw.toLowerCase())
    );
    const isFruit = DISAMBIGUATION_RULES.Apple.fruit.some(kw =>
      lowerContext.includes(kw.toLowerCase())
    );

    if (isCompany) {
      return { id: 'apple-inc', name: 'Apple Inc.', type: 'company', category: 'technology' };
    }
    if (isFruit) {
      return { id: 'apple-fruit', name: 'Apple (fruit)', type: 'commodity', category: 'agriculture' };
    }
    // 默认情况下，可能更常见是公司
    return { id: 'apple-inc', name: 'Apple Inc.', type: 'company', category: 'technology' };
  }

  // 处理 Apple 的小写形式
  if (lowerEntityName === 'apple') {
    const isCompany = DISAMBIGUATION_RULES.apple.company.some(kw =>
      lowerContext.includes(kw.toLowerCase())
    );
    const isFruit = DISAMBIGUATION_RULES.apple.fruit.some(kw =>
      lowerContext.includes(kw.toLowerCase())
    );

    if (isCompany) {
      return { id: 'apple-inc', name: 'Apple Inc.', type: 'company', category: 'technology' };
    }
    if (isFruit) {
      return { id: 'apple-fruit', name: 'Apple (fruit)', type: 'commodity', category: 'agriculture' };
    }
    return { id: 'apple-inc', name: 'Apple Inc.', type: 'company', category: 'technology' };
  }

  // 处理 Bank 歧义
  if (lowerEntityName === 'bank' || entityName === 'Bank') {
    const isBank = DISAMBIGUATION_RULES.Bank.bank.some(kw =>
      lowerContext.includes(kw.toLowerCase())
    );
    const isRiver = DISAMBIGUATION_RULES.Bank.river.some(kw =>
      lowerContext.includes(kw.toLowerCase())
    );

    if (isBank) {
      return { id: 'world-bank', name: 'World Bank', type: 'organization', category: 'finance' };
    }
    if (isRiver) {
      return { id: 'bank-river', name: 'River Bank', type: 'location', category: 'natural' };
    }
    return { id: 'world-bank', name: 'World Bank', type: 'organization', category: 'finance' };
  }

  // 处理 Tesla 歧义
  if (lowerEntityName === 'tesla' || entityName === 'Tesla') {
    const isCompany = DISAMBIGUATION_RULES.Tesla.company.some(kw =>
      lowerContext.includes(kw.toLowerCase())
    );
    const isScientist = DISAMBIGUATION_RULES.Tesla.scientist.some(kw =>
      lowerContext.includes(kw.toLowerCase())
    );

    if (isCompany) {
      return { id: 'tesla-inc', name: 'Tesla, Inc.', type: 'company', category: 'automotive' };
    }
    if (isScientist) {
      return { id: 'nikola-tesla', name: 'Nikola Tesla', type: 'person', category: 'science' };
    }
    return { id: 'tesla-inc', name: 'Tesla, Inc.', type: 'company', category: 'automotive' };
  }

  // 对于其他没有歧义的实体，直接返回
  const existingEntity = getAllEntities().find(e =>
    e.name.toLowerCase() === lowerEntityName ||
    e.aliases.some(alias => alias.toLowerCase() === lowerEntityName)
  );

  if (existingEntity) {
    return existingEntity;
  }

  return null;
}

/**
 * 实体对齐函数
 */
export function linkEntity(entityName, context) {
  if (!entityName || entityName.length < 2) {
    return null;
  }

  // 首先尝试查找已有的实体
  let linkedEntity = disambiguateEntity(entityName, context);

  // 如果没有匹配，尝试部分匹配
  if (!linkedEntity) {
    const entities = getAllEntities();
    for (const entity of entities) {
      if (entity.name.toLowerCase().includes(entityName.toLowerCase()) ||
          entity.aliases.some(alias => alias.toLowerCase().includes(entityName.toLowerCase()))) {
        linkedEntity = entity;
        break;
      }
    }
  }

  return linkedEntity;
}

/**
 * 批量对齐实体
 */
export function linkEntities(entityNames, context) {
  return entityNames.map(name => ({
    original: name,
    entity: linkEntity(name, context)
  }));
}

/**
 * 从文本中提取和对齐实体
 */
export function extractAndLinkEntities(text) {
  if (!text) return [];

  // 首先使用简单的正则表达式匹配潜在的实体
  // 这里应该与实体数据库结合，实际实现中会使用更高级的 NER 模型
  const entityPattern = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}\b/g;
  const matches = [...new Set(text.match(entityPattern) || [])];

  return linkEntities(matches, text);
}

/**
 * 实体对齐的置信度计算
 */
export function calculateAlignmentConfidence(entityName, linkedEntity, context) {
  if (!linkedEntity) return 0;

  const contextLower = context.toLowerCase();
  let confidence = 0.6;

  // 直接匹配
  if (linkedEntity.name.toLowerCase() === entityName.toLowerCase() ||
      linkedEntity.aliases.some(alias => alias.toLowerCase() === entityName.toLowerCase())) {
    confidence += 0.2;
  }

  // 类别匹配
  if (linkedEntity.category === 'technology' &&
      /科技|软件|计算机|网络|应用/i.test(contextLower)) {
    confidence += 0.15;
  }

  if (linkedEntity.category === 'finance' &&
      /金融|银行|投资|股票|利率/i.test(contextLower)) {
    confidence += 0.15;
  }

  if (linkedEntity.category === 'healthcare' &&
      /医疗|健康|医院|药品|疾病/i.test(contextLower)) {
    confidence += 0.15;
  }

  if (linkedEntity.category === 'energy' &&
      /能源|石油|天然气|电力|可再生/i.test(contextLower)) {
    confidence += 0.15;
  }

  if (linkedEntity.category === 'agriculture' &&
      /农业|水果|蔬菜|粮食|种植|果园/i.test(contextLower)) {
    confidence += 0.15;
  }

  if (linkedEntity.category === 'automotive' &&
      /汽车|电动车|电动汽车|交通|公路/i.test(contextLower)) {
    confidence += 0.15;
  }

  // 关键词匹配
  if (linkedEntity.aliases.some(alias => contextLower.includes(alias.toLowerCase()))) {
    confidence += 0.1;
  }

  return Math.min(confidence, 0.95);
}

/**
 * 实体对齐调试
 */
export function debugEntityLinking(text) {
  const linkedEntities = extractAndLinkEntities(text);

  console.log(`=== Entity Linking Debug ===`);
  console.log(`Text: "${text}"`);
  console.log(`Found ${linkedEntities.length} candidate entities`);

  linkedEntities.forEach(({ original, entity }) => {
    if (entity) {
      const confidence = calculateAlignmentConfidence(original, entity, text);
      console.log(`  - "${original}" linked to "${entity.name}" (${entity.category}) [${(confidence * 100).toFixed(0)}%]`);
    } else {
      console.log(`  - "${original}" not linked to any known entity`);
    }
  });

  return linkedEntities;
}

/**
 * 实体对齐结果的统计信息
 */
export function getEntityLinkingStats(text) {
  const linkedEntities = extractAndLinkEntities(text);

  return {
    total: linkedEntities.length,
    linked: linkedEntities.filter(item => item.entity).length,
    unlinked: linkedEntities.filter(item => !item.entity).length,
    coverage: linkedEntities.length > 0 ?
      (linkedEntities.filter(item => item.entity).length / linkedEntities.length) * 100 : 0
  };
}

export default {
  linkEntity,
  linkEntities,
  extractAndLinkEntities,
  calculateAlignmentConfidence,
  debugEntityLinking,
  getEntityLinkingStats
};
