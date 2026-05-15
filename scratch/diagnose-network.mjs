import http from 'http';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testUrl(url) {
  console.log(`\nTesting URL: ${url}`);
  try {
    const start = Date.now();
    const res = await new Promise((resolve, reject) => {
      const req = (url.startsWith('https') ? https : http).get(url, { timeout: 5000 }, (res) => {
        resolve(res);
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout after 5000ms'));
      });
    });
    console.log(`Status: ${res.statusCode} (Took ${Date.now() - start}ms)`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (err.cause) console.error(`Cause: ${err.cause.message}`);
  }
}

async function run() {
  console.log('=== Network Diagnosis ===');
  console.log(`Time: ${new Date().toLocaleString()}`);
  
  console.log('\n1. Checking environment variables:');
  console.log(`HTTP_PROXY: ${process.env.HTTP_PROXY || 'not set'}`);
  console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || 'not set'}`);
  
  console.log('\n2. Testing Connectivity:');
  await testUrl('http://localhost:5432'); // DB
  await testUrl('https://www.baidu.com');
  await testUrl('https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1');
  
  console.log('\n3. Checking System Proxy (Windows):');
  try {
    const { stdout } = await execAsync('reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable');
    console.log(`ProxyEnable: ${stdout.trim()}`);
    const { stdout: server } = await execAsync('reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer');
    console.log(`ProxyServer: ${server.trim()}`);
  } catch (e) {
    console.log('Could not get system proxy settings.');
  }
}

run();
