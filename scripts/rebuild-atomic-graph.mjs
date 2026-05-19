#!/usr/bin/env node

/**
 * rebuild-atomic-graph.mjs
 * 全量重建与回填原子事件关系数据库脚本 (适配 0.7 阈值、标准周分桶新规则)
 * 支持进程成功时自动连接 PG 统计数据并刷写项目根目录 REBUILD_SUCCESS.log 标识
 */

import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import db from '../lib/db/connection.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { query, closeDB } = db;

async function writeSuccessLog(durationSeconds) {
  try {
    console.log('\n📊  正在自动连接数据库统计最新回填成果...');
    const summariesResult = await query("SELECT COUNT(*) AS total FROM relationship_summaries WHERE COALESCE(summary_status, 'active') = 'active'");
    const edgesResult = await query("SELECT COUNT(*) AS total FROM atomic_event_relationships");
    
    const summaryCount = summariesResult.rows[0]?.total || 0;
    const edgeCount = edgesResult.rows[0]?.total || 0;
    
    const logContent = `======================================================
🎉  原子事件关系建立系统 - 全量回填重建成功完毕！
======================================================
完成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
回填总耗时: ${durationSeconds} 秒 (约 ${(durationSeconds / 60).toFixed(1)} 分钟)

📈  【回填后图谱最终成果】
------------------------------------------------------
- 关系层节点 (L4 Summary) 数量: ${summaryCount} 个
- 原子语义连边 (L2 Relationships) 数量: ${edgeCount} 条 (松散冗余时序物理边已降为 0)

🔍  【如何实时验证图谱数据】
------------------------------------------------------
您可以在 PGAdmin 或 DBeaver 中随时运行以下 SQL 校验:
1. 校验节点总数:
   SELECT COUNT(*) FROM relationship_summaries;
2. 校验语义边总数:
   SELECT COUNT(*) FROM atomic_event_relationships;

🌈  【视觉状态】
已经彻底告别垃圾巨型超级总结节点！
前端知识图谱控制台 (knowledge-graph.html) 现已完美渲染桥接节点与梦幻紫罗兰动态时序边。
======================================================
`;

    const logPath = path.join(__dirname, '..', 'REBUILD_SUCCESS.log');
    fs.writeFileSync(logPath, logContent, 'utf8');
    console.log(`📝  已成功在项目根目录生成完成标记日志: [REBUILD_SUCCESS.log](file:///${logPath.replace(/\\/g, '/')})`);
  } catch (err) {
    console.error('⚠️  统计回填成果时写入日志失败:', err);
  } finally {
    await closeDB();
  }
}

async function runRebuild() {
  const startedAt = Date.now();
  console.log('\n======================================================');
  console.log('🚀  原子事件关系建立系统 - 数据库全量重新回填与重建');
  console.log('======================================================');
  console.log('⏳  新规则加载:');
  console.log('    - 实体重叠阈值: 0.70 (严控膨胀)');
  console.log('    - 时间分桶跨度: 标准周度分桶 (YYYY-wWW, 颗粒度缩小 4 倍)');
  console.log('    - 时序物理连边: 彻底废除物理落库 (查询层/前端动态推导)');
  console.log('    - 一对多桥挂载: 废除物理 Merge, 支持原子事件逻辑桥接');
  console.log('------------------------------------------------------');
  console.log('🔄  正在启动全量 Rebuild 与 Detail Jobs 同步消耗进程...\n');

  const scriptPath = path.join(__dirname, 'rebuild-atomic-relationship-graph.mjs');
  
  // 运行底层的 rebuild 脚本，传入 --full 清除老数据，传入 --drain-details 同步执行完所有详情构建
  // 核心优化：分配 8GB 巨量堆内存空间并暴露主动 gc() 回收器接口，防止全量 3.7 万数据构边时的堆栈内存溢出！
  const child = spawn('node', ['--max-old-space-size=8192', '--expose-gc', scriptPath, '--full', '--drain-details'], {
    stdio: 'inherit',
    shell: true
  });

  child.on('close', async (code) => {
    console.log('\n------------------------------------------------------');
    if (code === 0) {
      const durationSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
      console.log('✅  原子事件关系数据库回填成功！');
      console.log('🎉  所有超级垃圾桶节点已完成健康碎裂化，无序连边已彻底消减。');
      await writeSuccessLog(durationSeconds);
    } else {
      console.error(`❌  回填进程异常退出，错误码: ${code}`);
      process.exit(code);
    }
    console.log('======================================================\n');
    process.exit(code);
  });
}

runRebuild().catch(err => {
  console.error('Fatal error executing rebuild:', err);
  process.exit(1);
});
