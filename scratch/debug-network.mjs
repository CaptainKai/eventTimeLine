import http from 'http';
import https from 'https';
import { URL } from 'url';

// 模拟 node-fetch 可能会用到的库
async function testFetch() {
  try {
    const { default: fetch } = await import('node-fetch');
    console.log('\n--- Testing node-fetch with http://127.0.0.1:5001/health ---');
    
    // 1. 默认测试
    const res1 = await fetch('http://127.0.0.1:5001/health').catch(e => e.message);
    console.log('Result (Default):', typeof res1 === 'string' ? res1 : 'Success');

    // 2. 显式 agent: false 测试
    const res2 = await fetch('http://127.0.0.1:5001/health', { agent: false }).catch(e => e.message);
    console.log('Result (agent: false):', typeof res2 === 'string' ? res2 : 'Success');

    // 3. 强制干净 Agent 测试
    const cleanAgent = new http.Agent({ keepAlive: false });
    const res3 = await fetch('http://127.0.0.1:5001/health', { agent: cleanAgent }).catch(e => e.message);
    console.log('Result (Clean Agent):', typeof res3 === 'string' ? res3 : 'Success');

  } catch (err) {
    console.error('Fetch test setup failed:', err);
  }
}

function testRawHttp() {
  console.log('\n--- Testing Raw Node.js http.get ---');
  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: 5001,
      path: '/health',
      method: 'GET',
      agent: false // 禁用全局 Agent
    };

    const req = http.get(options, (res) => {
      console.log(`Raw HTTP Status: ${res.statusCode}`);
      resolve('Success');
    });

    req.on('error', (e) => {
      console.log('Raw HTTP Error:', e.message);
      resolve(e.message);
    });

    req.end();
  });
}

console.log('=== Network Diagnosis Start ===');
console.log('Process PID:', process.pid);
console.log('Environment Proxies:');
console.log('  HTTP_PROXY:', process.env.HTTP_PROXY || 'None');
console.log('  HTTPS_PROXY:', process.env.HTTPS_PROXY || 'None');
console.log('  ALL_PROXY:', process.env.ALL_PROXY || 'None');

await testRawHttp();
await testFetch();

console.log('\n=== Diagnosis Complete ===');
