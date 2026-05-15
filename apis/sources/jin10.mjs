import { fetchJSON } from '../utils/fetch.mjs';
import { processNewsArticle } from '../../lib/pipeline/news-pipeline.mjs';
import { createHash } from 'crypto';

const SOURCE_NAME = 'jin10';

export const JIN10_CONFIG = {
  name: SOURCE_NAME,
  enabled: process.env.JIN10_ENABLED === 'true',
  priority: 3,
  apiUrl: 'https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'x-app-id': 'bVBF4FyRTn5NJF5n',
    'x-version': '1.0.0'
  }
};

/**
 * 内容清洗
 */
function cleanHTML(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .trim();
}

/**
 * 过滤规则
 */
function shouldSkip(item) {
  if (item.extras?.ad === true) return 'ad';
  const raw = item.data?.content || '';
  if (raw.includes('section-news')) return 'html-list';
  const content = cleanHTML(raw);
  if (!content || content.length < 5) return 'empty';
  if (/^.{0,30}点击查看[…\.]{1,3}$/.test(content)) return 'click-bait';
  if (content.length < 30 && /点击查看/.test(content)) return 'click-bait';
  return null;
}

function hashSourceEventId(id) {
  return createHash('sha1').update(String(id)).digest('hex');
}

/**
 * 将 jin10 item 转换为统一格式
 */
function toItemData(item) {
  const content = cleanHTML(item.data?.content || '');
  const title = (item.data?.title || '').trim() || content.slice(0, 50);
  const importance = item.important || 0;

  return {
    source: SOURCE_NAME,
    source_url: `https://www.jin10.com/flash/${item.id}`,
    title,
    content,
    published_at: item.time || new Date().toISOString(),
    importance,
    lang: 'zh',
    reliability_score: 0.9,
    normalized_data: {
      jin10_id: item.id,
      jin10_important: importance,
      jin10_channels: item.channel || [],
    },
    raw_data: item,
    source_event_id: hashSourceEventId(item.id),
  };
}

/**
 * 金十数据采集主函数
 */
export async function processJin10(limit = 20, options = {}) {
  console.log(`[Jin10] Fetching from API: ${JIN10_CONFIG.apiUrl}`);

  try {
    const json = await fetchJSON(JIN10_CONFIG.apiUrl, { headers: JIN10_CONFIG.headers });
    if (json.status !== 200 || !Array.isArray(json.data)) {
      throw new Error(`Invalid response status: ${json.status}`);
    }

    const items = json.data.slice(0, limit);
    console.log(`[Jin10] Received ${items.length} items`);

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of items) {
      // 过滤
      const skipReason = shouldSkip(item);
      if (skipReason) {
        skipped++;
        continue;
      }

      try {
        const result = await processNewsArticle(toItemData(item));

        if (result.status === 'success') {
          success++;
        } else if (result.status === 'skipped') {
          skipped++;
        }
      } catch (error) {
        console.error(`[Jin10] Failed to process item ${item.id}:`, error.message);
        failed++;
      }
    }

    console.log(`[Jin10] Sweep complete: ${success} success, ${skipped} skipped, ${failed} failed`);
    return { success, failed, skipped };
  } catch (error) {
    console.error(`[Jin10] Fetch failed:`, error.message);
    return { success: 0, failed: 1, skipped: 0, error: error.message };
  }
}

export default {
  name: SOURCE_NAME,
  process: processJin10,
};
