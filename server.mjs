import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import config from './config.mjs';
import { initDB, closeDB } from './lib/db/connection.mjs';
import orchestrator from './apis/orchestrator.mjs';
import { runNormalizationAudit, startNormalizationRebuildWorker, stopNormalizationRebuildWorker } from './lib/pipeline/normalization-audit.mjs';
import { startAtomicSummaryWorker, stopAtomicSummaryWorker } from './lib/pipeline/atomic-summary-worker.mjs';
import { startAtomicBatchAssignmentWorker, stopAtomicBatchAssignmentWorker } from './lib/pipeline/atomic-batch-assignment-worker.mjs';

// 路由导入
import eventsRouter from './api/v1/events.mjs';
import entitiesRouter from './api/v1/entities.mjs';
import newsRouter from './api/v1/news.mjs';
import intelligenceRouter from './api/v1/intelligence.mjs';
import adminRouter from './api/v1/admin.mjs';
import dashboardRouter from './api/v1/dashboard.mjs';
import atomicRelationshipsRouter from './api/v1/atomic-relationships.mjs';
import dataQueryRouter from './api/v1/data-query.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backgroundTimers = new Set();

// 确保无论从哪个工作目录启动，都能加载 eventTimeLine/.env
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// 中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'dashboard/public')));

// API 路由
app.use('/api/v1/events', eventsRouter);
app.use('/api/v1/entities', entitiesRouter);
app.use('/api/v1/news', newsRouter);
app.use('/api/v1/intelligence', intelligenceRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1', atomicRelationshipsRouter);
app.use('/api/v1', dataQueryRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'event-timeline-engine',
    version: '1.0.0',
    uptime: process.uptime(),
    config: {
      defaultParser: process.env.DEFAULT_PARSER || 'enhanced',
      refreshInterval: config.refreshIntervalMinutes,
      sources: Object.keys(config.sources).filter(k => config.sources[k]?.enabled),
    }
  });
});

// 调试端点 - 检查 LLM 环境变量
app.get('/api/debug/env', (req, res) => {
  res.json({
    cwd: process.cwd(),
    __dirname: __dirname,
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✅ 已设置' : '❌ 未设置',
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '❌ 未设置',
      OPENAI_MODEL: process.env.OPENAI_MODEL || '❌ 未设置',
      DEFAULT_PARSER: process.env.DEFAULT_PARSER || '❌ 未设置',
      NODE_ENV: process.env.NODE_ENV || '❌ 未设置',
    }
  });
});

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/public/index.html'));
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist',
    path: req.originalUrl,
  });
});

// 错误处理
app.use((error, req, res) => {
  console.error('[SERVER] Error:', error);

  const status = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
  });
});

