import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';

describe('Data Flow Integration Test', () => {
  let dbPool;

  before(async () => {
    // 初始化数据库连接
    try {
      const pg = await import('pg');
      const { Pool } = pg;
      dbPool = new Pool({
        user: process.env.PGUSER || 'postgres',
        host: process.env.PGHOST || 'localhost',
        database: process.env.PGDATABASE || 'timeline',
        password: process.env.PGPASSWORD || '123456',
        port: parseInt(process.env.PGPORT) || 5432,
      });

      console.log('[DataFlow] Database connected');
    } catch (error) {
      console.error('[DataFlow] Failed to connect to database:', error.message);
      dbPool = null;
    }
  });

  after(async () => {
    if (dbPool) {
      await dbPool.end();
      console.log('[DataFlow] Database connection closed');
    }
  });

  describe('Database Connection', () => {
    it('should have a working database connection', async () => {
      if (!dbPool) {
        console.log('[DataFlow] Skipping database tests - no connection');
        return;
      }

      const result = await dbPool.query('SELECT NOW()');
      assert.ok(result);
      assert.ok(result.rows.length > 0);
      console.log('[DataFlow] Database test query succeeded');
    });

    it('should have the required tables', async () => {
      if (!dbPool) {
        console.log('[DataFlow] Skipping table existence tests');
        return;
      }

      const expectedTables = [
        'raw_events',
        'normalized_events',
        'entity_mapping',
        'event_aggregates',
        'source_status'
      ];

      for (const tableName of expectedTables) {
        const result = await dbPool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = $1
          )`,
          [tableName]
        );
        assert.strictEqual(result.rows[0].exists, true, `Table ${tableName} should exist`);
        console.log(`[DataFlow] Table ${tableName} found`);
      }
    });
  });

  describe('Data Insertion', () => {
    it('should insert and retrieve raw events', async () => {
      if (!dbPool) {
        console.log('[DataFlow] Skipping raw event tests');
        return;
      }

      // 插入测试数据
      const source_event_id = `test-${Date.now()}`;
      const insertResult = await dbPool.query(
        `INSERT INTO raw_events (source, source_event_id, event_time, raw_data, source_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          'test',
          source_event_id,
          new Date().toISOString(),
          JSON.stringify({ test: true }),
          'https://example.com'
        ]
      );

      assert.ok(insertResult.rows.length > 0);
      const insertedId = insertResult.rows[0].id;
      console.log(`[DataFlow] Inserted test raw event with id: ${insertedId}`);

      // 检索测试数据
      const selectResult = await dbPool.query(
        'SELECT * FROM raw_events WHERE id = $1',
        [insertedId]
      );
      assert.strictEqual(selectResult.rows.length, 1);
      assert.strictEqual(selectResult.rows[0].source_event_id, source_event_id);

      // 清理测试数据
      await dbPool.query('DELETE FROM raw_events WHERE id = $1', [insertedId]);
    });
  });

  describe('Data Pipeline Components', () => {
    it('should have the GDELT source processor', async () => {
      // 导入 GDELT 模块
      const gdeltModule = await import('../../apis/sources/gdelt.mjs');
      assert.ok(gdeltModule);
      assert.strictEqual(typeof gdeltModule.processGDELTEvents, 'function');
      assert.strictEqual(typeof gdeltModule.fetchGDELTEvents, 'function');
      assert.strictEqual(typeof gdeltModule.generateMockGDELTEvents, 'function');
      assert.strictEqual(typeof gdeltModule.getLatestGDELTExportInfo, 'function');
      console.log('[DataFlow] GDELT module imported successfully');
    });

    it('should generate mock GDELT events', async () => {
      const gdeltModule = await import('../../apis/sources/gdelt.mjs');
      const mockEvents = gdeltModule.generateMockGDELTEvents(10);

      assert.ok(Array.isArray(mockEvents));
      assert.strictEqual(mockEvents.length, 10);
      console.log(`[DataFlow] Generated ${mockEvents.length} mock GDELT events`);

      // 验证事件结构
      mockEvents.forEach(event => {
        assert.ok(Array.isArray(event));
        assert.ok(event.length > 0);
      });
    });
  });

  describe('Orchestrator', () => {
    it('should have the orchestrator module', async () => {
      const orchestrator = await import('../../apis/orchestrator.mjs');
      assert.ok(orchestrator);
      assert.strictEqual(typeof orchestrator.runFullSweep, 'function');
      assert.strictEqual(typeof orchestrator.runSource, 'function');
      assert.strictEqual(typeof orchestrator.registerSource, 'function');
      assert.strictEqual(typeof orchestrator.getSources, 'function');
      console.log('[DataFlow] Orchestrator module imported successfully');
    });

    it('should list registered sources', async () => {
      const orchestrator = await import('../../apis/orchestrator.mjs');
      const sources = orchestrator.getSources();
      assert.ok(Array.isArray(sources));
      assert.ok(sources.length >= 0);
      console.log(`[DataFlow] Found ${sources.length} registered sources`);
    });
  });

  describe('Database Queries', () => {
    it('should have the raw event queries module', async () => {
      const rawQueries = await import('../../lib/db/raw-queries.mjs');
      assert.ok(rawQueries);
      assert.strictEqual(typeof rawQueries.saveRawEvent, 'function');
      assert.strictEqual(typeof rawQueries.getRawEvents, 'function');
      assert.strictEqual(typeof rawQueries.getRawEventById, 'function');
      assert.strictEqual(typeof rawQueries.searchRawEvents, 'function');
      console.log('[DataFlow] Raw queries module imported successfully');
    });

    it('should have the normalized event queries module', async () => {
      const normalizedQueries = await import('../../lib/db/normalized-queries.mjs');
      assert.ok(normalizedQueries);
      assert.strictEqual(typeof normalizedQueries.saveNormalizedEvent, 'function');
      assert.strictEqual(typeof normalizedQueries.getNormalizedEvents, 'function');
      assert.strictEqual(typeof normalizedQueries.getNormalizedEventById, 'function');
      assert.strictEqual(typeof normalizedQueries.getEventsByDateRange, 'function');
      assert.strictEqual(typeof normalizedQueries.searchNormalizedEvents, 'function');
      console.log('[DataFlow] Normalized queries module imported successfully');
    });
  });
});
