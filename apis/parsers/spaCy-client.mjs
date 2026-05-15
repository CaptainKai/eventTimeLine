/**
 * spaCy NLP Service Client
 * Communicates with the Python NLP service for English/Chinese event extraction
 */

import { socksFetch, fetchLocal } from '../../lib/utils/socks-fetch.mjs';

const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://127.0.0.1:5001';

/**
 * Call the NLP service endpoint
 */
async function callNlpService(endpoint, text) {
  const isLocal = isLocalHost(`${NLP_SERVICE_URL}${endpoint}`);

  try {
    let response;
    if (isLocal) {
      response = await fetchLocal(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        timeout: 60
      });
    } else {
      response = await socksFetch(`${NLP_SERVICE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        timeout: 60
      });
    }

    if (!response.ok) {
      throw new Error(`NLP service error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown NLP service error');
    }

    return data.events || [];
  } catch (error) {
    console.warn(`NLP service call failed: ${error.message}`);
    return [];
  }
}

/**
 * 判断目标地址是否为本地地址
 */
function isLocalHost(url) {
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      hostname === '[::1]' ||
      hostname.startsWith('fe80:')
    );
  } catch {
    return false;
  }
}

/**
 * Extract events from English text using spaCy
 */
export async function extractEnglishEvents(text) {
  return callNlpService('/parse/english', text);
}

/**
 * Extract events from Chinese text using jieba
 */
export async function extractChineseEvents(text) {
  return callNlpService('/parse/chinese', text);
}

/**
 * Auto-detect language and extract events
 */
export async function extractEventsAuto(text) {
  return callNlpService('/parse/auto', text);
}

/**
 * Batch extract events from multiple texts
 */
export async function extractEventsBatch(texts, lang = null) {
  const isLocal = isLocalHost(NLP_SERVICE_URL);

  try {
    let response;
    const requestBody = { texts, lang };

    if (isLocal) {
      response = await fetchLocal('/parse/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        timeout: 120
      });
    } else {
      response = await socksFetch(`${NLP_SERVICE_URL}/parse/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        timeout: 120
      });
    }

    if (!response.ok) {
      throw new Error(`NLP service batch error: ${response.status}`);
    }

    const data = await response.json();
    return data.success ? data.events : [];
  } catch (error) {
    console.warn(`NLP batch service call failed: ${error.message}`);
    return [];
  }
}

/**
 * Check if NLP service is available
 */
export async function checkNlpServiceHealth() {
  const isLocal = isLocalHost(NLP_SERVICE_URL);

  try {
    let response;
    if (isLocal) {
      // 本地地址使用 fetchLocal
      response = await fetchLocal('/health', {
        method: 'GET',
        baseUrl: NLP_SERVICE_URL,
        timeout: 5
      });
    } else {
      response = await socksFetch(`${NLP_SERVICE_URL}/health`, {
        method: 'GET',
        timeout: 5
      });
    }
    return response.ok;
  } catch (error) {
    console.warn(`NLP health check failed: ${error.message}`);
    return false;
  }
}

export default {
  extractEnglishEvents,
  extractChineseEvents,
  extractEventsAuto,
  extractEventsBatch,
  checkNlpServiceHealth,
};