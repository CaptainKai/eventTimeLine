/**
 * Event Taxonomy Configuration
 * Shared configuration for LLM parser and post-processing pipeline
 */

// 事件类型枚举
export const EVENT_TYPES = ['military', 'diplomacy', 'economic', 'energy', 'protest', 'disaster', 'political', 'financial'];

// 实体类型枚举（供 LLM 实体归一化使用）
export const ENTITY_TYPES = [
  'country', 'organization', 'person', 'location',
  'military_unit', 'company', 'international_org', 'region'
];

// 动作分类体系
export const ACTION_TAXONOMY = {
  SUPPLY: ['cut_supply', 'increase_supply', 'disrupt_supply'],
  DEMAND: ['increase_demand', 'decrease_demand'],
  PRICE: ['price_increase', 'price_decrease'],
  CONFLICT: ['attack', 'retaliate', 'escalate', 'ceasefire'],
  POLICY: ['sanction', 'lift_sanction', 'regulate', 'ban'],
  FINANCIAL: ['raise_rate', 'cut_rate', 'invest', 'divest'],
  MOVEMENT: ['deploy', 'withdraw', 'protest'],
  STATEMENT: ['announce', 'warn', 'confirm', 'deny'],
  MILITARY_DETAIL: ['sell_weapons', 'conduct_exercise', 'impose_blockade'],
  TRADE: ['import', 'export', 'tariff'],
  NEGOTIATE: ['negotiate', 'mediate']
};

// 获取所有标准动作标签（扁平化数组）
export const ALL_STANDARD_ACTIONS = Object.values(ACTION_TAXONOMY).flat();

// 动作同义词映射（Stage 3 合并时的二级查找，优先级低于 LLM 归一化结果）
export const ACTION_SYNONYM_MAP = {
  '出售武器': 'sell_weapons',
  '卖武器': 'sell_weapons',
  '武器销售': 'sell_weapons',
  '实施制裁': 'sanction',
  '发起制裁': 'sanction',
  '制裁': 'sanction',
  '加息': 'raise_rate',
  '提高利率': 'raise_rate',
  '减息': 'cut_rate',
  '降息': 'cut_rate',
  '部署军队': 'deploy',
  '部署部队': 'deploy',
  '撤军': 'withdraw',
  '撤出军队': 'withdraw',
  '举行演习': 'conduct_exercise',
  '军事演习': 'conduct_exercise',
  '谈判': 'negotiate',
  '协商': 'negotiate',
  '进口': 'import',
  '出口': 'export',
  '加征关税': 'tariff'
};

// 实体归一化映射表
export const ENTITY_NORMALIZATION_MAP = {
  'United States': 'US',
  USA: 'US',
  America: 'US',
  'U.S.': 'US',
  'U.S': 'US',
  'European Union': 'EU',
  EU: 'EU'
};

// 用于 LLM prompt 的实体归一化规则文本
export function getEntityNormalizationRulesText() {
  return Object.entries(ENTITY_NORMALIZATION_MAP)
    .map(([from, to]) => `- ${from} -> ${to}`)
    .join('\n');
}

// 用于 LLM prompt 的动作标签文本
export function getActionTaxonomyText() {
  return Object.entries(ACTION_TAXONOMY)
    .map(([group, actions]) => `- ${group}: ${actions.join(', ')}`)
    .join('\n');
}

// 用于 LLM prompt 的实体层级规则文本
export function getEntityHierarchyRulesText() {
  return `实体层级规则：
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
- 如果实体是某组织的下属机构，先找父级组织，再找国家`;
}

// 原始动作到标准动作的模式匹配（仅 post-processing 使用）
export const RAW_ACTION_PATTERNS = [
  { pattern: /(cut|reduce|decrease|slash)/i, normalized: 'cut_supply' },
  { pattern: /(increase|boost|expand|raise)(.*)(supply|output|production|export)?/i, normalized: 'increase_supply' },
  { pattern: /(disrupt|halt|stop|interrupt)(.*)(supply|shipment|flow)?/i, normalized: 'disrupt_supply' },
  { pattern: /(price(.*)(rise|increase|surge)|surge|soar|jump)/i, normalized: 'price_increase' },
  { pattern: /(price(.*)(fall|decrease|drop)|drop|decline|slump)/i, normalized: 'price_decrease' },
  { pattern: /(attack|strike|bomb|raid|assault)/i, normalized: 'attack' },
  { pattern: /(retaliat|counterattack)/i, normalized: 'retaliate' },
  { pattern: /(escalat|intensif)/i, normalized: 'escalate' },
  { pattern: /(ceasefire|truce)/i, normalized: 'ceasefire' },
  { pattern: /(sanction|penalize)/i, normalized: 'sanction' },
  { pattern: /(lift sanctions?|ease sanctions?)/i, normalized: 'lift_sanction' },
  { pattern: /(regulat|restriction|rule)/i, normalized: 'regulate' },
  { pattern: /(ban|prohibit|block)/i, normalized: 'ban' },
  { pattern: /(raise rates?|hike rates?)/i, normalized: 'raise_rate' },
  { pattern: /(cut rates?|lower rates?)/i, normalized: 'cut_rate' },
  { pattern: /(invest|fund|finance)/i, normalized: 'invest' },
  { pattern: /(divest|sell off)/i, normalized: 'divest' },
  { pattern: /(deploy|send troops?|station)/i, normalized: 'deploy' },
  { pattern: /(withdraw|pull back|retreat)/i, normalized: 'withdraw' },
  { pattern: /(protest|demonstrat|rally)/i, normalized: 'protest' },
  { pattern: /(announce|declare|publish)/i, normalized: 'announce' },
  { pattern: /(warn|caution|alert)/i, normalized: 'warn' },
  { pattern: /(confirm|verify)/i, normalized: 'confirm' },
  { pattern: /(deny|reject claim)/i, normalized: 'deny' }
];

// 用于过滤未来事件的关键词（仅 post-processing 使用）
export const INVALID_ACTION_HINTS = ['plan', 'planned', 'planning', 'will', 'would', 'could', 'may', 'might', 'expect', 'forecast', 'predict'];

// CAMEO 动作标签（用于实体清洗，仅 post-processing 使用）
export const CAMEO_ACTIONS = ['Make', 'Disapprove', 'Fight', 'Protest', 'Consult', 'Exhibit',
  'Appeal', 'Threaten', 'Yield', 'Provide', 'Reject', 'Buy', 'Sell', 'Say', 'Meet',
  'Sign', 'Release', 'Arrest', 'Warn'];