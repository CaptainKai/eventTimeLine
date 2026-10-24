import { claimOutboxBatch, markOutboxFailed, markOutboxPublished } from '../../lib/db/event-outbox-queries.mjs';
import { createProducer } from '../../lib/events/kafka-client.mjs';

export async function publishOutboxBatch({ producer, limit = 50, workerId } = {}) {
  const ownedProducer = producer || await createProducer({ clientId: 'event-timeline-outbox' });
  const rows = await claimOutboxBatch(limit, workerId);
  const stats = { claimed: rows.length, published: 0, failed: 0 };
  for (const row of rows) {
    try {
      await ownedProducer.send({
        topic: row.topic,
        acks: -1,
        messages: [{ key: row.event_key, value: JSON.stringify(row.payload), headers: row.headers || {} }]
      });
      await markOutboxPublished(row.id);
      stats.published += 1;
    } catch (error) {
      await markOutboxFailed(row.id, error, Math.min(300, 2 ** Math.min(row.attempts, 8)));
      stats.failed += 1;
    }
  }
  return stats;
}

export async function runOutboxPublisher(options = {}) {
  const producer = options.producer || await createProducer({ clientId: 'event-timeline-outbox' });
  const intervalMs = options.intervalMs || Number(process.env.OUTBOX_POLL_INTERVAL_MS || 1000);
  let stopped = false;
  const stop = async () => { stopped = true; await producer.disconnect(); };
  while (!stopped) {
    const stats = await publishOutboxBatch({ producer, limit: options.limit || 50 });
    if (stats.claimed === 0) await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return stop;
}

