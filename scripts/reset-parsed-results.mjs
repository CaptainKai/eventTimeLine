#!/usr/bin/env node

import { query } from '../lib/db/connection.mjs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function resetParsedResults(skipConfirm = false) {
  console.log('=== 解析结果重置工具 ===');
  console.log('注意：此操作将删除所有解析结果，但保留原始新闻数据！');
  console.log('');

  // 只有在非API模式下才要求确认
  if (!skipConfirm) {
    const readline = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirm = await new Promise((resolve) => {
      readline.question('请输入 "YES" 确认继续，其他键取消: ', (answer) => {
        readline.close();
        resolve(answer.trim() === 'YES');
      });
    });

    if (!confirm) {
      console.log('操作已取消。');
      process.exit(0);
    }
  }

  try {
    console.log('\n开始重置解析结果...');

    // 1. 备份当前数据统计信息
    console.log('1. 读取当前数据统计...');
    const statsBefore = await getCurrentStats();
    console.log('   当前状态:');
    console.log(`     - 新闻数量: ${statsBefore.newsCount}`);
    console.log(`     - 事件数量: ${statsBefore.eventsCount}`);
    console.log(`     - 原子事件数量: ${statsBefore.protoEventsCount}`);

    // 2. 执行 SQL 重置脚本
    console.log('\n2. 执行重置脚本...');
    const sqlPath = join(__dirname, '../sql/reset-parsed-results.sql');
    const sql = await readFile(sqlPath, 'utf8');

    // 分步骤执行 SQL，避免一次性执行太长的语句
    const statements = sql.split(';').filter(s => s.trim());

    for (const statement of statements) {
      if (statement.trim() && !statement.trim().startsWith('--')) {
        try {
          await query(statement);
        } catch (e) {
          // 忽略一些可能的错误（如重置序列）
          console.log(`   警告: ${e.message}`);
        }
      }
    }

    // 3. 验证重置结果
    console.log('\n3. 验证重置结果...');
    const statsAfter = await getCurrentStats();
    console.log('   重置后状态:');
    console.log(`     - 新闻数量: ${statsAfter.newsCount} (保持不变)`);
    console.log(`     - 事件数量: ${statsAfter.eventsCount}`);
    console.log(`     - 原子事件数量: ${statsAfter.protoEventsCount}`);

    // 验证新闻数据未被删除
    if (statsAfter.newsCount !== statsBefore.newsCount) {
      console.error('\n错误：新闻数据被意外修改！');
      if (!skipConfirm) {
        process.exit(1);
      } else {
        throw new Error('新闻数据被意外修改');
      }
    }

    console.log('\n✅ 解析结果重置成功！');
    console.log('\n下一步：');
    console.log('1. 重新运行服务器');
    console.log('2. 调用 /api/v1/admin/reparse-all 接口重新解析所有新闻');
    console.log('   或手动触发各新闻的解析');

  } catch (error) {
    console.error('\n❌ 重置失败:', error);
    if (!skipConfirm) {
      process.exit(1);
    } else {
      throw error; // 重新抛出错误，让API能够捕获并返回给客户端
    }
  }
}

async function getCurrentStats() {
  const [newsCount, eventsCount, protoEventsCount] = await Promise.all([
    query('SELECT COUNT(*) FROM news'),
    query('SELECT COUNT(*) FROM events'),
    query('SELECT COUNT(*) FROM proto_events')
  ]);

  return {
    newsCount: parseInt(newsCount.rows[0].count),
    eventsCount: parseInt(eventsCount.rows[0].count),
    protoEventsCount: parseInt(protoEventsCount.rows[0].count)
  };
}

// 导出供 API 使用
export { resetParsedResults };

// 如果是直接运行脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  resetParsedResults();
}
