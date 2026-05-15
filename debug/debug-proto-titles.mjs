import { query } from '../lib/db/connection.mjs';

async function debugProtoTitles() {
  // 首先获取一些事件ID
  const eventsSql = `
    SELECT id, event_type
    FROM events
    ORDER BY id DESC
    LIMIT 5;
  `;

  const eventsResult = await query(eventsSql);
  const eventIds = eventsResult.rows.map(row => row.id);
  console.log('事件ID列表:', eventIds);

  // 检查这些事件是否有原子事件
  const checkProtoSql = `
    SELECT
      pe.canonical_event_id,
      pe.id as proto_event_id,
      n.title as news_title,
      pe.actor_raw,
      pe.action_raw,
      pe.object_raw
    FROM proto_events pe
    LEFT JOIN news n ON pe.news_id = n.id
    WHERE pe.canonical_event_id = ANY($1::int[])
    ORDER BY pe.canonical_event_id, pe.created_at DESC;
  `;

  const protoResult = await query(checkProtoSql, [eventIds]);
  console.log('\n原子事件查询结果:');
  protoResult.rows.forEach(row => {
    console.log(`  事件 ${row.canonical_event_id}:`, {
      proto_event_id: row.proto_event_id,
      news_title: row.news_title,
      actor_raw: row.actor_raw,
      action_raw: row.action_raw,
      object_raw: row.object_raw
    });
  });

  // 现在测试DISTINCT ON的查询
  const distinctSql = `
    SELECT DISTINCT ON (pe.canonical_event_id)
      pe.canonical_event_id,
      pe.actor_raw,
      pe.action_raw,
      pe.object_raw,
      n.title as news_title
    FROM proto_events pe
    LEFT JOIN news n ON pe.news_id = n.id
    WHERE pe.canonical_event_id = ANY($1::int[])
    ORDER BY pe.canonical_event_id, pe.created_at DESC;
  `;

  const distinctResult = await query(distinctSql, [eventIds]);
  console.log('\nDISTINCT ON查询结果:');
  distinctResult.rows.forEach(row => {
    console.log(`  事件 ${row.canonical_event_id}:`, {
      news_title: row.news_title,
      actor_raw: row.actor_raw,
      action_raw: row.action_raw,
      object_raw: row.object_raw
    });
  });
}

debugProtoTitles().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('错误:', error);
  process.exit(1);
});