// 服务器启动
async function startServer(options = {}) {
  try {
    // 初始化数据库连接
    await initDB();
    console.log('[SERVER] Database connection initialized');
    await startNormalizationRebuildWorker();
    startAtomicBatchAssignmentWorker();
    startAtomicSummaryWorker();

    // 启动服务器
    const server = app.listen(config.port, () => {
      console.log(`[SERVER] Event Timeline Engine running on http://localhost:${config.port}`);
      console.log(`[SERVER] API available at http://localhost:${config.port}/api/v1/`);
      console.log(`[SERVER] Dashboard available at http://localhost:${config.port}/`);
      
      // 启动后台自动刷新
      startBackgroundTasks();
    });

    let shuttingDown = false;
    const shutdown = async (signal, exitCode = 0) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[SERVER] Received ${signal}, shutting down`);

      for (const timer of backgroundTimers) {
        clearTimeout(timer);
        clearInterval(timer);
      }
      backgroundTimers.clear();
      stopNormalizationRebuildWorker();
      stopAtomicBatchAssignmentWorker();
      stopAtomicSummaryWorker();

      const forceCloseTimer = setTimeout(() => server.closeAllConnections?.(), 5000);
      if (typeof forceCloseTimer.unref === 'function') forceCloseTimer.unref();
      await new Promise(resolve => server.close(resolve));
      clearTimeout(forceCloseTimer);
      await closeDB();
      console.log('[SERVER] Shutdown complete');
      if (options.exitOnShutdown !== false) process.exit(exitCode);
      return { exitCode };
    };

    if (options.registerSignalHandlers !== false) {
      process.once('SIGTERM', () => shutdown('SIGTERM'));
      process.once('SIGINT', () => shutdown('SIGINT'));
    }
    return { server, shutdown };
  } catch (error) {
    console.error('[SERVER] Failed to start:', error);
    process.exit(1);
  }
}

/**
 * 后台自动采集与聚合任务
 */
function startBackgroundTasks() {
  if (!config.backgroundSweep?.enabled) {
    console.log('[SERVER] Background sweep disabled by BACKGROUND_SWEEP_ENABLED=false');
    startNormalizationAuditScheduler();
    return;
  }

  const intervalMs = (config.refreshIntervalMinutes || 15) * 60 * 1000;
  console.log(`[SERVER] Background tasks started. Polling every ${config.refreshIntervalMinutes} minutes.`);

  if (config.backgroundSweep.runOnStart) {
    backgroundTimers.add(setTimeout(runTask, config.backgroundSweep.startupDelayMs || 30000));
  } else {
    console.log('[SERVER] Initial background sweep skipped. Set BACKGROUND_SWEEP_RUN_ON_START=true to enable it.');
  }

  backgroundTimers.add(setInterval(runTask, intervalMs));
  startNormalizationAuditScheduler();

  async function runTask() {
    try {
      console.log('[SERVER] Running background sweep...');
      await orchestrator.runFullSweep({
        limit: config.backgroundSweep.limit || 20,
        parallelSources: config.backgroundSweep.parallelSources === true
      });
      console.log('[SERVER] Background sweep completed successfully');
    } catch (error) {
      console.error('[SERVER] Background sweep failed:', error);
    }
  }
}

function startNormalizationAuditScheduler() {
  const enabled = process.env.NORMALIZATION_AUDIT_ENABLED !== 'false';
  if (!enabled) {
    console.log('[NormalizationAudit] Scheduler disabled by NORMALIZATION_AUDIT_ENABLED=false');
    return;
  }

  const runOnStart = process.env.NORMALIZATION_AUDIT_RUN_ON_START === 'true';
  const apply = process.env.NORMALIZATION_AUDIT_APPLY === 'true';
  const limit = Number(process.env.NORMALIZATION_AUDIT_LIMIT || 20);
  const intervalMs = Number(process.env.NORMALIZATION_AUDIT_INTERVAL_MS || 24 * 60 * 60 * 1000);

  console.log(`[NormalizationAudit] Scheduler enabled. runOnStart=${runOnStart} apply=${apply} intervalMs=${intervalMs} limit=${limit}`);

  if (runOnStart) {
    backgroundTimers.add(setTimeout(runAuditTask, 5000));
  }

  backgroundTimers.add(setInterval(runAuditTask, intervalMs));

  async function runAuditTask() {
    const startedAt = Date.now();
    try {
      console.log('[NormalizationAudit] Scheduled audit started');
      const result = await runNormalizationAudit({ apply, limit, rebuild: true, status: 'pending' });
      console.log(`[NormalizationAudit] Scheduled audit completed candidates=${result.candidate_count} reviewed=${result.reviewed_count} promoted=${result.promoted_count} merged=${result.merged_count} rejected=${result.rejected_count} affectedProto=${result.affected_proto_count} affectedEvents=${result.affected_event_count} durationMs=${Date.now() - startedAt}`);
    } catch (error) {
      console.error('[NormalizationAudit] Scheduled audit failed:', error);
    }
  }
}

// 导出模块
export { app, startServer };

// 如果直接运行此文件，则启动服务器
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
