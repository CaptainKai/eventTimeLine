/**
 * 安全的HTTP请求工具
 */

/**
 * 带重试和超时的fetch
 */
export async function safeFetch(url, options = {}, retries = 3, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (retries > 0 && (error.name === 'AbortError' || error.message.includes('fetch'))) {
      console.log(`[fetch] Retrying (${retries} left): ${url}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return safeFetch(url, options, retries - 1, timeout);
    }

    throw error;
  }
}

/**
 * 获取JSON数据
 */
export async function fetchJSON(url, options = {}) {
  const response = await safeFetch(url, options);
  return response.json();
}

/**
 * 获取文本数据
 */
export async function fetchText(url, options = {}) {
  const response = await safeFetch(url, options);
  return response.text();
}
/**
 * 获取二进制数据
 */
export async function fetchBuffer(url, options = {}) {
  const response = await safeFetch(url, options);
  return response.arrayBuffer();
}
