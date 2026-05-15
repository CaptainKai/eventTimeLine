import { query } from "../lib/db/connection.mjs";

async function checkDataIntegrity() {
  console.log("=== Checking Data Integrity ===");

  try {
    // 1. 获取所有 proto events
    const protoCount = await query("SELECT COUNT(*) FROM proto_events");
    console.log(`Total proto events: ${protoCount.rows[0].count}`);

    // 2. 获取所有 canonical events
    const canonicalCount = await query("SELECT COUNT(*) FROM events");
    console.log(`Total canonical events: ${canonicalCount.rows[0].count}`);

    // 3. 检查 proto events 与 canonical events 的关联
    const linkedProtoCount = await query(`
      SELECT COUNT(DISTINCT pe.id)
      FROM proto_events pe
      JOIN event_news en ON pe.news_id = en.news_id
      JOIN events e ON en.event_id = e.id
    `);
    console.log(`Linked proto events: ${linkedProtoCount.rows[0].count}`);

    // 4. 检查是否有 proto events 没有关联到事件
    const unlinkedProtoCount = await query(`
      SELECT COUNT(DISTINCT pe.id)
      FROM proto_events pe
      LEFT JOIN event_news en ON pe.news_id = en.news_id
      WHERE en.event_id IS NULL
    `);
    console.log(`Unlinked proto events: ${unlinkedProtoCount.rows[0].count}`);

    // 5. 检查新闻与事件的关联
    const newsCount = await query("SELECT COUNT(*) FROM news");
    console.log(`Total news items: ${newsCount.rows[0].count}`);

    const linkedNewsCount = await query(`
      SELECT COUNT(DISTINCT n.id)
      FROM news n
      JOIN event_news en ON n.id = en.news_id
    `);
    console.log(`Linked news items: ${linkedNewsCount.rows[0].count}`);

    // 6. 检查事件新闻关联表
    const eventNewsCount = await query("SELECT COUNT(*) FROM event_news");
    console.log(`Event-news associations: ${eventNewsCount.rows[0].count}`);

    // 7. 打印一些样本数据
    console.log("\n--- Sample Unlinked Proto Events ---");
    const sampleUnlinked = await query(`
      SELECT pe.id, pe.actor_raw, pe.action_raw, pe.object_raw, n.title
      FROM proto_events pe
      LEFT JOIN event_news en ON pe.news_id = en.news_id
      LEFT JOIN news n ON pe.news_id = n.id
      WHERE en.event_id IS NULL
      LIMIT 5
    `);
    sampleUnlinked.rows.forEach(row => {
      console.log(`ID: ${row.id} | Actor: ${row.actor_raw} | Action: ${row.action_raw} | News: ${row.title}`);
    });

    console.log("\n--- Data Integrity Report ---");
    const unlinkedPercentage = (unlinkedProtoCount.rows[0].count / protoCount.rows[0].count) * 100;
    console.log(`Unlinked proto events: ${unlinkedPercentage.toFixed(1)}% of total proto events`);

  } catch (error) {
    console.error("Error checking data integrity:", error);
  }
}

checkDataIntegrity().then(() => process.exit()).catch(e => {
  console.error(e);
  process.exit(1);
});
