#!/usr/bin/env node
// 放到 eventTimeLine 根目录
import fetch from 'node:http';

async function request(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://127.0.0.1:3118');
    const req = fetch(url.href);
    req.then(r => r.json().then(data => resolve({ status: r.status, data }))).catch(reject);
  });
}

const { status, data } = await request('/api/debug/env');
console.log('状态码:', status);
console.log('环境变量:');
console.log(JSON.stringify(data, null, 2));