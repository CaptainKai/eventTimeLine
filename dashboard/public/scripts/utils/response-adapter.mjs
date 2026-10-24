const KNOWN_DEGRADATION_FIELDS = ['degraded', 'fallback', 'fallback_mode'];

export function normalizeQueryEnvelope(payload = {}) {
  const rawData = payload?.data;
  const data = rawData === undefined || rawData === null ? [] : rawData;
  const sourceIds = Array.isArray(payload?.source_ids) ? payload.source_ids : [];
  const generatedAt = payload?.generated_at || null;
  const degraded = KNOWN_DEGRADATION_FIELDS.some(field => Boolean(payload?.[field]))
    || payload?.retrieval_mode === 'keyword_fallback';

  return {
    data,
    meta: {
      dataVersion: payload?.data_version || 'unknown',
      generatedAt,
      sourceIds,
      lineageId: payload?.lineage_id || null,
      retrievalMode: payload?.retrieval_mode || null,
      degraded,
      stale: generatedAt ? Date.now() - Date.parse(generatedAt) > 15 * 60 * 1000 : false,
    },
    empty: Array.isArray(data) ? data.length === 0 : Object.keys(data || {}).length === 0,
    raw: payload,
  };
}

export function normalizeApiError(error) {
  if (error?.code === 'REQUEST_CANCELLED') return { type: 'cancelled', message: '请求已取消', retryable: false };
  if (error?.code === 'REQUEST_TIMEOUT') return { type: 'timeout', message: '查询超时，请缩小范围后重试', retryable: true };
  if (error?.status === 400) return { type: 'invalid', message: error.message || '请求参数不合法', retryable: false };
  if (error?.status >= 500) return { type: 'service', message: '服务暂时不可用，请稍后重试', retryable: true };
  return { type: 'unknown', message: error?.message || '未知错误', retryable: true };
}

export function buildWorkbenchUrlState(input = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function readWorkbenchUrlState(search = '') {
  const params = new URLSearchParams(search);
  return {
    tab: params.get('tab') || 'search',
    q: params.get('q') || '',
    newsId: params.get('newsId') || '',
  };
}
