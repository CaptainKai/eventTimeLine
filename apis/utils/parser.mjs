/**
 * 事件解析工具函数
 */

/**
 * CAMEO事件代码映射
 */
export const CAMEO_CODES = {
  '01': 'Make statement',
  '010': 'Make statement, not specified below',
  '011': 'Decline comment',
  '012': 'Make a pessimistic comment',
  '013': 'Make an optimistic comment',
  '014': 'Discuss material cooperation',
  '015': 'Engage in diplomatic cooperation',
  '016': 'Engage in material cooperation',
  '017': 'Provide diplomatic aid',
  '018': 'Express intent to provide military aid',
  '02': 'Appeal',
  '020': 'Appeal, not specified below',
  '021': 'Appeal for material cooperation',
  '022': 'Appeal for diplomatic cooperation',
  '023': 'Appeal for economic cooperation',
  '024': 'Appeal for military cooperation',
  '03': 'Express intent to cooperate',
  '030': 'Express intent to cooperate, not specified below',
  '031': 'Express intent to engage in material cooperation',
  '032': 'Express intent to engage in diplomatic cooperation',
  '033': 'Express intent to engage in economic cooperation',
  '034': 'Express intent to engage in military cooperation',
  '04': 'Consult',
  '040': 'Consult, not specified below',
  '041': 'Consult on policy',
  '042': 'Consult on military',
  '043': 'Consult on economic',
  '044': 'Consult on judicial',
  '045': 'Consult on humanitarian',
  '05': 'Engage in diplomatic cooperation',
  '050': 'Engage in diplomatic cooperation, not specified below',
  '051': 'Exchange diplomatic visit',
  '052': 'Host a visit',
  '053': 'Make a visit',
  '054': 'Negotiate',
  '055': 'Sign a treaty or agreement',
  '056': 'Renounce a treaty',
  '057': 'Ratify a treaty',
  '058': 'Sign or ratify a constitution',
  '06': 'Engage in material cooperation',
  '060': 'Engage in material cooperation, not specified below',
  '061': 'Provide material aid',
  '062': 'Provide economic aid',
  '063': 'Provide military aid',
  '064': 'Provide humanitarian aid',
  '065': 'Provide development aid',
  '07': 'Provide aid',
  '070': 'Provide aid, not specified below',
  '071': 'Provide economic aid',
  '072': 'Provide military aid',
  '073': 'Provide humanitarian aid',
  '074': 'Provide development aid',
  '075': 'Provide other aid',
  '08': 'Yield',
  '080': 'Yield, not specified below',
  '081': 'Yield to demands',
  '082': 'Make concessions',
  '083': 'Compromise',
  '084': 'Return property',
  '085': 'Release persons',
  '086': 'Make political concessions',
  '087': 'Make economic concessions',
  '088': 'Make military concessions',
  '09': 'Investigate',
  '090': 'Investigate, not specified below',
  '091': 'Investigate crime',
  '092': 'Investigate corruption',
  '093': 'Investigate human rights abuses',
  '094': 'Investigate other',
  '10': 'Demand',
  '100': 'Demand, not specified below',
  '101': 'Demand material cooperation',
  '102': 'Demand diplomatic cooperation',
  '103': 'Demand economic cooperation',
  '104': 'Demand military cooperation',
  '105': 'Demand political reform',
  '106': 'Demand policy change',
  '11': 'Disapprove',
  '110': 'Disapprove, not specified below',
  '111': 'Disapprove of material policy',
  '112': 'Disapprove of diplomatic policy',
  '113': 'Disapprove of economic policy',
  '114': 'Disapprove of military policy',
  '115': 'Disapprove of political policy',
  '12': 'Reject',
  '120': 'Reject, not specified below',
  '121': 'Reject material cooperation',
  '122': 'Reject diplomatic cooperation',
  '123': 'Reject economic cooperation',
  '124': 'Reject military cooperation',
  '125': 'Reject demands',
  '126': 'Reject treaty',
  '127': 'Reject other',
  '13': 'Threaten',
  '130': 'Threaten, not specified below',
  '131': 'Threaten with political pressure',
  '132': 'Threaten with military force',
  '133': 'Threaten with economic sanctions',
  '134': 'Threaten with other',
  '14': 'Protest',
  '140': 'Protest, not specified below',
  '141': 'Demonstrate or rally',
  '142': 'Hunger strike',
  '143': 'Boycott or embargo',
  '144': 'Strike or walkout',
  '145': 'Obstruct passage',
  '146': 'Sit-in',
  '15': 'Exhibit force posture',
  '150': 'Exhibit force posture, not specified below',
  '151': 'Military alert',
  '152': 'Military mobilization',
  '153': 'Military deployment',
  '154': 'Weapons testing',
  '155': 'Other force posture',
  '16': 'Reduce relations',
  '160': 'Reduce relations, not specified below',
  '161': 'Suspend diplomatic relations',
  '162': 'Close diplomatic office',
  '163': 'Expel officials',
  '164': 'Reduce or suspend aid',
  '165': 'Impose embargo or boycott',
  '166': 'Other relation reduction',
  '17': 'Coerce',
  '170': 'Coerce, not specified below',
  '171': 'Impose economic sanctions',
  '172': 'Impose political sanctions',
  '173': 'Halt negotiations',
  '174': 'Other coercion',
  '18': 'Assault',
  '180': 'Assault, not specified below',
  '181': 'Physically assault',
  '182': 'Kidnap or take hostages',
  '183': 'Car bomb attack',
  '184': 'Other terrorist attack',
  '185': 'Other assault',
  '19': 'Fight',
  '190': 'Fight, not specified below',
  '191': 'Engage in armed conflict',
  '192': 'Use unconventional mass violence',
  '193': 'Engage in aerial warfare',
  '194': 'Engage in ground warfare',
  '195': 'Engage in naval warfare',
  '196': 'Other fight',
  '20': 'Use unconventional mass violence',
  '200': 'Use unconventional mass violence, not specified below',
  '201': 'Use chemical weapons',
  '202': 'Use biological weapons',
  '203': 'Use nuclear weapons',
  '204': 'Other mass violence',
};

