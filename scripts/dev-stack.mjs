import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = path.join(projectRoot, 'infra', 'dev', 'compose.yaml');
const localEnvFile = path.join(projectRoot, 'infra', 'dev', '.env');
const exampleEnvFile = path.join(projectRoot, 'infra', 'dev', '.env.example');
const envFile = existsSync(localEnvFile) ? localEnvFile : exampleEnvFile;
const composeArgs = ['compose', '--env-file', envFile, '-f', composeFile];
const stopOnly = process.argv.includes('--stop');
let serverProcess = null;
let shuttingDown = false;

function runDocker(args, stdio = 'inherit') {
  return spawnSync('docker', [...composeArgs, ...args], { cwd: projectRoot, stdio, shell: false });
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[DEV-STACK] ${signal}: stopping managed components`);

  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => serverProcess.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 7000))
    ]);
    if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
  }

  const down = runDocker(['down', '--remove-orphans']);
  if (down.status !== 0) exitCode = down.status || 1;
  console.log('[DEV-STACK] Managed components stopped; persistent volumes retained');
  process.exit(exitCode);
}

if (stopOnly) {
  const result = runDocker(['down', '--remove-orphans']);
  process.exit(result.status || 0);
}

const up = runDocker(['up', '-d', '--remove-orphans']);
if (up.error?.code === 'ENOENT') {
  console.error('[DEV-STACK] Docker CLI is not installed or not available in PATH');
  process.exit(1);
}
if (up.status !== 0) process.exit(up.status || 1);

serverProcess = spawn(process.execPath, ['server.mjs'], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false
});

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
serverProcess.once('exit', (code, signal) => {
  if (!shuttingDown) shutdown(`server exit (${signal || code})`, code || 0);
});
