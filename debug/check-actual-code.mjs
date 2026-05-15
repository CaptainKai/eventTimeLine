// 这个脚本检查服务器实际使用的代码版本
import { readFileSync } from 'fs';

console.log('--- 检查实际使用的代码 ---');

// 读取我们修改过的文件的内容
const pathToEventsQueries = './lib/db/event-relationships-queries.mjs';
console.log(`\n读取文件: ${pathToEventsQueries}`);

const content = readFileSync(pathToEventsQueries, 'utf8');
const hasDebugLog = content.includes('[getRelationshipGraph] 原子事件标题映射:');

console.log(`文件包含调试日志: ${hasDebugLog}`);

// 查找最新的修改时间
const fs = await import('fs');
const stats = fs.statSync(pathToEventsQueries);
console.log(`文件最后修改时间: ${stats.mtime}`);

console.log('\n--- 结论 ---');
console.log('我们的修改已保存到文件中，但服务器可能没有正确加载');
console.log('请确保服务器已完全重启，并正在使用正确的代码！');
