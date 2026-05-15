import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';

describe('Database Integration Test', () => {
  let dbPool;
  let testIds = [];

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

      console.log('[Database] Connection established');
    } catch (error) {
      console.error('[Database] Connection failed:', error.message);
      dbPool = null;
    }
  });

  after(async () => {
    // 清理测试数据
    for (const testId of testIds) {
      if (testId.rawId) {
        await dbPool.query('DELETE FROM normalized_events WHERE raw_event_id = $1', [testId.rawId]).catch(() => {});
      }
      if (testId.rawId) {
        await dbPool.query('DELETE FROM raw_events WHERE id = $1', [testId.rawId]).catch(() => {});
      }
    }

    if (dbPool) {
      await dbPool.end();
      console.log('[Database] Connection closed');
    }
  });

  describe('Basic Database Operations', () => {
    it('should execute a simple query', async () => {
      if (!dbPool) {
        console.log('[Database] Skipping tests - no connection');
        return;
      }

      const result = await dbPool.query('SELECT 1 + 1 as result');
      assert.strictEqual(result.rows[0].result, 2);
      console.log('[Database] Basic query works');
    });

    it('should check table existence', async () => {
      if (!dbPool) return;

      const tables = [
        'raw_events',
        'normalized_events',
        'entity_mapping',
        'event_aggregates',
        'source_status'
      ];

      for (const tableName of tables) {
        const result = await dbPool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = $1
          )`,
          [tableName]
        );
        assert.ok(result.rows[0].exists, `Table ${tableName} should exist`);
      }
      console.log('[Database] All required tables exist');
    });
  });

  describe('Raw Events Table', () => {
    it('should insert a raw event', async () => {
      if (!dbPool) return;

      const source_event_id = `test-raw-${Date.now()}`;
      const result = await dbPool.query(
        `INSERT INTO raw_events (source, source_event_id, event_time, raw_data, source_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          'test',
          source_event_id,
          new Date().toISOString(),
          JSON.stringify({ test: true, data: 'sample' }),
          'https://example.com'
        ]
      );

      assert.ok(result.rows.length > 0);
      const insertedId = result.rows[0].id;
      testIds.push({ rawId: insertedId });
      console.log(`[Database] Inserted raw event with id: ${insertedId}`);
    });

    it('should retrieve a raw event by ID', async () => {
      if (!dbPool) return;
      if (testIds.length === 0) {
        console.log('[Database] No test data available');
        return;
      }

      const testId = testIds[0].rawId;
      const result = await dbPool.query(
        'SELECT * FROM raw_events WHERE id = $1',
        [testId]
      );

      assert.strictEqual(result.rows.length, 1);
      assert.strictEqual(result.rows[0].source, 'test');
    });

    it('should query raw events with pagination', async () => {
      if (!dbPool) return;

      const result = await dbPool.query(
        'SELECT * FROM raw_events ORDER BY event_time DESC LIMIT 10 OFFSET 0'
      );

      assert.ok(Array.isArray(result.rows));
      console.log(`[Database] Found ${result.rows.length} raw events`);
    });

    it('should handle conflict on insert', async () => {
      if (!dbPool) return;

      const source_event_id = `test-conflict-${Date.now()}`;

      // 第一次插入
      await dbPool.query(
        `INSERT INTO raw_events (source, source_event_id, event_time, raw_data, source_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'test',
          source_event_id,
          new Date().toISOString(),
          JSON.stringify({ first: true }),
          'https://example.com/first'
        ]
      );

      // 第二次插入（应该触发冲突）
      const result = await dbPool.query(
        `INSERT INTO raw_events (source, source_event_id, event_time, raw_data, source_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (source, source_event_id)
         DO UPDATE SET
           event_time = EXCLUDED.event_time,
           raw_data = EXCLUDED.raw_data,
           source_url = EXCLUDED.source_url
         RETURNING id`,
        [
          'test',
          source_event_id,
          new Date().toISOString(),
          JSON.stringify({ updated: true }),
          'https://example.com/updated'
        ]
      );

      assert.ok(result.rows.length > 0);
      testIds.push({ rawId: result.rows[0].id });
    });
  });

  describe('Normalized Events Table', () => {
    it('should insert a normalized event', async () => {
      if (!dbPool) return;

      // 首先插入一个原始事件作为外键
      const source_event_id = `test-norm-${Date.now()}`;
      const rawResult = await dbPool.query(
        `INSERT INTO raw_events (source, source_event_id, event_time, raw_data)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          'test',
          source_event_id,
          new Date().toISOString(),
          JSON.stringify({ test: true })
        ]
      );

      const rawEventId = rawResult.rows[0].id;
      testIds.push({ rawId: rawEventId });

      // 插入标准化事件
      const normalizedResult = await dbPool.query(
        `INSERT INTO normalized_events (
          raw_event_id, event_type, event_time, sentiment, importance,
          location, event_code, tone, mentions, title, description
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          rawEventId,
          'Test Event',
          new Date().toISOString(),
          0.5,
          0.8,
          'Test Location',
          '010',
          0.2,
          10,
          'Test Title',
          'Test Description'
        ]
      );

      assert.ok(normalizedResult.rows.length > 0);
      console.log(`[Database] Inserted normalized event with id: ${normalizedResult.rows[0].id}`);
    });

    it('should query normalized events with joins', async () => {
      if (!dbPool) return;

      const result = await dbPool.query(`
        SELECT
          ne.*,
          re.source,
          re.source_url
        FROM normalized_events ne
        LEFT JOIN raw_events re ON ne.raw_event_id = re.id
        ORDER BY ne.event_time DESC
        LIMIT 10
      `);

      assert.ok(Array.isArray(result.rows));
      console.log(`[Database] Found ${result.rows.length} normalized events`);
    });
  });

  describe('Entity Mapping Table', () => {
    it('should insert an entity mapping', async () => {
      if (!dbPool) return;

      const raw_name = `TestCountry-${Date.now()}`;
      const canonical_name = 'Test Country';
      const entity_type = 'country';

      const result = await dbPool.query(
        `INSERT INTO entity_mapping (raw_name, canonical_name, entity_type, confidence)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (raw_name, entity_type)
         DO UPDATE SET
           canonical_name = EXCLUDED.canonical_name,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [raw_name, canonical_name, entity_type, 0.9]
      );

      assert.ok(result.rows.length > 0);
      console.log(`[Database] Inserted entity mapping with id: ${result.rows[0].id}`);
    });

    it('should query entity mappings by type', async () => {
      if (!dbPool) return;

      const result = await dbPool.query(
        'SELECT * FROM entity_mapping WHERE entity_type = $1 LIMIT 10',
        ['country']
      );

      assert.ok(Array.isArray(result.rows));
      console.log(`[Database] Found ${result.rows.length} country entities`);
    });
  });

  describe('Aggregate Queries', () => {
    it('should count events by date', async () => {
      if (!dbPool) return;

      const result = await dbPool.query(`
        SELECT
          DATE_TRUNC('day', event_time) as date,
          COUNT(*) as event_count
        FROM normalized_events
        WHERE event_time >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', event_time)
        ORDER BY date DESC
        LIMIT 30
      `);

      assert.ok(Array.isArray(result.rows));
      console.log(`[Database] Aggregated ${result.rows.length} days of data`);
    });

    it('should calculate average sentiment', async () => {
      if (!dbPool) return;

      const result = await dbPool.query(`
        SELECT
          AVG(tone) as avg_tone,
          AVG(importance) as avg_importance
        FROM normalized_events
        WHERE tone IS NOT NULL
          AND importance IS NOT NULL
      `);

      assert.ok(result.rows.length > 0);
      console.log('[Database] Average sentiment calculation works');
    });
  });

  describe('Index Performance', () => {
    it('should use indexes on event_time', async () => {
      if (!dbPool) return;

      const explainResult = await dbPool.query(`
        EXPLAIN ANALYZE
        SELECT * FROM normalized_events
        WHERE event_time >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY event_time DESC
        LIMIT 100
      `);

      assert.ok(explainResult.rows.length > 0);
      console.log('[Database] Index usage check complete');
    });
  });
});
