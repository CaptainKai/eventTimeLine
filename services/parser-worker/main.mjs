import { createConsumer, createProducer } from '../../lib/events/kafka-client.mjs';
import { startParserWorker } from './worker.mjs';

const consumer = await createConsumer(process.env.PARSER_CONSUMER_GROUP || 'event-timeline-parser-v1', { clientId: 'event-timeline-parser' });
const producer = await createProducer({ clientId: 'event-timeline-parser' });
await startParserWorker({ consumer, producer, fromBeginning: process.env.PARSER_FROM_BEGINNING === 'true' });

