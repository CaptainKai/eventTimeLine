import { runOutboxPublisher } from './publisher.mjs';
import { closeDB } from '../../lib/db/connection.mjs';

runOutboxPublisher().catch(async error => {
  console.error('[OutboxPublisher] fatal:', error);
  await closeDB();
  process.exit(1);
});

