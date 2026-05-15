/**
 * 增强的事件解析器 - 中英文 NER 分离
 * parseChineseNews(): 中文新闻实体提取（字典匹配 + 中文边界正则）
 * parseEnglishNews(): 英文新闻实体提取（entity-index + 边界匹配 + 分层置信度）
 */

import { extractEntities, extractEntitiesByCategory, groupEntitiesByType } from '../../lib/entities/entity-index.mjs';
import { mapCameoCode } from '../utils/parser.mjs';
import { extractEnglishEvents, extractChineseEvents } from './spaCy-client.mjs';

// ======================== 工具函数 ========================

/**
 * 精确词匹配
 * 英文：使用 \b 词边界正则（避免 "rome" 匹配 "Jerome"）
 * 中文：使用 includes（词典已精选，且中文无明确词边界）
 */
function containsExactWord(text, word) {
  if (!text || !word) return false;

  // 中文：直接用 includes（词典实体已精选）
  if (/[一-鿿]/.test(word)) {
    return text.includes(word);
  }

  // 英文：使用词边界
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

/**
 * 清理和验证 actor/object
 */
function cleanActorObject(value) {
  if (!value) return null;

  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null') return null;

  if (text.endsWith(' in') || (text.includes(' in ') && !text.includes('China'))) {
    const parts = text.split(' in ');
    if (parts.length >= 2 && parts[0].length > 2) {
      return parts[0];
    }
    return null;
  }

  if (text.includes('null') || text.includes('including the')) return null;
  if (text.length > 60) return null;

  return text;
}

/**
 * 验证实体是否有效
 */
function isValidEntity(entity) {
  if (!entity || typeof entity !== 'string') return false;

  const text = entity.trim();
  if (text.length < 2) return false;
  if (text.toLowerCase() === 'null' || text === '') return false;
  if (text.toLowerCase().includes('null')) return false;
  if (/^(in|on|at|to|for|with|by|from|of)\s/i.test(text)) return false;
  if (/\s+(in|on|at|to|for|with|by|from|of)$/i.test(text)) return false;
  if (/^[^\w一-鿿]+$/.test(text)) return false;
  if (text.includes('Actor1:') || text.includes('Actor2:')) return false;
  if (text.includes('null') || text.includes('undefined')) return false;
  if (/^\d+$/.test(text)) return false;

  const invalidCnPatterns = [
    /^(的|了|在|是|我|你|他|她|它|们|这|那|有|和|与|或|但|因|为)/,
    /(的|了|在|是|我|你|他|她|它|们|这|那|有|和|与|或|但|因|为)$/,
  ];
  if (invalidCnPatterns.some(p => p.test(text))) return false;

  return true;
}

// ======================== 中文实体词典 ========================

const CHINESE_COUNTRIES = [
  { id: 'chn', name: '中国', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'usa', name: '美国', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'rus', name: '俄罗斯', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'jpn', name: '日本', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'kor', name: '韩国', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'prk', name: '朝鲜', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'gbr', name: '英国', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'fra', name: '法国', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'deu', name: '德国', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'ind', name: '印度', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'irn', name: '伊朗', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'isr', name: '以色列', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'ukr', name: '乌克兰', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'tur', name: '土耳其', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'sau', name: '沙特', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'aus', name: '澳大利亚', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'bra', name: '巴西', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'can', name: '加拿大', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'ita', name: '意大利', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'esp', name: '西班牙', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'pol', name: '波兰', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'pak', name: '巴基斯坦', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'zaf', name: '南非', type: 'country', category: 'countries', match_score: 0.95 },
  { id: 'egy', name: '埃及', type: 'country', category: 'countries', match_score: 0.95 },
];

const CHINESE_ORGS = [
  { id: 'cn-foreign', name: '外交部', aliases: ['中国外交部'], type: 'institution', category: 'geopolitical', match_score: 0.95 },
  { id: 'cn-commerce', name: '商务部', aliases: ['中国商务部'], type: 'institution', category: 'geopolitical', match_score: 0.95 },
  { id: 'cn-finance', name: '财政部', aliases: ['中国财政部'], type: 'institution', category: 'geopolitical', match_score: 0.95 },
  { id: 'pboc', name: '央行', aliases: ['中国人民银行', '人民银行'], type: 'institution', category: 'geopolitical', match_score: 0.95 },
  { id: 'state-council', name: '国务院', type: 'institution', category: 'geopolitical', match_score: 0.95 },
  { id: 'whitehouse', name: '白宫', type: 'institution', category: 'geopolitical', match_score: 0.95 },
  { id: 'pentagon', name: '五角大楼', type: 'institution', category: 'geopolitical', match_score: 0.95 },
  { id: 'kremlin', name: '克里姆林宫', type: 'institution', category: 'geopolitical', match_score: 0.95 },
  { id: 'fed', name: '美联储', type: 'institution', category: 'geopolitical', match_score: 0.95 },
  { id: 'nato', name: '北约', type: 'organization', category: 'organizations', match_score: 0.95 },
  { id: 'un', name: '联合国', type: 'organization', category: 'organizations', match_score: 0.95 },
  { id: 'imf', name: 'IMF', aliases: ['国际货币基金组织'], type: 'organization', category: 'organizations', match_score: 0.95 },
  { id: 'wto', name: '世贸组织', aliases: ['WTO', '世界贸易组织'], type: 'organization', category: 'organizations', match_score: 0.95 },
  { id: 'asean', name: '东盟', aliases: ['东南亚国家联盟'], type: 'organization', category: 'organizations', match_score: 0.95 },
  { id: 'opec', name: '欧佩克', aliases: ['石油输出国组织'], type: 'organization', category: 'organizations', match_score: 0.95 },
];

const CHINESE_CITIES = [
  { id: 'beijing', name: '北京', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'shanghai', name: '上海', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'hongkong', name: '香港', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'taipei', name: '台北', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'tokyo', name: '东京', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'seoul', name: '首尔', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'moscow', name: '莫斯科', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'london', name: '伦敦', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'paris', name: '巴黎', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'berlin', name: '柏林', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'rome', name: '罗马', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'brussels', name: '布鲁塞尔', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'tehran', name: '德黑兰', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'jerusalem', name: '耶路撒冷', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'kyiv', name: '基辅', type: 'city', category: 'cities', match_score: 0.95 },
  { id: 'washington', name: '华盛顿', type: 'city', category: 'cities', match_score: 0.95 },
];

const CHINESE_PERSONS = [
  { id: 'xi', name: '习近平', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'biden', name: '拜登', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'trump', name: '特朗普', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'putin', name: '普京', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'zelenskyy', name: '泽连斯基', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'netanyahu', name: '内塔尼亚胡', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'macron', name: '马克龙', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'scholz', name: '朔尔茨', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'modi', name: '莫迪', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'yoon', name: '尹锡悦', type: 'person', category: 'persons', match_score: 0.95 },
  { id: 'kishida', name: '岸田文雄', type: 'person', category: 'persons', match_score: 0.95 },
];

// 合并所有中文实体，按名称长度降序（贪心最长匹配）
function getAllChineseEntities() {
  const all = [...CHINESE_COUNTRIES, ...CHINESE_ORGS, ...CHINESE_CITIES, ...CHINESE_PERSONS];
  return all.sort((a, b) => b.name.length - a.name.length);
}

// ======================== 中文 NER ========================

/**
 * 贪心最长短语匹配 - 中文实体提取
 * 从左到右扫描，先尝试长短语，再回退到短词
 */
function extractChineseEntities(text) {
  const entities = [];
  const matchedRanges = []; // 已匹配的范围，避免重叠

  function isOverlapping(start, end) {
    for (const [ms, me] of matchedRanges) {
      if (start < me && end > ms) return true;
    }
    return false;
  }

  for (const entity of getAllChineseEntities()) {
    const name = entity.name;
    let offset = 0;

    while (true) {
      const idx = text.indexOf(name, offset);
      if (idx === -1) break;

      // 边界检查：确保不是子串误匹配
      if (containsExactWord(text, name) && !isOverlapping(idx, idx + name.length)) {
        entities.push({
          id: entity.id,
          name: entity.name,
          type: entity.type,
          category: entity.category,
          match_score: entity.match_score,
          match_type: 'exact',
        });
        matchedRanges.push([idx, idx + name.length]);
      }
      offset = idx + 1;
    }
  }

  // 也匹配别名（跳过已匹配的实体 ID）
  const matchedIds = new Set(entities.map(e => e.id));
  const allEntities = getAllChineseEntities();
  for (const entity of allEntities) {
    if (matchedIds.has(entity.id)) continue;
    if (entity.aliases && Array.isArray(entity.aliases)) {
      for (const alias of entity.aliases) {
        let offset = 0;
        while (true) {
          const idx = text.indexOf(alias, offset);
          if (idx === -1) break;

          if (containsExactWord(text, alias) && !isOverlapping(idx, idx + alias.length)) {
            entities.push({
              id: entity.id,
              name: alias,
              type: entity.type,
              category: entity.category,
              match_score: alias.length > 1 ? 0.95 : 0.85,
              match_type: 'exact',
            });
            matchedIds.add(entity.id);
            matchedRanges.push([idx, idx + alias.length]);
            break; // 每个实体只匹配一次
          }
          offset = idx + 1;
        }
      }
    }
  }

  // 按 ID 去重，保留最高分
  const deduped = [];
  const seenIds = new Set();
  for (const entity of entities.sort((a, b) => b.match_score - a.match_score)) {
    if (!seenIds.has(entity.id)) {
      deduped.push(entity);
      seenIds.add(entity.id);
    }
  }

  return deduped;
}

/**
 * 按类别过滤中文实体
 */
function extractChineseEntitiesByCategory(text, categories) {
  const entities = extractChineseEntities(text);
  return entities.filter(e => categories.includes(e.category));
}

/**
 * 按类型分组中文实体
 */
function groupChineseEntitiesByType(text) {
  const entities = extractChineseEntities(text);
  const groups = {};

  entities.forEach(entity => {
    if (!groups[entity.type]) {
      groups[entity.type] = [];
    }
    groups[entity.type].push(entity);
  });

  return groups;
}

/**
 * 中文 NER - 选择主体
 */
function selectChineseActor(title, content, { countryEntities, orgEntities, personEntities, groupedEntities }) {
  const fullText = `${title} ${content}`;

  // 优先级：人物 > 具体机构 > 国家
  const allEntities = [...(personEntities || []), ...(orgEntities || []), ...(countryEntities || [])];

  if (allEntities.length > 0) {
    // 先查标题中的具体机构
    const institutions = allEntities.filter(e =>
      ['institution', 'organization', 'geopolitical'].includes(e.category)
    );

    const relevantInstitutions = ['商务部', '外交部', '财政部', '央行', '国务院', '白宫', '五角大楼', '克里姆林宫', '美联储'];

    // 检查内容中的机构（精确边界匹配）
    for (const keyword of relevantInstitutions) {
      if (containsExactWord(content, keyword)) {
        const matched = institutions.find(e => e.name === keyword || (e.aliases && e.aliases.some(a => a === keyword)));
        if (matched) return matched.name;
      }
    }

    // 检查标题中的机构
    for (const keyword of relevantInstitutions) {
      if (containsExactWord(title, keyword)) {
        const matched = institutions.find(e => e.name === keyword || (e.aliases && e.aliases.some(a => a === keyword)));
        if (matched) return matched.name;
      }
    }

    // 回退到第一个机构
    if (institutions.length > 0) return institutions[0].name;

    // 回退到第一个国家
    const countries = allEntities.filter(e => e.type === 'country');
    if (countries.length > 0) return countries[0].name;

    return allEntities[0].name;
  }

  return 'Unknown Actor';
}

/**
 * 中文 NER - 选择客体
 */
function selectChineseObject(title, content, { countryEntities, orgEntities, personEntities, groupedEntities, actor }) {
  const allEntities = [
    ...(countryEntities || []),
    ...(orgEntities || []),
    ...(personEntities || []),
    ...(groupedEntities?.country || []),
    ...(groupedEntities?.organization || []),
    ...(groupedEntities?.institution || []),
    ...(groupedEntities?.person || []),
  ];

  const excludeNames = actor ? [actor.toLowerCase()] : [];
  const nonActorEntities = allEntities.filter(e =>
    !excludeNames.includes(e.name.toLowerCase())
  );

  if (nonActorEntities.length > 0) {
    return cleanActorObject(nonActorEntities[0].name) || null;
  }

  return null;
}

/**
 * 中文 NER - 选择位置
 */
function selectChineseLocation(title, content, cityEntities) {
  if (cityEntities && cityEntities.length > 0) {
    // 排除"北京时间"等时间格式
    for (const city of cityEntities) {
      if (title.includes(city.name) || content.includes(city.name)) {
        // 排除"北京时间"
        if (city.name === '北京' && content.includes('北京时间')) continue;
        return city.name;
      }
    }
  }
  return null;
}

/**
 * 中文 NER - 计算置信度
 */
function calculateChineseConfidence(entities, triggerKeywords, evidenceSnippets) {
  let confidence = 0.45;

  if (entities && entities.length > 0) confidence += 0.1;
  if (triggerKeywords && triggerKeywords.length > 0) confidence += 0.05;
  if (evidenceSnippets && evidenceSnippets.length > 0) confidence += 0.05;

  return Math.min(confidence, 0.9);
}

// ======================== 共享事件提取函数 ========================

/**
 * 提取事件代码
 */
function extractEventCode(title, content) {
  const lowerText = `${title} ${content}`.toLowerCase();

  if (/关税|tariff|sanction|制裁/.test(lowerText)) return '171';
  if (/protest|demonstrator|clash|riot|unrest|抗议|示威/.test(lowerText)) return '14';
  if (/meet|discussion|talk|negotiation|summit|consult|会谈|访问|签署|协议/.test(lowerText)) return '04';
  if (/launch|missile|attack|bomb|raid|shoot|assault|导弹|军事|演习/.test(lowerText)) return '18';

  if (/stock.*market|market.*stock|股市|股票|指数/.test(lowerText)) {
    if (/rally|gain|surge|rise|上涨|大涨/.test(lowerText)) return '013';
    if (/fall|drop|decline|下跌|大跌/.test(lowerText)) return '012';
    return '010';
  }

  if (/agree|cooperate|consensus|protocol|agreement|合作|共识/.test(lowerText)) return '036';
  if (/statement|announce|declare|say|respond|声明|宣布|表示/.test(lowerText)) return '010';

  return '010';
}

/**
 * 时间提取
 */
function extractTime(title, content) {
  const fullText = `${title} ${content}`;

  const patterns = [
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    /(\d{1,2})月(\d{1,2})日/,
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s+(\d{4}))?/i,
  ];

  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match) {
      const now = new Date();
      return now.toISOString();
    }
  }

  if (/today|今晚|今天/.test(fullText)) {
    return new Date().toISOString();
  }
  if (/yesterday|昨日/.test(fullText)) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString();
  }
  if (/tomorrow|明日/.test(fullText)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString();
  }

  return null;
}

