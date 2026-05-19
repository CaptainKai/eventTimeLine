const { Client } = require('pg');

const client = new Client('postgres://postgres:123456@localhost:5432/timeline');

async function run() {
  await client.connect();

  const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='relationship_summaries'`);
  console.log("relationship_summaries columns:", cols.rows.map(r=>r.column_name).join(', '));

  const sample = await client.query(`SELECT * FROM relationship_summaries LIMIT 1`);
  console.log("sample:", sample.rows[0]);

  await client.end();
}

run();
