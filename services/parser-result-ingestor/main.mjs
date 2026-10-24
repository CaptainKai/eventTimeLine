import { createConsumer } from '../../lib/events/kafka-client.mjs';
import { startParserResultIngestor } from './ingestor.mjs';

const consumer = await createConsumer(process.env.PARSER_RESULT_CONSUMER_GROUP || 'event-timeline-parser-result-v1', { clientId: 'event-timeline-parser-result' });
await startParserResultIngestor({ consumer, fromBeginning: process.env.PARSER_RESULT_FROM_BEGINNING === 'true' });
