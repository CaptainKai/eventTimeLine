import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ApiClient } from '../../dashboard/public/scripts/utils/api-test-client.mjs';
import { app } from '../../server.mjs';
import { initDB, closeDB } from '../../lib/db/connection.mjs';

describe('Event Timeline Engine Integration', () => {
  let apiClient;
  let server;

  before(async () => {
    initDB();
    server = app.listen(3222);
    apiClient = new ApiClient('http://127.0.0.1:3222/api/v1');
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    await closeDB();
  });

  describe('System Health', () => {
    it('should be reachable and responsive', async () => {
      const health = await apiClient.healthCheck();

      assert.ok(health);
      assert.strictEqual(health.status, 'ok');
      assert.ok(health.timestamp);
      assert.ok(health.version);
      assert.ok(health.uptime > 0);

      console.log(`[Health] Version: ${health.version}`);
      console.log(`[Health] Uptime: ${health.uptime} seconds`);
      console.log(`[Health] Timestamp: ${health.timestamp}`);
    });
  });

  describe('API Availability', () => {
    it('should respond to events endpoint', async () => {
      const events = await apiClient.getEvents(1, 5);

      assert.ok(events);
      assert.ok(events.data);
      assert.ok(Array.isArray(events.data));
      assert.ok(events.pagination);
      assert.ok(typeof events.pagination.page === 'number');
      assert.ok(typeof events.pagination.limit === 'number');

      console.log(`[Events] Total: ${events.pagination.total}`);
    });

    it('should respond to timeline endpoint', async () => {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const timeline = await apiClient.getTimeline(startDate, endDate, 'day');

      assert.ok(timeline);
      assert.ok(timeline.data);
      assert.ok(timeline.query);

      if (timeline.data.length > 0) {
        assert.ok(typeof timeline.data[0].date === 'string');
        assert.ok(typeof timeline.data[0].event_count === 'number');
      }

      console.log(`[Timeline] Data points: ${timeline.data.length}`);
    });

    it('should respond to entities endpoint', async () => {
      const entityTypes = await apiClient.getEntities();

      assert.ok(entityTypes);
      assert.ok(entityTypes.data);
      assert.ok(Array.isArray(entityTypes.data));

      console.log(`[Entities] Types: ${entityTypes.data.join(', ')}`);
    });
  });

  describe('Data Consistency', () => {
    it('should return consistent event data structure', async () => {
      const events = await apiClient.getEvents(1, 5);

      if (events.data.length > 0) {
        const event = events.data[0];

        // 验证核心属性
        assert.ok(event.id);
        assert.ok(event.title);
        assert.ok(event.event_time);
        assert.ok(event.event_type);
        assert.ok(typeof event.importance === 'number');
        assert.ok(typeof event.tone === 'number');
        assert.ok(typeof event.mentions === 'number');
      }
    });

    it('should handle pagination', async () => {
      const firstPage = await apiClient.getEvents(1, 5);
      const secondPage = await apiClient.getEvents(2, 5);

      // 如果有足够的数据，第二页应该包含不同的事件
      if (firstPage.pagination.total > 5) {
        assert.ok(secondPage.data.length > 0);
      }
    });
  });

  describe('Search Functionality', () => {
    it('should handle search queries', async () => {
      const results = await apiClient.searchEvents('美国', 1, 10);

      assert.ok(results);
      assert.ok(results.data);
      assert.ok(Array.isArray(results.data));

      console.log(`[Search] Results: ${results.data.length}`);
    });

    it('should handle empty search query', async () => {
      const results = await apiClient.searchEvents('', 1, 10);

      assert.ok(results);
      assert.ok(results.data);
    });
  });
});
