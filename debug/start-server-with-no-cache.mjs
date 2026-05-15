// 强制清除模块缓存并启动服务器
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- 启动服务器（强制清除 Node.js 缓存） ---');
console.log('当前工作目录:', process.cwd());

// 使用 --no-warnings 禁用警告，--trace-warnings 启用警告追踪
const command = `cd "${path.resolve(__dirname, '..')}" && node --no-warnings --trace-warnings --experimental-specifier-resolution=node server.mjs`;

console.log(`执行命令: ${command}`);

const child = exec(command);

// 捕获输出
child.stdout.on('data', (data) => {
  console.log(data.trim());
});

child.stderr.on('data', (data) => {
  console.error(data.trim());
});

child.on('close', (code) => {
  console.log(`--- 服务器进程结束，退出码: ${code} ---`);
});

// 捕获意外错误
child.on('error', (error) => {
  console.error(`--- 执行命令失败: ---`);
  console.error(error);
});