/**
 * 将CAMEO事件代码转换为人类可读的事件类型
 */
export function mapCameoCode(eventCode) {
  if (!eventCode) return 'Unknown';

  // 尝试完整匹配
  if (CAMEO_CODES[eventCode]) {
    return CAMEO_CODES[eventCode].replace(/, not specified below$/, '');
  }

  // 尝试前两位匹配
  const twoDigit = eventCode.substring(0, 2);
  if (CAMEO_CODES[twoDigit]) {
    return CAMEO_CODES[twoDigit].replace(/, not specified below$/, '');
  }

  return 'Unknown';
}

/**
 * 计算事件重要性
 */
export function calculateImportance(event) {
  let importance = 0;

  // 基于提及次数
  if (event.mentions) {
    importance += Math.min(event.mentions * 0.1, 2);
  }

  // 基于情感强度
  if (event.tone !== undefined) {
    const tone = Number(event.tone) || 0;
    importance += Math.max(tone, 0) * 0.05;
    importance += Math.abs(Math.min(tone, 0)) * 0.15;
  }

  // 基于事件类型
  if (event.event_code) {
    const code = parseInt(event.event_code);
    // 冲突事件更重要
    if (code >= 15) {
      importance += 2;
    }
    // 抗议和威胁
    else if (code >= 13) {
      importance += 1;
    }
    // 合作事件
    else if (code < 10) {
      importance += 0.5;
    }
  }

  return Math.min(importance, 10);
}

/**
 * 清理和标准化文本
 */
export function cleanText(text) {
  if (!text) return '';
  // 保留中文字符、常见标点、英文、数字和空格
  return text
    .trim()
    .replace(/\\n/g, '')
    .replace(/\s+/g, ' ')
    // 保留中文字符、日文平假名、片假名、韩文、英文、数字和基本标点
    .replace(/[^\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\w\s:'",\.\-，。！？、；：""''（）【】\[\]{}]/g, '')
    .replace(/[\r\n]+/g, '');
}
