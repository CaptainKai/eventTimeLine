import { extractWithSelectedParser } from '../../lib/pipeline/parser-selector.mjs';
import { assertContract } from '../../lib/contracts/schema-validator.mjs';
import { createProtoEventStableId } from '../../lib/data/stable-identifiers.mjs';
import { TOPICS } from '../../lib/events/topics.mjs';

export async function processParserRequest(request, options = {}) {
  assertContract('parser-request', request);
  const started = Date.now();
  try {
    const result = await (options.extract || extractWithSelectedParser)(request.title, request.content, {
      source: request.metadata?.source || 'event-bus', lang: request.lang,
      forceLLM: options.forceLLM === true
    });
    const protoEvents = (result.proto_events || []).map((event, index) => ({
      ...event,
      stable_id: createProtoEventStableId({ newsId: request.news_id, parserVersion: request.parser_version, eventIndex: index, payload: event })
    }));
    return assertContract('parser-result', {
      schema_version: request.schema_version, event_id: request.event_id,
      event_time: request.event_time, ingested_at: new Date().toISOString(),
      pipeline_run_id: request.pipeline_run_id, news_id: request.news_id,
      status: 'success', parser_version: request.parser_version, prompt_version: request.prompt_version,
      duration_ms: Date.now() - started, proto_events: protoEvents, error: null,
      metadata: { source_event_id: request.event_id }
    });
  } catch (error) {
    return assertContract('parser-result', {
      schema_version: request.schema_version, event_id: request.event_id,
      event_time: request.event_time, ingested_at: new Date().toISOString(),
      pipeline_run_id: request.pipeline_run_id, news_id: request.news_id,
      status: 'failed', parser_version: request.parser_version, prompt_version: request.prompt_version,
      duration_ms: Date.now() - started, proto_events: [],
      error: { code: error.code || 'PARSER_FAILED', message: error.message }, metadata: {}
    });
  }
}

export async function startParserWorker({ consumer, producer, fromBeginning = false, processRequest = processParserRequest } = {}) {
  if (!consumer || !producer) throw new Error('consumer and producer are required');
  await consumer.subscribe({ topic: TOPICS.parserRequest, fromBeginning });
  await consumer.run({ eachMessage: async ({ message }) => {
    const request = JSON.parse(message.value.toString('utf8'));
    const result = await processRequest(request);
    await producer.send({ topic: TOPICS.parserResult, acks: -1, messages: [{ key: request.news_id, value: JSON.stringify(result) }] });
  }});
}
