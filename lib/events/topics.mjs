export const TOPICS = Object.freeze({
  newsRaw: process.env.TOPIC_NEWS_RAW || 'ods.news.raw.v1',
  parserRequest: process.env.TOPIC_PARSER_REQUEST || 'parser.request.v1',
  parserResult: process.env.TOPIC_PARSER_RESULT || 'parser.result.v1',
  protoEvent: process.env.TOPIC_PROTO_EVENT || 'dwd.proto-event.v1',
  deadLetter: process.env.TOPIC_DEAD_LETTER || 'dlq.pipeline.v1'
});

