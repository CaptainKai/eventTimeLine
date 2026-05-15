#!/usr/bin/env node
/**
 * 诊断脚本
 *
 * 检查系统环境、配置和依赖
 */

import os from 'os';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║         事件时间线引擎 - 系统诊断                          ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const checks = [];
const warnings = [];

// 1. 检查 Node.js 版本
console.log('1. Node.js 环境');
const nodeVersion = process.version;
const nodeMajor = parseInt(nodeVersion.replace('v', '').split('.')[0]);
console.log(`   版本: ${nodeVersion}`);

if (nodeMajor >= 22) {
  checks.push('✓ Node.js 版本满足要求 (>=22)');
} else {
  warnings.push(`⚠ Node.js 版本可能过旧 (需要 >=22, 当前 ${nodeVersion})`);
}

console.log(`   平台: ${process.platform}`);
console.log(`   架构: ${process.arch}`);
console.log();

// 2. 检查项目文件
console.log('2. 项目结构');
const fs = await import('fs');

const requiredFiles = [
  'package.json',
  'config.mjs',
  'server.mjs',
  '.env.example',
];

for (const file of requiredFiles) {
  const exists = fs.existsSync(path.join(__dirname, file));
  if (exists) {
    checks.push(`✓ ${file}`);
  } else {
    warnings.push(`✗ ${file} 缺失`);
  }
}

const requiredDirs = [
  'apis',
  'lib',
  'api',
  'dashboard',
  'sql',
  'test',
  'docs',
];

for (const dir of requiredDirs) {
  const exists = fs.existsSync(path.join(__dirname, dir));
  if (exists) {
    checks.push(`✓ ${dir}/`);
  } else {
    warnings.push(`✗ ${dir}/ 缺失`);
  }
}
console.log();

// 3. 检查 package.json 和依赖
console.log('3. 依赖检查');
try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
  );
  console.log(`   项目: ${packageJson.name}@${packageJson.version}`);

  const deps = Object.keys(packageJson.dependencies || {});
  console.log(`   依赖: ${deps.length} 个`);

  const requiredDeps = ['express', 'pg'];
  for (const dep of requiredDeps) {
    if (deps.includes(dep)) {
      checks.push(`✓ ${dep}`);
    } else {
      warnings.push(`✗ ${dep} 缺失`);
    }
  }

  // 检查 node_modules 是否存在
  const nodeModulesExists = fs.existsSync(path.join(__dirname, 'node_modules'));
  if (nodeModulesExists) {
    checks.push('✓ node_modules 已安装');
  } else {
    warnings.push('✗ node_modules 不存在，请运行 npm install');
  }
} catch (error) {
  warnings.push(`✗ 无法读取 package.json: ${error.message}`);
}
console.log();

// 4. 检查 .env 文件
console.log('4. 环境配置');
const envExists = fs.existsSync(path.join(__dirname, '.env'));
if (envExists) {
  checks.push('✓ .env 文件存在');
} else {
  warnings.push('⚠ .env 文件不存在，请复制 .env.example');
}
console.log();

// 5. 系统资源
console.log('5. 系统资源');
console.log(`   CPU: ${os.cpus().length} 核心`);
console.log(`   内存: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB 总, ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)} GB 可用`);
console.log(`   负载: ${os.loadavg().map(v => v.toFixed(2)).join(', ')}`);
console.log();

// 检查数据库连接（可选）
console.log('6. 数据库连接 (可选检查)');
try {
  // 尝试导入 pg
  await import('pg');
  checks.push('✓ pg 模块可用');
} catch {
  warnings.push('⚠ pg 模块未安装或不可用');
}
console.log();

// 总结
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                       诊断总结                              ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

if (checks.length > 0) {
  console.log('通过的检查:');
  checks.forEach(check => console.log(`  ${check}`));
  console.log();
}

if (warnings.length > 0) {
  console.log('警告/问题:');
  warnings.forEach(warning => console.log(`  ${warning}`));
  console.log();

  console.log('建议操作:');
  if (warnings.some(w => w.includes('node_modules'))) {
    console.log('  1. 运行: npm install');
  }
  if (warnings.some(w => w.includes('.env'))) {
    console.log('  2. 复制: cp .env.example .env');
    console.log('  3. 编辑 .env 填入配置');
  }
  console.log('  4. 创建数据库并运行 SQL 脚本');
  console.log('  5. 启动: npm start');
} else {
  console.log('所有检查通过！可以启动服务器了。');
  console.log('运行: npm start');
}

console.log();
console.log('下一步:');
console.log('  1. 检查数据库是否运行');
console.log('  2. 运行 SQL 脚本初始化数据库');
console.log('  3. 启动服务器: npm start');
console.log('  4. 访问: http://localhost:3118');
console.log();

process.exit(warnings.length > 0 ? 1 : 0);