/**
 * 话题检测
 */
function detectTopicEnhanced(title, content) {
  const lowerText = `${title} ${content}`.toLowerCase();

  const topics = {
    protest: ['抗议', '示威', '游行', '罢工', 'protest', 'demonstrator', 'clash', 'riot', 'unrest'],
    diplomacy: ['外交', '访问', '会谈', '签署', '协议', 'sanction', 'tariff', '制裁', '关税'],
    market: ['股市', '股票', '指数', '期货', '黄金', '石油', 'market', 'stock', 'rally', 'index', 'trading'],
    military: ['导弹', '军队', '军事', '演习', '战争', 'missile', 'military', 'launch', 'attack', 'raid'],
  };

  for (const [topic, keywords] of Object.entries(topics)) {
    if (keywords.some(k => lowerText.includes(k))) {
      return topic;
    }
  }

  return 'general';
}

/**
 * 提取触发关键词
 */
function extractTriggerKeywords(title, content) {
  const lowerText = `${title} ${content}`.toLowerCase();
  const keywords = [];

  const keywordPatterns = [
    { pattern: /protest|demonstrator|clash|riot|unrest|抗议|示威/, keywords: ['protest'] },
    { pattern: /meet|discussion|talk|negotiation|summit|consult|会谈/, keywords: ['meeting', 'summit'] },
    { pattern: /launch|missile|attack|bomb|raid|shoot|assault|导弹|军事/, keywords: ['missile', 'launch'] },
    { pattern: /关税|tariff|sanction|制裁/, keywords: ['关税', '制裁'] },
    { pattern: /statement|announce|declare|say|respond|声明|宣布|表示/, keywords: ['声明', '宣布', '表示'] },
    { pattern: /market|stock|rally|gain|surge|economic|股市|股票/, keywords: ['economic', 'market', 'stock'] },
  ];

  keywordPatterns.forEach(({ pattern, keywords: kw }) => {
    if (pattern.test(lowerText)) {
      keywords.push(...kw);
    }
  });

  return [...new Set(keywords)];
}

