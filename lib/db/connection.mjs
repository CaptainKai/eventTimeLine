import pg from 'pg';
const { Pool } = pg;
import config from '../../config.mjs';

let pool = null;

/**
 * 初始化数据库连接池
 */
export function initDB() {
  if (pool) return pool;

  // 核心修复：临时屏蔽可能干扰数据库连接的代理环境变量
  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
  const savedVars = {};
  proxyVars.forEach(v => {
    if (process.env[v]) {
      savedVars[v] = process.env[v];
      delete process.env[v];
    }
  });

  try {
    pool = new Pool({
      user: config.database.user,
      host: config.database.host,
      database: config.database.database,
      password: config.database.password,
      port: config.database.port,
      max: Math.max(1, Number(process.env.DB_POOL_MAX || 5)),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000, // 增加连接超时判断
      // 核心修复：强制使用 IPv4 建立 Socket，防止在代理/TUN 环境下与 IPv6 冲突
      family: 4 
    });

    console.log('[DB] Connection pool initialized (Proxy variables bypassed)');
  } finally {
    // 恢复环境变量，以免影响后续需要代理的请求（如外网 LLM）
    Object.keys(savedVars).forEach(v => {
      process.env[v] = savedVars[v];
    });
  }

  return pool;
}

/**
 * 获取数据库连接
 */
export function getPool() {
  if (!pool) {
    initDB();
  }
  return pool;
}

/**
 * 执行SQL查询
 */
export async function query(text, params = []) {
  const start = Date.now();

  // 核心修复：如果连接池未初始化或已关闭，尝试自动恢复
  if (!pool) {
    console.warn('[DB] Connection pool is null, attempting to re-initialize...');
    initDB();
  }

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      const queryPreview = text.replace(/\s+/g, ' ').slice(0, 120);
      console.log(`[DB] slow query ${duration}ms: ${queryPreview}`);
    }
    return res;
  } catch (error) {
    console.error('[DB] Query error:', error);
    throw error;
  }
}

/**
 * 获取单条记录
 */
export async function queryOne(text, params = []) {
  const res = await query(text, params);
  return res.rows[0] || null;
}


export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback((text, params = []) => client.query(text, params), client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 关闭数据库连接
 */

export async function withAdvisoryLock(lockKey, callback, options = {}) {
  const keys = Array.isArray(lockKey) ? lockKey : [lockKey];
  if (keys.length !== 2) {
    throw new Error('withAdvisoryLock requires a two-int lock key, e.g. [namespace, resource]');
  }

  const client = await getPool().connect();
  const [namespaceKey, resourceKey] = keys.map(value => Number(value));
  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1::int, $2::int) AS acquired',
      [namespaceKey, resourceKey]
    );
    if (!lockResult.rows[0]?.acquired) {
      throw new Error(options.errorMessage || `Could not acquire advisory lock ${namespaceKey}:${resourceKey}`);
    }

    return await callback((text, params = []) => client.query(text, params), client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1::int, $2::int)', [namespaceKey, resourceKey]).catch(() => null);
    client.release();
  }
}

export async function closeDB() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] Connection pool closed');
  }
}

export default {
  initDB,
  getPool,
  query,
  queryOne,
  withTransaction,
  withAdvisoryLock,
  closeDB,
};
