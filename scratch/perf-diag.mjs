import 'dotenv/config';
import { query, closeDB } from '../lib/db/connection.mjs';

async function experiment() {
  const batchSize = 1000;
  const { rows: protos } = await query(`SELECT pe.id, pe.actor_entity_id FROM proto_events pe LIMIT ${batchSize}`);
  
  console.log(`Testing with ${batchSize} protos...`);

  // 实验 1: 纯内存模拟
  const t0 = Date.now();
  for (let i = 0; i < batchSize; i++) {
    const p = protos[i];
    // 模拟内存计算
    const mockMatch = protos.filter(other => other.actor_entity_id === p.actor_entity_id);
  }
  console.log(`[EXP 1] Pure memory simulation (O(N^2) filter): ${Date.now() - t0}ms`);

  // 实验 2: 模拟现状 (带 DB 查询)
  const t1 = Date.now();
  for (let i = 0; i < batchSize; i++) {
    const p = protos[i];
    await query('SELECT 1'); // 模拟一次简单的查询交互
  }
  console.log(`[EXP 2] DB Overhead (1 query per loop): ${Date.now() - t1}ms`);
  
  await closeDB();
}

experiment();