/**
 * 选择证据片段
 */
function selectEvidenceSnippets(title, content) {
  const fullText = `${title} ${content}`;
  const sentences = fullText.split(/[。！？.!?]/g).map(s => s.trim()).filter(Boolean);

  const snippets = sentences.map(s => {
    let snippet = s.trim()
      .replace(/\\n/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[^一-龥\w\s:'",\.\-，。！？、；：""''（）【】\[\]{}]/g, '')
      .trim();
    return snippet;
  }).filter(s => s.length > 0);

  return snippets.slice(0, 3).map(s => s.length > 260 ? s.substring(0, 257) + '...' : s);
}

/**
 * 因果建议提取
 */
function extractCausalSuggestion(title, content) {
  const fullText = `${title} ${content}`;
  if (/after|following|因为|由于/.test(fullText)) {
    const sentences = fullText.split(/[。！？.!?]/g).map(s => s.trim()).filter(Boolean);
    const suggestion = sentences.find(s => /after|following|因为|由于/.test(s));
    if (suggestion && suggestion.length > 260) {
      return suggestion.substring(0, 257) + '...';
    }
    return suggestion;
  }
  return null;
}

/**
 * 时间状态检测
 */
function detectTemporalStatus(title, content) {
  const lowerText = `${title} ${content}`.toLowerCase();

  if (/\b(?:will|planned|plan to|scheduled|expected|next week|next month|tomorrow|将|预计|计划)\b/.test(lowerText)) {
    return 'future';
  }
  if (/\b(?:ongoing|continues|continuing|still|remain|remains|meanwhile|持续|仍)\b/.test(lowerText)) {
    return 'ongoing';
  }

  return 'past';
}

/**
 * 计算置信度（英文/通用）
 */
function calculateConfidence(entities, triggerKeywords, evidenceSnippets) {
  let confidence = 0.45;

  if (entities && entities.length > 0) confidence += 0.1;
  if (triggerKeywords && triggerKeywords.length > 0) confidence += 0.05;
  if (evidenceSnippets && evidenceSnippets.length > 0) confidence += 0.05;

  return Math.min(confidence, 0.9);
}

// ======================== 英文 NER 选择器 ========================

/**
 * 英文 NER - 选择主体
 */
function selectActorEnhanced(title, content, { countryEntities, orgEntities, marketEntities, groupedEntities, personEntities }) {
  const lowerTitle = title.toLowerCase();
  const lowerText = `${title} ${content}`.toLowerCase();

  const allEntities = [
    ...(personEntities || []),
    ...(countryEntities || []),
    ...(orgEntities || []),
    ...(groupedEntities?.person || []),
    ...(groupedEntities?.country || []),
    ...(groupedEntities?.organization || []),
    ...(groupedEntities?.institution || []),
  ];

  if (allEntities.length > 0) {
    const specificInstitutions = allEntities.filter(e =>
      ['institution', 'geopolitical'].includes(e.category) &&
      ['商务部', '外交部', '财政部', '央行', '美联储', 'White House', 'Pentagon', 'Kremlin', 'Fed'].some(keyword =>
        e.name.includes(keyword) || (e.aliases && Array.isArray(e.aliases) && e.aliases.some(a => a.includes(keyword)))
      )
    );

    const relevantInstitutions = ['商务部', '外交部', '财政部', '央行', 'White House', 'Pentagon', 'Kremlin', 'Fed'];

    for (const keyword of relevantInstitutions) {
      if (containsExactWord(content, keyword)) {
        const matchedEntity = specificInstitutions.find(e =>
          e.name.includes(keyword) || (e.aliases && Array.isArray(e.aliases) && e.aliases.some(a => a.includes(keyword)))
        );
        if (matchedEntity) return matchedEntity.name;
      }
    }

    for (const keyword of relevantInstitutions) {
      if (containsExactWord(title, keyword)) {
        const matchedEntity = specificInstitutions.find(e =>
          e.name.includes(keyword) || (e.aliases && Array.isArray(e.aliases) && e.aliases.some(a => a.includes(keyword)))
        );
        if (matchedEntity) return matchedEntity.name;
      }
    }

    for (const entity of specificInstitutions) {
      if (lowerText.includes(entity.name.toLowerCase()) ||
          (entity.aliases && Array.isArray(entity.aliases) && entity.aliases.some(a => lowerText.includes(a.toLowerCase())))) {
        return entity.name;
      }
    }

    const institutionalEntities = allEntities.filter(e =>
      ['institution', 'organization', 'geopolitical'].includes(e.category) &&
      !specificInstitutions.some(specific => specific.id === e.id)
    );
    for (const entity of institutionalEntities) {
      if (title.includes(entity.name) || (entity.aliases && Array.isArray(entity.aliases) && entity.aliases.some(a => title.includes(a)))) {
        return entity.name;
      }
    }

    const titleCountries = allEntities.filter(e => e.type === 'country' && title.includes(e.name));
    if (titleCountries.length > 0) return titleCountries[0].name;

    for (const entity of institutionalEntities) {
      if (lowerText.includes(entity.name.toLowerCase()) ||
          (entity.aliases && Array.isArray(entity.aliases) && entity.aliases.some(a => lowerText.includes(a.toLowerCase())))) {
        return entity.name;
      }
    }

    const countryEntity = allEntities.find(e => e.type === 'country' && lowerText.includes(e.name.toLowerCase()));
    if (countryEntity) return countryEntity.name;

    const fallbackActor = allEntities[0]?.name;
    return cleanActorObject(fallbackActor) || 'Unknown Actor';
  }

  const semanticPatterns = [
    { pattern: /protesters?|demonstrators?|protest/i, result: 'Protesters' },
    { pattern: /US.*and.*China|China.*and.*US/i, result: 'US and China' },
    { pattern: /stock.*market|market.*stock/i, result: 'Stock Markets' },
    { pattern: /North Korea/i, result: 'North Korea' },
    { pattern: /UN Security Council|Security Council/i, result: 'Security Council' },
  ];

  for (const { pattern, result } of semanticPatterns) {
    if (pattern.test(lowerTitle)) return result;
  }

  const commonActors = ['中国', '美国', '俄罗斯', '朝鲜', '韩国', '日本', '英国', '法国', '德国'];
  for (const actor of commonActors) {
    if (title.includes(actor)) return actor;
  }

  return 'Unknown Actor';
}

/**
 * 英文 NER - 选择客体
 */
function selectObjectEnhanced(title, content, { countryEntities, orgEntities, marketEntities, groupedEntities, personEntities, cityEntities, actor }) {
  const lowerTitle = title.toLowerCase();
  const lowerText = `${title} ${content}`.toLowerCase();

  const protestPattern = /protesters?|demonstrators?/i.test(lowerTitle) && /police/i.test(title);
  if (protestPattern) return 'police';

  if (/加征关税|关税|tariff|sanction|制裁/.test(lowerText)) {
    const countryNames = ['美国', '日本', '韩国', '德国', '法国', '英国', '俄罗斯'];
    for (const countryName of countryNames) {
      if (title.includes(countryName) || content.includes(countryName)) {
        return countryName;
      }
    }
  }

  const excludeNames = actor ? [actor.toLowerCase()] : [];

  const allEntities = [
    ...(marketEntities || []),
    ...(countryEntities || []),
    ...(cityEntities || []),
    ...(personEntities || []),
    ...(orgEntities || []),
    ...(groupedEntities?.commodity || []),
    ...(groupedEntities?.cryptocurrency || []),
    ...(groupedEntities?.currency || []),
    ...(groupedEntities?.index || []),
  ];

  if (allEntities.length > 0) {
    const nonActorEntities = allEntities.filter(e => !excludeNames.includes(e.name.toLowerCase()));

    if (nonActorEntities.length > 0) {
      const titleObj = nonActorEntities.find(e =>
        title.includes(e.name) || (e.aliases && Array.isArray(e.aliases) && e.aliases.some(a => title.includes(a)))
      );
      if (titleObj) return titleObj.name;

      for (const entity of nonActorEntities) {
        if (lowerText.includes(entity.name.toLowerCase()) ||
            (entity.aliases && Array.isArray(entity.aliases) && entity.aliases.some(a => lowerText.includes(a.toLowerCase())))) {
          return entity.name;
        }
      }

      return cleanActorObject(nonActorEntities[0].name) || null;
    }
  }

  return null;
}

/**
 * 英文 NER - 选择位置
 */
function selectLocation(title, content, cityEntities) {
  if (cityEntities && Array.isArray(cityEntities) && cityEntities.length > 0) {
    for (const city of cityEntities) {
      if (city && (title.includes(city.name) || (city.aliases && Array.isArray(city.aliases) && city.aliases.some(a => title.includes(a))))) {
        return city.name;
      }
    }
  }

  const chineseLocations = ['北京', '上海', '广州', '深圳', '香港', '澳门', '台北', '东京', '首尔', '莫斯科', '伦敦', '巴黎'];
  for (const loc of chineseLocations) {
    if ((title.includes(loc) || content.includes(loc)) && !content.includes('时间')) {
      return loc;
    }
  }

  const potentialLocations = ['Paris', 'Tokyo', '北京', '上海', '华盛顿', '莫斯科', '基辅', '德黑兰', '耶路撒冷'];
  for (const loc of potentialLocations) {
    if (title.includes(loc) && !title.includes('时间')) {
      return loc;
    }
  }

  return null;
}

// ======================== 导出函数 ========================

/**
 * 中文新闻解析 - 使用内置中文实体词典 + 边界正则匹配
 * 集成 jieba NLP 服务进行中文事件提取
 */
export async function parseChineseNews(title, content) {
  const fullText = `${title} ${content || ''}`;

  // 实体提取
  const entities = extractChineseEntities(fullText);
  const countryEntities = extractChineseEntitiesByCategory(fullText, ['countries']);
  const orgEntities = extractChineseEntitiesByCategory(fullText, ['geopolitical', 'organizations']);
  const cityEntities = extractChineseEntitiesByCategory(fullText, ['cities']);
  const personEntities = entities.filter(e => e.category === 'persons');

  // 按类型分组
  const groupedEntities = groupChineseEntitiesByType(fullText);

  // 调用 jieba NLP 服务获取事件结构
  let nlpEvent = null;
  try {
    const nlpEvents = await extractChineseEvents(fullText);
    if (nlpEvents && nlpEvents.length > 0) {
      nlpEvent = nlpEvents[0];
    }
  } catch (e) {
    // NLP 服务不可用时静默降级
  }

  // 事件要素提取
  const eventCode = nlpEvent?.cameo_code || extractEventCode(title, content);
  const action = mapCameoCode(eventCode);

  // 融合 NLP 结果与实体提取
  const actor = nlpEvent?.arguments?.actor ||
    selectChineseActor(title, content, { countryEntities, orgEntities, personEntities, groupedEntities });
  const object = nlpEvent?.arguments?.target ||
    selectChineseObject(title, content, { countryEntities, orgEntities, personEntities, groupedEntities, actor });
  const location = nlpEvent?.arguments?.location || selectChineseLocation(title, content, cityEntities);
  const time = extractTime(title, content);
  const topic = detectTopicEnhanced(title, content);
  const triggerKeywords = nlpEvent?.trigger ? [nlpEvent.trigger] : extractTriggerKeywords(title, content);
  const evidenceSnippets = selectEvidenceSnippets(title, content);
  const confidence = nlpEvent?.confidence || calculateChineseConfidence(entities, triggerKeywords, evidenceSnippets);

  return {
    proto_events: [{
      actor,
      action,
      object,
      location,
      time,
      confidence,
      metadata: {
        actors: actor ? [actor] : [],
        objects: object ? [object] : [],
        raw_action: action,
        normalized_action: action,
        event_type: topic,
        event_code: eventCode,
        causal_suggestion: extractCausalSuggestion(title, content),
        trigger_keywords: triggerKeywords,
        evidence_snippets: evidenceSnippets,
        temporal_status: detectTemporalStatus(title, content),
        matched_entities: entities.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          category: e.category,
          score: e.match_score,
        })),
        // 新增：jieba 特有字段
        pos_tags: nlpEvent?.pos_tags || null,
        event_arguments: nlpEvent?.arguments || null,
      },
    }],
    topic,
    sentiment: 0,
    entities: groupedEntities,
  };
}

