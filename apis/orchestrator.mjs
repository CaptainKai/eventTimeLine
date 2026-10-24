import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.mjs';
import { processGDELTEvents } from './sources/gdelt.mjs';
import { processRSSNews } from './sources/rss-news.mjs';
import { processJin10 } from './sources/jin10.mjs';
import { processNewsMinimalist } from './sources/newsminimalist.mjs';
import { initDB, closeDB, query } from '../lib/db/connection.mjs';
import { getEvents } from '../lib/db/events-queries.mjs';
import { bulkCreateEventRelationships, deleteEventRelationships } from '../lib/db/event-relationships-queries.mjs';
import { eventRelationshipAnalyzer } from '../lib/analysis/event-relationship-analyzer.mjs';

const __filename = fileURLToPath(import.meta.url);

// 源注册
const SOURCES = {
  gdelt: {
    enabled: config.sources?.gdelt?.enabled ?? true,
    priority: 1,
    processor: processGDELTEvents,
  },
  rssNews: {
    enabled: config.sources?.rssNews?.enabled ?? false,
    priority: config.sources?.rssNews?.priority ?? 2,
    processor: processRSSNews,
  },
  jin10: {
    enabled: config.sources?.jin10?.enabled ?? true,
    priority: config.sources?.jin10?.priority ?? 3,
    processor: processJin10,
  },
  newsminimalist: {
    enabled: config.sources?.newsminimalist?.enabled ?? true,
    priority: config.sources?.newsminimalist?.priority ?? 4,
    processor: processNewsMinimalist,
  },
};

import { storyManager } from '../lib/analysis/story-manager.mjs';
import { inferenceEngine } from '../lib/analysis/inference-engine.mjs';

/**
 * 核心聚合逻辑: 6层模型联动机
 */
export async function aggregateEvents() {
  console.log('[Orchestrator] Starting 6-layer intelligence aggregation...');
  
  try {
    // 1. [L4: Event Graph] 分析并构建事件间的拓扑关系
    console.log('[Orchestrator] Step 1: Analyzing Event Graph (L4)...');
    await analyzeRelationships();

    // 2. [L5: Story Layer] 同步叙事子图并更新态势
    console.log('[Orchestrator] Step 2: Syncing Stories (L5)...');
    await storyManager.syncStories();

    // 3. [L6: Hypothesis] 生成基于现状的推演预测
    console.log('[Orchestrator] Step 3: Generating Hypotheses (L6)...');
    await inferenceEngine.generateHypotheses();

    // 4. 刷新物化视图 (包含活跃事件和每日统计)
    console.log('[Orchestrator] Step 4: Refreshing materialized views...');
    await query('SELECT refresh_daily_event_stats();');

    console.log('[Orchestrator] 6-Layer aggregation complete.');
    return { status: 'success', timestamp: new Date() };
  } catch (error) {
    console.error('[Orchestrator] Aggregation failed:', error);
    throw error;
  }
}

/**
 * 基础自动化关系分析算法
 */
async function analyzeRelationships() {
  const recentEvents = await getEvents(1, 200, {});
  const detected = [];

  for (const event of recentEvents) {
    await deleteEventRelationships(event.id);
  }

  for (const event of recentEvents) {
    const relationships = await eventRelationshipAnalyzer.analyzeNewEventRelationships(event.id);
    if (relationships.length > 0) {
      detected.push(...relationships);
    }
  }

  if (detected.length > 0) {
    await bulkCreateEventRelationships(detected);
  }

  return detected.length;
}

/**
 * 运行完整的数据采集管道
 */
export async function runFullSweep(options = {}) {
  const start = Date.now();
  console.log('[Orchestrator] Starting full sweep...');

  // 移除这里的 initDB()，由各源处理器自行通过 getPool() 获取连接
  const results = {
    start: new Date().toISOString(),
    sources: {},
    errors: [],
  };

  const enabledSources = Object.entries(SOURCES)
    .filter(([_, source]) => source.enabled)
    .sort(([_, a], [__, b]) => a.priority - b.priority);

  const runSourcesInParallel = options.parallelSources === true;
  const runSourceTask = async ([name, source]) => {
    try {
      console.log(`[Orchestrator] Running source: ${name}`);
      const sourceResult = await source.processor(options.limit || 50, options);
      results.sources[name] = { status: 'ok', ...sourceResult };
    } catch (error) {
      console.error(`[Orchestrator] Source ${name} failed:`, error);
      results.sources[name] = { status: 'error', error: error.message };
      results.errors.push({ source: name, error: error.message });
    }
  };

  if (runSourcesInParallel) {
    await Promise.all(enabledSources.map(runSourceTask));
  } else {
    for (const sourceEntry of enabledSources) {
      await runSourceTask(sourceEntry);
    }
  }

  // 重要：数据采集完成后进行聚合分析
  await aggregateEvents();

  results.duration = Date.now() - start;
  results.end = new Date().toISOString();

  console.log(`[Orchestrator] Sweep completed in ${results.duration}ms`);
  return results;
}

export async function runSource(name, options = {}) {
  const source = SOURCES[name];
  if (!source) {
    throw new Error(`Unknown source: ${name}`);
  }

  if (!source.enabled && options.force !== true) {
    console.log(`[Orchestrator] Source ${name} disabled by config; skipping.`);
    return { status: 'disabled', success: 0, failed: 0, skipped: 0 };
  }

  return source.processor(options.limit || 50, options);
}

export function registerSource(name, definition) {
  SOURCES[name] = definition;
}

export function getSources() {
  return Object.keys(SOURCES);
}

export default {
  runFullSweep,
  aggregateEvents,
  runSource,
  registerSource,
  getSources,
};

// 如果直接运行此文件
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const main = async () => {
    try {
      initDB();
      await runFullSweep({ limit: 50 });
    } catch (error) {
      console.error(error);
    } finally {
      await closeDB();
    }
  };
  main();
}
