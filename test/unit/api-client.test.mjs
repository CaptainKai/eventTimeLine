import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ApiClient } from '../../dashboard/public/scripts/utils/api-test-client.mjs';
import { app } from '../../server.mjs';
import { initDB, closeDB } from '../../lib/db/connection.mjs';

describe('API Client', () => {
  let server;
  let client;

  before(async () => {
    initDB();
    server = app.listen(3221);
    client = new ApiClient('http://127.0.0.1:3221/api/v1');
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    await closeDB();
  });

  describe('Constructor', () => {
    it('should create an instance with default settings', () => {
      const testClient = new ApiClient();
      assert.ok(testClient);
      assert.strictEqual(typeof testClient.request, 'function');
      assert.strictEqual(typeof testClient.get, 'function');
      assert.strictEqual(typeof testClient.post, 'function');
    });

    it('should accept custom base URL', () => {
      const customUrl = 'http://custom.api/v2';
      const testClient = new ApiClient(customUrl);
      assert.ok(testClient);
    });
  });

  describe('Health Check', () => {
    it('should perform health check', async () => {
      const health = await client.healthCheck();
      assert.ok(health);
      assert.ok(health.status);
      assert.ok(health.timestamp);
      assert.ok(health.version);
      assert.ok(health.uptime);
    });
  });

  describe('API Methods', () => {
    it('should provide API methods', async () => {
      // 测试主要API方法是否存在
      assert.strictEqual(typeof client.getEvents, 'function');
      assert.strictEqual(typeof client.getEventById, 'function');
      assert.strictEqual(typeof client.searchEvents, 'function');
      assert.strictEqual(typeof client.getTimeline, 'function');
      assert.strictEqual(typeof client.getEntities, 'function');
      assert.strictEqual(typeof client.searchEntities, 'function');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      // 测试访问不存在的端点
      await assert.rejects(
        client.get('/nonexistent-endpoint'),
        (err) => err instanceof Error && err.message.includes('Not Found')
      );
    });
  });
});
