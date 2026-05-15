/**
 * 实体数据库 - 借鉴 WorldMonitor 的 600+ 预定义实体
 * 包含金融、地缘政治、科技、医疗等领域的实体
 */

export const ENTITY_DATABASE = {
  // 国家和地区实体
  countries: [
    { id: 'usa', name: 'United States', aliases: ['USA', 'U.S.', 'U.S.A', '美国', '美方', '华盛顿'], keywords: ['Washington', 'White House', 'Pentagon', 'American'], type: 'country', sector: 'north-america' },
    { id: 'chn', name: 'China', aliases: ['PRC', '中国', '中华人民共和国', '中方', '北京'], keywords: ['Beijing', 'Chinese'], type: 'country', sector: 'asia' },
    { id: 'rus', name: 'Russia', aliases: ['Russian Federation', '俄罗斯', '俄方', '莫斯科'], keywords: ['Moscow', 'Russian', 'Kremlin'], type: 'country', sector: 'europe' },
    { id: 'ukr', name: 'Ukraine', aliases: ['乌克兰'], keywords: ['Kyiv', 'Ukrainian'], type: 'country', sector: 'europe' },
    { id: 'isr', name: 'Israel', aliases: ['以色列'], keywords: ['Jerusalem', 'Israeli'], type: 'country', sector: 'middle-east' },
    { id: 'pse', name: 'Palestine', aliases: ['巴勒斯坦'], keywords: ['Palestinian', 'Gaza', 'West Bank'], type: 'country', sector: 'middle-east' },
    { id: 'eur', name: 'European Union', aliases: ['EU', '欧盟', '欧洲联盟'], keywords: ['Brussels', 'European'], type: 'region', sector: 'europe' },
    { id: 'gbr', name: 'United Kingdom', aliases: ['UK', '英国', '大不列颠'], keywords: ['London', 'British'], type: 'country', sector: 'europe' },
    { id: 'fra', name: 'France', aliases: ['法国'], keywords: ['Paris', 'French'], type: 'country', sector: 'europe' },
    { id: 'deu', name: 'Germany', aliases: ['德国'], keywords: ['Berlin', 'German'], type: 'country', sector: 'europe' },
    { id: 'jpn', name: 'Japan', aliases: ['日本', '日方', '东京'], keywords: ['Tokyo', 'Japanese'], type: 'country', sector: 'asia' },
    { id: 'kor', name: 'South Korea', aliases: ['Korea', '韩国', '大韩民国'], keywords: ['Seoul', 'Korean'], type: 'country', sector: 'asia' },
    { id: 'prk', name: 'North Korea', aliases: ['DPRK', '朝鲜', '北韩'], keywords: ['Pyongyang', 'North Korean'], type: 'country', sector: 'asia' },
    { id: 'irn', name: 'Iran', aliases: ['伊朗'], keywords: ['Tehran', 'Iranian'], type: 'country', sector: 'middle-east' },
    { id: 'tur', name: 'Turkey', aliases: ['土耳其'], keywords: ['Ankara', 'Turkish'], type: 'country', sector: 'middle-east' },
    { id: 'sau', name: 'Saudi Arabia', aliases: ['沙特', '沙特阿拉伯'], keywords: ['Riyadh', 'Saudi'], type: 'country', sector: 'middle-east' },
    { id: 'egy', name: 'Egypt', aliases: ['埃及'], keywords: ['Cairo', 'Egyptian'], type: 'country', sector: 'middle-east' },
    { id: 'ind', name: 'India', aliases: ['印度'], keywords: ['New Delhi', 'Indian'], type: 'country', sector: 'asia' },
    { id: 'aus', name: 'Australia', aliases: ['澳大利亚', '澳洲'], keywords: ['Canberra', 'Australian'], type: 'country', sector: 'oceania' },
    { id: 'bra', name: 'Brazil', aliases: ['巴西'], keywords: ['Brasilia', 'Brazilian'], type: 'country', sector: 'south-america' },
    { id: 'can', name: 'Canada', aliases: ['加拿大'], keywords: ['Ottawa', 'Canadian'], type: 'country', sector: 'north-america' },
    { id: 'ita', name: 'Italy', aliases: ['意大利'], keywords: ['Rome', 'Italian'], type: 'country', sector: 'europe' },
    { id: 'esp', name: 'Spain', aliases: ['西班牙'], keywords: ['Madrid', 'Spanish'], type: 'country', sector: 'europe' },
    { id: 'pol', name: 'Poland', aliases: ['波兰'], keywords: ['Warsaw', 'Polish'], type: 'country', sector: 'europe' },
    { id: 'pak', name: 'Pakistan', aliases: ['巴基斯坦'], keywords: ['Islamabad', 'Pakistani'], type: 'country', sector: 'asia' },
    { id: 'zaf', name: 'South Africa', aliases: ['南非'], keywords: ['Pretoria', 'South African'], type: 'country', sector: 'africa' },
  ],

  // 国际组织实体
  organizations: [
    { id: 'un', name: 'United Nations', aliases: ['UN', '联合国'], keywords: ['UN General Assembly', 'UN Security Council'], type: 'organization', sector: 'international' },
    { id: 'nato', name: 'NATO', aliases: ['North Atlantic Treaty Organization', '北约'], keywords: ['Brussels HQ'], type: 'organization', sector: 'military' },
    { id: 'who', name: 'World Health Organization', aliases: ['WHO', '世界卫生组织'], keywords: ['Geneva', 'WHO'], type: 'organization', sector: 'health' },
    { id: 'imf', name: 'International Monetary Fund', aliases: ['IMF', '国际货币基金组织'], keywords: ['IMF', 'fund'], type: 'organization', sector: 'finance' },
    { id: 'wb', name: 'World Bank', aliases: ['世界银行'], keywords: ['World Bank'], type: 'organization', sector: 'finance' },
    { id: 'wto', name: 'World Trade Organization', aliases: ['WTO', '世界贸易组织'], keywords: ['WTO', 'trade dispute'], type: 'organization', sector: 'trade' },
    { id: 'oecd', name: 'OECD', aliases: ['Organisation for Economic Co-operation and Development', '经合组织'], keywords: ['OECD'], type: 'organization', sector: 'economy' },
    { id: 'opec', name: 'OPEC', aliases: ['Organization of Petroleum Exporting Countries', '石油输出国组织'], keywords: ['OPEC', 'oil output'], type: 'organization', sector: 'energy' },
    { id: 'asean', name: 'ASEAN', aliases: ['Association of Southeast Asian Nations', '东盟'], keywords: ['ASEAN', 'Southeast Asian'], type: 'organization', sector: 'international' },
    { id: 'g7', name: 'G7', aliases: ['Group of Seven', '七国集团'], keywords: ['G7', 'summit'], type: 'organization', sector: 'international' },
    { id: 'g20', name: 'G20', aliases: ['Group of Twenty', '二十国集团'], keywords: ['G20', 'summit'], type: 'organization', sector: 'international' },
  ],

  // 金融市场实体 - 股票指数
  indices: [
    { id: 'sp500', name: 'S&P 500', aliases: ['SPX', 'S&P', '标普500', '标普'], type: 'index', sector: 'finance' },
    { id: 'dow', name: 'Dow Jones Industrial Average', aliases: ['DJIA', 'Dow', '道琼斯', '道指'], type: 'index', sector: 'finance' },
    { id: 'nasdaq', name: 'NASDAQ', aliases: ['Nasdaq', '纳斯达克'], type: 'index', sector: 'finance' },
    { id: 'ftse', name: 'FTSE 100', aliases: ['Financial Times Stock Exchange', '富时100', '富时'], type: 'index', sector: 'finance' },
    { id: 'dax', name: 'DAX', aliases: ['德国DAX'], type: 'index', sector: 'finance' },
    { id: 'cac', name: 'CAC 40', aliases: ['法国CAC'], type: 'index', sector: 'finance' },
    { id: 'nikkei', name: 'Nikkei 225', aliases: ['Nikkei', '日经225', '日经'], type: 'index', sector: 'finance' },
    { id: 'hangseng', name: 'Hang Seng Index', aliases: ['HSI', '恒生指数', '恒生'], type: 'index', sector: 'finance' },
    { id: 'sse', name: 'Shanghai Composite', aliases: ['SSE', '上证指数', '沪指'], type: 'index', sector: 'finance' },
    { id: 'szse', name: 'Shenzhen Component', aliases: ['SZSE', '深证成指', '深指'], type: 'index', sector: 'finance' },
  ],

  // 商品实体
  commodities: [
    { id: 'oil', name: 'Crude Oil', aliases: ['WTI', 'Brent', '石油', '原油'], keywords: ['crude', 'barrel'], type: 'commodity', sector: 'energy' },
    { id: 'gold', name: 'Gold', aliases: ['XAU', '黄金'], keywords: ['gold', 'precious metal'], type: 'commodity', sector: 'metals' },
    { id: 'silver', name: 'Silver', aliases: ['XAG', '白银'], keywords: ['silver'], type: 'commodity', sector: 'metals' },
    { id: 'copper', name: 'Copper', aliases: ['铜'], keywords: ['copper'], type: 'commodity', sector: 'metals' },
    { id: 'natgas', name: 'Natural Gas', aliases: ['NG', '天然气'], keywords: ['natural gas', 'LNG'], type: 'commodity', sector: 'energy' },
    { id: 'wheat', name: 'Wheat', aliases: ['小麦'], keywords: ['wheat', 'grain'], type: 'commodity', sector: 'agriculture' },
    { id: 'corn', name: 'Corn', aliases: ['玉米'], keywords: ['corn', 'maize'], type: 'commodity', sector: 'agriculture' },
    { id: 'soybeans', name: 'Soybeans', aliases: ['大豆'], keywords: ['soybean', 'soy'], type: 'commodity', sector: 'agriculture' },
  ],

  // 加密货币实体
  cryptocurrencies: [
    { id: 'btc', name: 'Bitcoin', aliases: ['BTC', '比特币'], keywords: ['bitcoin', 'crypto'], type: 'cryptocurrency', sector: 'crypto' },
    { id: 'eth', name: 'Ethereum', aliases: ['ETH', '以太币', '以太坊'], keywords: ['ethereum'], type: 'cryptocurrency', sector: 'crypto' },
    { id: 'usdt', name: 'Tether', aliases: ['USDT', '泰达币'], keywords: ['tether', 'stablecoin'], type: 'cryptocurrency', sector: 'crypto' },
    { id: 'sol', name: 'Solana', aliases: ['SOL'], keywords: ['solana'], type: 'cryptocurrency', sector: 'crypto' },
    { id: 'xrp', name: 'Ripple', aliases: ['XRP', '瑞波币'], keywords: ['ripple'], type: 'cryptocurrency', sector: 'crypto' },
  ],

  // 货币实体
  currencies: [
    { id: 'usd', name: 'US Dollar', aliases: ['USD', '美元', '$'], keywords: ['dollar', 'greenback'], type: 'currency', sector: 'finance' },
    { id: 'eur', name: 'Euro', aliases: ['EUR', '欧元', '€'], keywords: ['euro'], type: 'currency', sector: 'finance' },
    { id: 'cny', name: 'Chinese Yuan', aliases: ['CNY', '人民币', 'RMB', '¥'], keywords: ['yuan', 'renminbi'], type: 'currency', sector: 'finance' },
    { id: 'jpy', name: 'Japanese Yen', aliases: ['JPY', '日元', '¥'], keywords: ['yen'], type: 'currency', sector: 'finance' },
    { id: 'gbp', name: 'British Pound', aliases: ['GBP', '英镑', '£'], keywords: ['pound', 'sterling'], type: 'currency', sector: 'finance' },
  ],

  // 地缘政治机构
  geopolitical: [
    { id: 'whitehouse', name: 'White House', aliases: ['白宫'], keywords: ['White House'], type: 'institution', sector: 'government' },
    { id: 'kremlin', name: 'Kremlin', aliases: ['克里姆林宫'], keywords: ['Kremlin'], type: 'institution', sector: 'government' },
    { id: 'pentagon', name: 'The Pentagon', aliases: ['五角大楼'], keywords: ['Pentagon'], type: 'institution', sector: 'government' },
    { id: 'cn-foreign', name: 'Ministry of Foreign Affairs of China', aliases: ['中国外交部', '外交部'], keywords: ['Foreign Ministry', 'spokesperson'], type: 'institution', sector: 'government' },
    { id: 'cn-commerce', name: 'Ministry of Commerce of China', aliases: ['中国商务部', '商务部'], keywords: ['Commerce Ministry', 'MOFCOM'], type: 'institution', sector: 'government' },
    { id: 'cn-finance', name: 'Ministry of Finance of China', aliases: ['中国财政部', '财政部'], keywords: ['Finance Ministry'], type: 'institution', sector: 'government' },
    { id: 'fed', name: 'Federal Reserve', aliases: ['Fed', '美联储', '联邦储备系统'], keywords: ['Federal Reserve', 'Fed', 'FOMC', 'Powell'], type: 'institution', sector: 'finance' },
    { id: 'pboc', name: "People's Bank of China", aliases: ['PBOC', '中国人民银行', '央行'], keywords: ['PBOC', 'central bank'], type: 'institution', sector: 'finance' },
    { id: 'ecb', name: 'European Central Bank', aliases: ['ECB', '欧洲央行'], keywords: ['ECB', 'Lagarde'], type: 'institution', sector: 'finance' },
    { id: 'boj', name: 'Bank of Japan', aliases: ['BOJ', '日本央行'], keywords: ['BOJ'], type: 'institution', sector: 'finance' },
  ],

  // 主要城市
  cities: [
    { id: 'beijing', name: 'Beijing', aliases: ['北京'], type: 'city', sector: 'asia' },
    { id: 'shanghai', name: 'Shanghai', aliases: ['上海'], type: 'city', sector: 'asia' },
    { id: 'washington', name: 'Washington, DC', aliases: ['Washington', '华盛顿'], type: 'city', sector: 'north-america' },
    { id: 'newyork', name: 'New York', aliases: ['NYC', '纽约'], type: 'city', sector: 'north-america' },
    { id: 'moscow', name: 'Moscow', aliases: ['莫斯科'], type: 'city', sector: 'europe' },
    { id: 'london', name: 'London', aliases: ['伦敦'], type: 'city', sector: 'europe' },
    { id: 'tokyo', name: 'Tokyo', aliases: ['东京'], type: 'city', sector: 'asia' },
    { id: 'geneva', name: 'Geneva', aliases: ['日内瓦'], type: 'city', sector: 'europe' },
    { id: 'tehran', name: 'Tehran', aliases: ['德黑兰'], type: 'city', sector: 'middle-east' },
    { id: 'ankara', name: 'Ankara', aliases: ['安卡拉'], type: 'city', sector: 'middle-east' },
    { id: 'jerusalem', name: 'Jerusalem', aliases: ['耶路撒冷'], type: 'city', sector: 'middle-east' },
    { id: 'kyiv', name: 'Kyiv', aliases: ['Kiev', '基辅'], type: 'city', sector: 'europe' },
    { id: 'islamabad', name: 'Islamabad', aliases: ['伊斯兰堡'], type: 'city', sector: 'asia' },
    { id: 'karachi', name: 'Karachi', aliases: ['卡拉奇'], type: 'city', sector: 'asia' },
    { id: 'lahore', name: 'Lahore', aliases: ['拉合尔'], type: 'city', sector: 'asia' },
    { id: 'rawalpindi', name: 'Rawalpindi', aliases: ['拉瓦尔品第'], type: 'city', sector: 'asia' },
    { id: 'mumbai', name: 'Mumbai', aliases: ['孟买'], type: 'city', sector: 'asia' },
    { id: 'delhi', name: 'New Delhi', aliases: ['新德里', '德里'], type: 'city', sector: 'asia' },
    { id: 'paris', name: 'Paris', aliases: ['巴黎'], type: 'city', sector: 'europe' },
    { id: 'berlin', name: 'Berlin', aliases: ['柏林'], type: 'city', sector: 'europe' },
    { id: 'rome', name: 'Rome', aliases: ['罗马'], type: 'city', sector: 'europe' },
    { id: 'brussels', name: 'Brussels', aliases: ['布鲁塞尔'], type: 'city', sector: 'europe' },
    { id: 'seoul', name: 'Seoul', aliases: ['首尔'], type: 'city', sector: 'asia' },
    { id: 'taipei', name: 'Taipei', aliases: ['台北'], type: 'city', sector: 'asia' },
    { id: 'hongkong', name: 'Hong Kong', aliases: ['香港', 'HK'], type: 'city', sector: 'asia' },
  ],

  // 政治人物
  persons: [
    { id: 'biden', name: 'Joe Biden', aliases: ['拜登', '乔·拜登'], keywords: ['Biden'], type: 'person', sector: 'politics' },
    { id: 'trump', name: 'Donald Trump', aliases: ['特朗普', '唐纳德·特朗普'], keywords: ['Trump'], type: 'person', sector: 'politics' },
    { id: 'putin', name: 'Vladimir Putin', aliases: ['普京', '弗拉基米尔·普京'], keywords: ['Putin'], type: 'person', sector: 'politics' },
    { id: 'zelenskyy', name: 'Volodymyr Zelenskyy', aliases: ['泽连斯基', '弗拉基米尔·泽连斯基'], keywords: ['Zelenskyy', 'Zelensky'], type: 'person', sector: 'politics' },
    { id: 'vance', name: 'J.D. Vance', aliases: ['万斯', 'J·D·万斯'], keywords: ['Vance'], type: 'person', sector: 'politics' },
    { id: 'netanyahu', name: 'Benjamin Netanyahu', aliases: ['内塔尼亚胡', '本雅明·内塔尼亚胡'], keywords: ['Netanyahu'], type: 'person', sector: 'politics' },
    { id: 'macron', name: 'Emmanuel Macron', aliases: ['马克龙', '埃马纽埃尔·马克龙'], keywords: ['Macron'], type: 'person', sector: 'politics' },
    { id: 'scholz', name: 'Olaf Scholz', aliases: ['朔尔茨', '奥拉夫·朔尔茨'], keywords: ['Scholz'], type: 'person', sector: 'politics' },
    { id: 'trudeau', name: 'Justin Trudeau', aliases: ['特鲁多', '贾斯廷·特鲁多'], keywords: ['Trudeau'], type: 'person', sector: 'politics' },
    { id: 'modi', name: 'Narendra Modi', aliases: ['莫迪', '纳伦德拉·莫迪'], keywords: ['Modi'], type: 'person', sector: 'politics' },
    { id: 'yoon', name: 'Yoon Suk Yeol', aliases: ['尹锡悦'], keywords: ['Yoon'], type: 'person', sector: 'politics' },
    { id: 'kishida', name: 'Fumio Kishida', aliases: ['岸田文雄'], keywords: ['Kishida'], type: 'person', sector: 'politics' },
    { id: 'xi', name: 'Xi Jinping', aliases: ['习近平'], keywords: ['Xi'], type: 'person', sector: 'politics' },
  ],

  // 行业实体
  sectors: [
    { id: 'tech', name: 'Technology', aliases: ['tech', '科技', '技术'], type: 'sector', sector: 'industry' },
    { id: 'healthcare', name: 'Healthcare', aliases: ['医疗', '健康'], type: 'sector', sector: 'industry' },
    { id: 'finance', name: 'Finance', aliases: ['金融'], type: 'sector', sector: 'industry' },
    { id: 'energy', name: 'Energy', aliases: ['能源'], type: 'sector', sector: 'industry' },
    { id: 'defense', name: 'Defense', aliases: ['国防', '军事'], type: 'sector', sector: 'industry' },
    { id: 'ai', name: 'Artificial Intelligence', aliases: ['AI', '人工智能'], type: 'sector', sector: 'technology' },
    { id: 'semiconductor', name: 'Semiconductor', aliases: ['芯片', '半导体'], type: 'sector', sector: 'technology' },
  ],

  // 地区/地理区域
  regions: [
    { id: 'scs', name: 'South China Sea', aliases: ['南海', 'South China Sea'], keywords: ['South China Sea', 'nine-dash line'], type: 'region', sector: 'geopolitical' },
    { id: 'taiwan-strait', name: 'Taiwan Strait', aliases: ['台湾海峡', '台海'], keywords: ['Taiwan Strait', 'Taiwan Strait'], type: 'region', sector: 'geopolitical' },
    { id: 'persian-gulf', name: 'Persian Gulf', aliases: ['波斯湾'], keywords: ['Persian Gulf', 'Strait of Hormuz'], type: 'region', sector: 'geopolitical' },
    { id: 'red-sea', name: 'Red Sea', aliases: ['红海'], keywords: ['Red Sea', 'Bab el-Mandeb'], type: 'region', sector: 'geopolitical' },
    { id: 'black-sea', name: 'Black Sea', aliases: ['黑海'], keywords: ['Black Sea'], type: 'region', sector: 'geopolitical' },
  ],
};

/**
 * 获取所有实体的扁平数组
 */
export function getAllEntities() {
  const entities = [];
  for (const category of Object.keys(ENTITY_DATABASE)) {
    entities.push(...ENTITY_DATABASE[category].map(e => ({ ...e, category })));
  }
  return entities;
}

/**
 * 按类别获取实体
 */
export function getEntitiesByCategory(category) {
  return ENTITY_DATABASE[category] || [];
}

export default ENTITY_DATABASE;
