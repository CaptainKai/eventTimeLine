import 'dotenv/config';

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default {
  port: parsePositiveInt(process.env.PORT, 3118),
  refreshIntervalMinutes: parsePositiveInt(process.env.REFRESH_INTERVAL_MINUTES, 15),
  backgroundSweep: {
    enabled: process.env.BACKGROUND_SWEEP_ENABLED !== 'false',
    runOnStart: process.env.BACKGROUND_SWEEP_RUN_ON_START === 'true',
    startupDelayMs: parsePositiveInt(process.env.BACKGROUND_SWEEP_STARTUP_DELAY_MS, 30000),
    parallelSources: process.env.BACKGROUND_SWEEP_PARALLEL_SOURCES === 'true',
    limit: parsePositiveInt(process.env.BACKGROUND_SWEEP_LIMIT, 20),
  },

  dashboard: {
    limits: {
      hotEvents: parsePositiveInt(process.env.DASHBOARD_HOT_EVENTS_LIMIT, 8),
      activeStories: parsePositiveInt(process.env.DASHBOARD_ACTIVE_STORIES_LIMIT, 8),
      pendingHypotheses: parsePositiveInt(process.env.DASHBOARD_PENDING_HYPOTHESES_LIMIT, 10),
      recentNews: parsePositiveInt(process.env.DASHBOARD_RECENT_NEWS_LIMIT, 10),
      parseWatchlist: parsePositiveInt(process.env.DASHBOARD_PARSE_WATCHLIST_LIMIT, 10),
      storiesDefault: parsePositiveInt(process.env.DASHBOARD_STORIES_DEFAULT_LIMIT, 50),
      storiesMax: parsePositiveInt(process.env.DASHBOARD_STORIES_MAX_LIMIT, 200),
      hypothesesDefault: parsePositiveInt(process.env.DASHBOARD_HYPOTHESES_DEFAULT_LIMIT, 50),
      hypothesesMax: parsePositiveInt(process.env.DASHBOARD_HYPOTHESES_MAX_LIMIT, 200),
      pendingNormalizationsDefault: parsePositiveInt(process.env.DASHBOARD_PENDING_NORMALIZATIONS_DEFAULT_LIMIT, 100),
      pendingNormalizationsMax: parsePositiveInt(process.env.DASHBOARD_PENDING_NORMALIZATIONS_MAX_LIMIT, 1000),
      newsParseDefault: parsePositiveInt(process.env.DASHBOARD_NEWS_PARSE_DEFAULT_LIMIT, 40),
      newsParseMax: parsePositiveInt(process.env.DASHBOARD_NEWS_PARSE_MAX_LIMIT, 100),
      canonicalEvents: parsePositiveInt(process.env.DASHBOARD_CANONICAL_EVENTS_LIMIT, 50),
      canonicalEventsMax: parsePositiveInt(process.env.DASHBOARD_CANONICAL_EVENTS_MAX_LIMIT, 100),
      relationshipItems: parsePositiveInt(process.env.DASHBOARD_RELATIONSHIP_ITEMS_LIMIT, 50),
      relationshipItemsMax: parsePositiveInt(process.env.DASHBOARD_RELATIONSHIP_ITEMS_MAX_LIMIT, 100),
    },
  },

  database: {
    url: process.env.DATABASE_URL || 'postgres://postgres:123456@localhost:5432/timeline',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '123456',
    host: process.env.PGHOST || 'localhost',
    port: parsePositiveInt(process.env.PGPORT, 5432),
    database: process.env.PGDATABASE || 'timeline',
  },

  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    enabled: !!process.env.ELASTICSEARCH_URL,
  },

  gdelt: {
    apiKey: process.env.GDELT_API_KEY || '',
  },

  rssNews: {
    feedUrls: String(process.env.RSS_NEWS_FEEDS || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
    maxItemsPerFeed: parsePositiveInt(process.env.RSS_NEWS_MAX_ITEMS_PER_FEED, 10),
  },

  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
  },

  parser: {
    default: process.env.DEFAULT_PARSER || 'enhanced',
    enableLLM: !!process.env.OPENAI_API_KEY,
    sourceConfig: {
      gdelt: { preferLLMWhenImportanceAbove: 7 },
      rssNews: { preferLLMWhenImportanceAbove: null },
      jin10: { preferLLMWhenImportanceAbove: 0.4 },
      newsminimalist: { preferLLMWhenImportanceAbove: null },
    },
  },

  // 数据源配置 - 可在这里启用/禁用源
  sources: {
    gdelt: {
      enabled: true,
      priority: 1,
    },
    rssNews: {
      enabled: process.env.RSS_NEWS_ENABLED === 'true',
      priority: parsePositiveInt(process.env.RSS_NEWS_PRIORITY, 2),
    },
    jin10: {
      enabled: process.env.JIN10_ENABLED !== 'false', // 默认开启
      priority: parsePositiveInt(process.env.JIN10_PRIORITY, 3),
    },
    newsminimalist: {
      enabled: process.env.NEWS_MINIMALIST_ENABLED !== 'false', // 默认开启
      priority: parsePositiveInt(process.env.NEWS_MINIMALIST_PRIORITY, 4),
    },
  },
};
