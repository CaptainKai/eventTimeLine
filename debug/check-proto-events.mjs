import { query } from '../lib/db/connection.mjs';

async function checkProtoEvents() {
  console.log('正在检查原子事件数据...');

  // 查询所有标准事件及其对应的原子事件数量
  const sql = `
    SELECT
      e.id AS event_id,
      e.event_type,
      COUNT(DISTINCT pe.id) AS proto_events_count
    FROM events e
    LEFT JOIN proto_events pe ON e.id = pe.canonical_event_id
    GROUP BY e.id, e.event_type
    ORDER BY proto_events_count DESC;
  `;

  try {
    const result = await query(sql);

    console.log('标准事件与原子事件统计：');
    console.log('--------------------------');
    console.log(`总计 ${result.rows.length} 个标准事件`);
    console.log(`包含原子事件的标准事件：${result.rows.filter(row => row.proto_events_count > 0).length} 个`);

    // 显示前20个事件的详情
    console.log('\n前20个事件的原子事件数量：');
    console.log('事件ID\t事件类型\t原子事件数量');
    console.log('---\t---\t---');
    result.rows.slice(0, 20).forEach(row => {
      console.log(`${row.event_id}\t${row.event_type}\t${row.proto_events_count}`);
    });

    // 检查是否有原子事件数据
    const totalProtoEvents = result.rows.reduce((sum, row) => sum + parseInt(row.proto_events_count), 0);
    console.log(`\n数据库中总原子事件数量：${totalProtoEvents}`);

    // 如果有原子事件，检查前几个事件的详细数据
    if (totalProtoEvents > 0) {
      const firstEventId = result.rows.find(row => row.proto_events_count > 0)?.event_id;
      if (firstEventId) {
        console.log(`\n事件 ${firstEventId} 的详细原子事件：`);
        const eventDetailsSql = `
          SELECT
            pe.id,
            pe.actor_raw,
            pe.action_raw,
            pe.object_raw,
            pe.news_id,
            n.title AS news_title
          FROM proto_events pe
          LEFT JOIN news n ON pe.news_id = n.id
          WHERE pe.canonical_event_id = $1;
        `;

        const eventDetails = await query(eventDetailsSql, [firstEventId]);
        eventDetails.rows.forEach(pe => {
          console.log(`- ${pe.actor_raw} ${pe.action_raw} ${pe.object_raw} (新闻标题: ${pe.news_title})`);
        });
      }
    }

  } catch (error) {
    console.error('查询失败:', error);
  }
}

checkProtoEvents().then(() => {
  process.exit(0);
});
