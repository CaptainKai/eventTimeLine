import { fetchText } from '../utils/fetch.mjs';
import { parseFeedDocument, pickNewestFeedItems } from '../utils/rss-parser.mjs';
import { processNewsArticle } from '../../lib/pipeline/news-pipeline.mjs';
import { createHash } from 'crypto';

const SOURCE_NAME = 'newsminimalist';

export const NEWS_MINIMALIST_CONFIG = {
  name: SOURCE_NAME,
  enabled: process.env.NEWS_MINIMALIST_ENABLED === 'true',
  priority: 4,
  rssUrl: 'https://rss.beehiiv.com/feeds/4aF2pGVAEN.xml',
};

function hashSourceEventId(link, guid) {
  return createHash('sha1')
    .update(`${guid || ''}|${link || ''}`)
    .digest('hex');
}

/**
 * 提取评分
 */
function extractScore(contentEncoded) {
  if (!contentEncoded) return null;
  const scoreMatch = contentEncoded.match(/\[(\d+\.\d+)\]/);
  return scoreMatch && scoreMatch[1] ? parseFloat(scoreMatch[1]) : null;
}

/**
 * 将 RSS item 转换为统一格式
 */
function toItemData(item) {
  const title = item.title || 'Untitled';
  const content = item.description || title;
  const score = extractScore(item.raw_data?.['content:encoded']?.[0] || '');
  const importance = score ? score / 10 : 0.5;

  return {
    source: SOURCE_NAME,
    source_url: item.link,
    title,
    content,
    published_at: item.published_at || new Date().toISOString(),
    importance,
    lang: 'en',
    reliability_score: 0.95,
    normalized_data: {
      minimalist_score: score,
      minimalist_important: score && score > 6.0 ? 1 : 0,
      rss_guid: item.guid || null,
    },
    raw_data: item,
    source_event_id: hashSourceEventId(item.link, item.guid),
  };
}

export async function processNewsMinimalist(limit = 20) {
  const rssUrl = NEWS_MINIMALIST_CONFIG.rssUrl;
  console.log(`[NewsMinimalist] Fetching RSS: ${rssUrl}`);

  try {
    const xml = await fetchText(rssUrl, {
      headers: { 'User-Agent': 'Event Timeline Engine Bot 1.0' }
    });

    const items = await parseFeedDocument(xml, rssUrl);
    const newestItems = pickNewestFeedItems(items, limit);
    console.log(`[NewsMinimalist] Found ${newestItems.length} new items`);

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of newestItems) {
      if (!item.link) {
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
        console.error(`[NewsMinimalist] Failed to process item ${item.link}:`, error.message);
        failed++;
      }
    }

    console.log(`[NewsMinimalist] Processing complete: ${success} success, ${skipped} skipped, ${failed} failed`);
    return { success, failed, skipped };
  } catch (error) {
    console.error(`[NewsMinimalist] Failed to fetch feed:`, error.message);
    return { success: 0, failed: 1, skipped: 0, error: error.message };
  }
}

export default {
  name: SOURCE_NAME,
  process: processNewsMinimalist,
};