/**
 * 英文新闻解析 - 使用 entity-index + 边界匹配 + 分层置信度
 * 集成 spaCy NLP 服务进行依存分析事件提取
 */
export async function parseEnglishNews(title, content) {
  const fullText = `${title} ${content || ''}`;

  // 实体提取（使用 entity-index）
  const entities = extractEntities(fullText);
  const countryEntities = extractEntitiesByCategory(fullText, ['countries']);
  const orgEntities = extractEntitiesByCategory(fullText, ['organizations', 'geopolitical']);
  const marketEntities = extractEntitiesByCategory(fullText, ['indices', 'commodities', 'cryptocurrencies', 'currencies']);
  const cityEntities = extractEntitiesByCategory(fullText, ['cities']);
  const personEntities = extractEntitiesByCategory(fullText, ['persons']);

  // 按类型分组
  const groupedEntities = groupEntitiesByType(fullText);

  // 调用 spaCy NLP 服务获取事件结构
  let nlpEvent = null;
  try {
    const nlpEvents = await extractEnglishEvents(fullText);
    if (nlpEvents && nlpEvents.length > 0) {
      nlpEvent = nlpEvents[0];
    }
  } catch (e) {
    // NLP 服务不可用时静默降级
  }

  // 事件要素提取
  const eventCode = nlpEvent?.cameo_code || extractEventCode(title, content);
  const action = mapCameoCode(eventCode);

  // 融合 NLP 结果与实体提取
  const actor = nlpEvent?.arguments?.actor ||
    selectActorEnhanced(title, content, {
      countryEntities, orgEntities, marketEntities, groupedEntities, personEntities,
    });
  const object = nlpEvent?.arguments?.target ||
    selectObjectEnhanced(title, content, {
      countryEntities, orgEntities, marketEntities, groupedEntities, personEntities, cityEntities, actor,
    });
  const location = nlpEvent?.arguments?.location ||
    selectLocation(title, content, cityEntities);
  const time = extractTime(title, content);
  const topic = nlpEvent?.event_type || detectTopicEnhanced(title, content);
  const triggerKeywords = nlpEvent?.trigger ? [nlpEvent.trigger] : extractTriggerKeywords(title, content);
  const evidenceSnippets = selectEvidenceSnippets(title, content);
  const confidence = nlpEvent?.confidence || calculateConfidence(entities, triggerKeywords, evidenceSnippets);

  return {
    proto_events: [{
      actor,
      action,
      object,
      location,
      time,
      confidence,
      metadata: {
        actors: actor ? [actor] : [],
        objects: object ? [object] : [],
        raw_action: action,
        normalized_action: action,
        event_type: topic,
        event_code: eventCode,
        causal_suggestion: extractCausalSuggestion(title, content),
        trigger_keywords: triggerKeywords,
        evidence_snippets: evidenceSnippets,
        temporal_status: detectTemporalStatus(title, content),
        matched_entities: entities.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          category: e.category,
          score: e.match_score,
        })),
        // 新增：spaCy 特有字段
        dependency_parse: nlpEvent?.dep_tree || null,
        trigger_lemma: nlpEvent?.trigger_lemma || null,
        event_arguments: nlpEvent?.arguments || null,
      },
    }],
    topic,
    sentiment: 0,
    entities: groupedEntities,
  };
}

/**
 * 向后兼容：保留原有函数名，默认调用英文解析
 */
export async function extractProtoEventsEnhanced(title, content) {
  return parseEnglishNews(title, content);
}

export default {
  parseChineseNews,
  parseEnglishNews,
  extractProtoEventsEnhanced,
};
