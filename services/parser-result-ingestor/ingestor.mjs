import { assertContract } from '../../lib/contracts/schema-validator.mjs';
import { getNewsByStableId } from '../../lib/db/news-queries.mjs';
import { ingestExtractedNews } from '../../lib/pipeline/event-ingestion.mjs';
import { TOPICS } from '../../lib/events/topics.mjs';

export async function processParserResult(result, options = {}) {
  assertContract('parser-result', result);
  if (result.status !== 'success') return { status: 'skipped', reason: 'parser-failed', event_id: result.event_id };
  const findNews = options.findNews || getNewsByStableId;
  const ingest = options.ingest || ingestExtractedNews;
  const news = await findNews(result.news_id);
  if (!news) throw Object.assign(new Error(`News not found for stable id ${result.news_id}`), { code: 'NEWS_NOT_FOUND' });
  const ingestion = await ingest({
    proto_events: result.proto_events,
    processing_context: {
      pipeline_run_id: result.pipeline_run_id,
      schema_version: result.schema_version,
      parser_version: result.parser_version,
      prompt_version: result.prompt_version,
    },
  }, {
    news_id: news.id,
    source: news.source,
    source_url: news.source_url,
    published_at: news.published_at,
    lang: news.lang,
    title: news.title,
    content: news.content,
    reliability_score: news.reliability_score,
    normalized_data: news.normalized_data,
  });
  return { status: 'success', news_id: news.id, stable_id: result.news_id, proto_event_count: ingestion.proto_event_count };
}

export async function startParserResultIngestor({ consumer, fromBeginning = false, processResult = processParserResult } = {}) {
  if (!consumer) throw new Error('consumer is required');
  await consumer.subscribe({ topic: TOPICS.parserResult, fromBeginning });
  await consumer.run({ eachMessage: async ({ message }) => processResult(JSON.parse(message.value.toString('utf8'))) });
}
