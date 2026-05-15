// 调试脚本，检查我们正在修改的文件是否与服务器实际使用的文件相同
import { readFileSync, statSync } from 'fs';
import path from 'path';

console.log('--- 检查文件状态 ---');

const apiFile = './api/v1/events.mjs';

// 检查文件是否存在
try {
  const stats = statSync(apiFile);
  console.log(`文件存在，大小: ${stats.size} bytes`);
  console.log(`最后修改时间: ${stats.mtime}`);

  // 检查文件内容是否包含我们添加的调试代码
  const content = readFileSync(apiFile, 'utf8');

  // 检查API路由是否有我们添加的调试信息
  const hasApiDebugInfo = content.includes('[API /graph] 事件列表:');
  const hasInlineSql = content.includes('我们直接内联实现 getRelationshipGraph');

  console.log(`包含 [API /graph] 调试信息: ${hasApiDebugInfo}`);
  console.log(`包含内联 SQL 代码: ${hasInlineSql}`);

  // 查看路由定义
  console.log('\n--- 路由定义 ---');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('router.get(\'/graph\'')) {
      console.log(`第 ${index+1} 行: ${line}`);
    }
  });

  // 显示关键区域内容
  console.log('\n--- 关键区域内容 ---');
  const start = content.indexOf('我们直接内联实现 getRelationshipGraph');
  if (start !== -1) {
    const end = content.indexOf('const graph = { nodes };', start);
    if (end !== -1) {
      console.log(content.slice(start, end + 'const graph = { nodes };'.length));
    }
  }

} catch (error) {
  console.error('检查文件时出错:', error);
}

// 检查 Node.js 模块解析路径
console.log('\n--- Node.js 模块解析 ---');
console.log('当前目录:', process.cwd());
console.log('__dirname:', path.resolve('.'));

// 尝试直接 import 看看是否能看到我们的修改
console.log('\n--- 直接导入并检查 ---');
import('../api/v1/events.mjs').then(module => {
  console.log('成功导入 events.mjs');
  console.log('模块属性:', Object.keys(module));
}).catch(error => {
  console.error('导入模块失败:', error);
});
