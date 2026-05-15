import { safeFetch } from './fetch.mjs';
import { exec } from 'child_process';
import { promisify } from 'util';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TMP_DIR = path.join(PROJECT_ROOT, 'tmp');

function pickLatestExportLine(lines) {
  const exportLines = lines.filter(line => line.includes('.export.CSV.zip'));
  if (exportLines.length === 0) return null;

  let latest = null;
  let latestTs = -1;

  for (const line of exportLines) {
    const parts = line.trim().split(/\s+/);
    const fileUrl = parts[2];
    if (!fileUrl) continue;

    const fileName = path.basename(fileUrl);
    const tsMatch = fileName.match(/^(\d{14})\.export\.CSV\.zip$/);
    if (!tsMatch) continue;

    const ts = Number.parseInt(tsMatch[1], 10);
    if (Number.isFinite(ts) && ts > latestTs) {
      latestTs = ts;
      latest = line;
    }
  }

  return latest;
}

function parseExportLine(line) {
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  const fileUrl = parts[2];
  if (!fileUrl) return null;
  const fileName = path.basename(fileUrl);
  const tsMatch = fileName.match(/^(\d{14})\.export\.CSV\.zip$/);
  const fileTimestamp = tsMatch?.[1] || null;
  return { fileUrl, fileName, fileTimestamp };
}

export async function getLatestGDELTExportInfo() {
  const lastUpdateUrl = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';
  const masterFileUrl = 'http://data.gdeltproject.org/gdeltv2/masterfilelist.txt';

  try {
    console.log('[GDELT] Fetching lastupdate file...');
    const response = await safeFetch(lastUpdateUrl);
    const text = await response.text();
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const exportLine = lines.find(line => line.includes('.export.CSV.zip'));
    const parsed = parseExportLine(exportLine);
    if (parsed) return parsed;
  } catch (error) {
    console.warn('[GDELT] lastupdate unavailable, fallback to masterfilelist:', error.message);
  }

  console.log('[GDELT] Fetching master file list...');
  const response = await safeFetch(masterFileUrl);
  const text = await response.text();
  const lines = text.split('\n');
  const exportLine = pickLatestExportLine(lines);
  const parsed = parseExportLine(exportLine);
  if (!parsed) throw new Error('No export file found from GDELT endpoints');
  return parsed;
}

/**
 * 流式处理最新 GDELT export 文件（只读取前 limit 条）
 */
export async function streamLatestGDELTLines(limit, onLine, exportInfo = null) {
  let tmpDir = null;

  try {
    const { fileUrl, fileName, fileTimestamp } = exportInfo || await getLatestGDELTExportInfo();
    console.log(`[GDELT] Latest file found: ${fileName}`);

    // 确保项目 tmp 目录存在
    await fs.mkdir(TMP_DIR, { recursive: true });
    tmpDir = path.join(TMP_DIR, `gdelt-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, fileName);

    console.log(`[GDELT] Downloading ${fileUrl}...`);
    const fileRes = await safeFetch(fileUrl);
    const zipBuffer = Buffer.from(await fileRes.arrayBuffer());
    await fs.writeFile(zipPath, zipBuffer);

    console.log(`[GDELT] Extracting ${fileName}...`);
    await execAsync(`tar -xf "${zipPath}" -C "${tmpDir}"`);

    const files = await fs.readdir(tmpDir);
    const csvFile = files.find(f => f.endsWith('.CSV'));
    if (!csvFile) throw new Error('CSV file not found after extraction');
    const csvPath = path.join(tmpDir, csvFile);
    const rl = readline.createInterface({
      input: fsSync.createReadStream(csvPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let seen = 0;
    for await (const line of rl) {
      if (!line || !line.trim()) continue;
      seen++;
      await onLine(line);
      if (seen >= limit) {
        rl.close();
        break;
      }
    }

    return { fileName, fileTimestamp, linesRead: seen };
  } catch (error) {
    console.error('[GDELT] Download/Extract failed:', error);
    return null;
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * 解析 GDELT CSV 行
 */
export function parseGDELTLine(line) {
  if (!line) return null;
  const fields = line.split('\t');
  if (fields.length < 50) return null;
  return fields;
}
