/**
 * socks-fetch.mjs
 * 基于 Node.js 原生 fetch 的 HTTP/HTTPS 请求封装
 * 异步非阻塞，不再使用 curl 子进程
 */

/**
 * 发起 HTTP 请求
 * @param {string} url - 目标 URL
 * @param {object} options - { method, headers, body, timeout }
 * @returns {Promise<{status, headers, body, ok, text, json}>}
 */
export async function socksFetch(url, options = {}) {
  const { method = 'GET', headers = {}, body = null, timeout = 60 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const fetchOptions = {
      method,
      headers,
      signal: controller.signal
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    return {
      status: response.status,
      headers: response.headers,
      ok: response.ok,
      text: () => response.text(),
      json: () => response.json()
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}s: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 本地请求（与 socksFetch 行为一致，兼容旧接口）
 */
export async function nativeFetch(url, options = {}) {
  return socksFetch(url, options);
}

/**
 * 获取回环地址服务的便捷方法
 */
export async function fetchLocal(path, options = {}) {
  const base = options.baseUrl || 'http://127.0.0.1:5001';
  return socksFetch(`${base}${path}`, options);
}

export default { socksFetch, fetchLocal, nativeFetch };
