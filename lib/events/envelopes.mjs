import { createHash } from 'node:crypto';
import { assertContract } from '../contracts/schema-validator.mjs';
import { createNewsStableId } from '../data/stable-identifiers.mjs';

export function createNewsRawEvent(news, context) {
  const eventId = news.stable_id || createNewsStableId({
    source: news.source,
    sourceUrl: news.source_url,
    sourceEventId: news.source_event_id
  });
  return assertContract('news-raw', {
    schema_version: context.schema_version,
    event_id: eventId,
    event_time: new Date(news.published_at).toISOString(),
    ingested_at: new Date().toISOString(),
    pipeline_run_id: context.pipeline_run_id,
    source: news.source,
    source_url: news.source_url,
    source_event_id: news.source_event_id || null,
    title: news.title,
    content: news.content || null,
    lang: news.lang || 'en',
    raw_payload: news.raw_data || null,
    metadata: news.normalized_data || {}
  });
}

export function createParserRequest(newsEvent, versions) {
  const eventId = createHash('sha256').update(`parser-request\u001f${newsEvent.event_id}\u001f${versions.parser_version}\u001f${versions.prompt_version}`).digest('hex');
  return assertContract('parser-request', {
    schema_version: newsEvent.schema_version,
    event_id: eventId,
    event_time: newsEvent.event_time,
    ingested_at: new Date().toISOString(),
    pipeline_run_id: newsEvent.pipeline_run_id,
    news_id: newsEvent.event_id,
    title: newsEvent.title,
    content: newsEvent.content,
    lang: newsEvent.lang,
    parser_version: versions.parser_version,
    prompt_version: versions.prompt_version,
    metadata: { source: newsEvent.source, source_url: newsEvent.source_url }
  });
}

