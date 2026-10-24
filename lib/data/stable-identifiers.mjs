import { createHash } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function normalizeSource(source) {
  return String(source || 'unknown').trim().toLowerCase();
}

export function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
      url.port = '';
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return raw;
  }
}

export function createNewsStableId({ source, sourceUrl, sourceEventId = null }) {
  const sourceKey = normalizeSource(source);
  const identity = sourceEventId
    ? `native:${String(sourceEventId).trim()}`
    : `url:${normalizeUrl(sourceUrl)}`;
  if (identity === 'url:') throw new Error('sourceUrl or sourceEventId is required');
  return sha256(`news\u001f${sourceKey}\u001f${identity}`);
}

export function createProtoEventStableId({ newsId, parserVersion, eventIndex, payload }) {
  if (!newsId) throw new Error('newsId is required');
  if (!parserVersion) throw new Error('parserVersion is required');
  if (!Number.isInteger(eventIndex) || eventIndex < 0) throw new Error('eventIndex must be a non-negative integer');
  return sha256(`proto\u001f${newsId}\u001f${parserVersion}\u001f${eventIndex}\u001f${canonicalJson(payload)}`);
}

export function createRelationshipStableId({ sourceProtoId, targetProtoId, relationshipType, logicVersion }) {
  if (!sourceProtoId || !targetProtoId || !relationshipType || !logicVersion) {
    throw new Error('sourceProtoId, targetProtoId, relationshipType and logicVersion are required');
  }
  return sha256(`relationship\u001f${sourceProtoId}\u001f${targetProtoId}\u001f${relationshipType}\u001f${logicVersion}`);
}

export function createPipelineRunId({ jobName, startedAt = new Date().toISOString(), nonce = '' }) {
  if (!jobName) throw new Error('jobName is required');
  return sha256(`run\u001f${jobName}\u001f${startedAt}\u001f${nonce}`).slice(0, 32);
}

