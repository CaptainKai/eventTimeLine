import { Kafka, logLevel } from 'kafkajs';

export function createKafka(options = {}) {
  const brokers = options.brokers || String(process.env.REDPANDA_BROKERS || 'localhost:19092').split(',').map(item => item.trim()).filter(Boolean);
  return new Kafka({
    clientId: options.clientId || process.env.KAFKA_CLIENT_ID || 'event-timeline',
    brokers,
    connectionTimeout: Number(process.env.KAFKA_CONNECTION_TIMEOUT_MS || 5000),
    requestTimeout: Number(process.env.KAFKA_REQUEST_TIMEOUT_MS || 30000),
    retry: { retries: Number(process.env.KAFKA_RETRIES || 5) },
    logLevel: process.env.KAFKA_DEBUG === 'true' ? logLevel.DEBUG : logLevel.NOTHING
  });
}

export async function createProducer(options = {}) {
  const producer = createKafka(options).producer({ allowAutoTopicCreation: false, idempotent: true, maxInFlightRequests: 1 });
  await producer.connect();
  return producer;
}

export async function createConsumer(groupId, options = {}) {
  const consumer = createKafka(options).consumer({ groupId, allowAutoTopicCreation: false });
  await consumer.connect();
  return consumer;
}

