import { createHash } from 'crypto';
import { fetchText } from '../utils/fetch.mjs';
import { parseFeedDocument, pickNewestFeedItems } from '../utils/rss-parser.mjs';
import { extractArticleFromHtml } from '../utils/article-extractor.mjs';
import { processNewsArticle } from '../../lib/pipeline/news-pipeline.mjs';

const SOURCE_NAME = 'rss-news';

function splitFeedUrls(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export const RSS_NEWS_CONFIG = {
  name: SOURCE_NAME,
  enabled: process.env.RSS_NEWS_ENABLED === 'true' || splitFeedUrls(process.env.RSS_NEWS_FEEDS).length > 0,
  priority: 2,
  feedUrls: splitFeedUrls(process.env.RSS_NEWS_FEEDS),
  maxItemsPerFeed: parseInt(process.env.RSS_NEWS_MAX_ITEMS_PER_FEED || '10', 10),
};

function hashSourceEventId(link, guid) {
  return createHash('sha1')
    .update(`${guid || ''}|${link || ''}`)
    .digest('hex');
}

export async function fetchFeedItems(feedUrl, limit = RSS_NEWS_CONFIG.maxItemsPerFeed) {
  const xml = await fetchText(feedUrl, {
    headers: {
      'User-Agent': 'Event Timeline Engine Bot 1.0',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
  });

  const items = await parseFeedDocument(xml, feedUrl);
  return pickNewestFeedItems(items, limit);
}

export async function fetchArticle(url) {
  const html = await fetchText(url, {
    headers: {
      'User-Agent': 'Event Timeline Engine Bot 1.0',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  return extractArticleFromHtml(html, url);
}

/**
 * 将 RSS item 转换为统一格式
 */
async function toItemData(feedUrl, item) {
  const article = await fetchArticle(item.link);
  const title = article.title || item.title || item.link;
  const content = article.content || item.description || title;

  return {
    source: SOURCE_NAME,
    source_url: item.link,
    title,
    content,
    published_at: article.published_at || item.published_at || new Date().toISOString(),
    importance: 0.5,
    lang: article.lang || 'en',
    reliability_score: 0.85,
    normalized_data: {
      feed_url: feedUrl,
      rss_guid: item.guid || null,
      feed_source: item.source || null,
      article_word_count: article.word_count,
    },
    raw_data: {
      feed_url: feedUrl,
      feed_item: item,
      article,
    },
    source_event_id: hashSourceEventId(item.link, item.guid),
  };
}

export async function processRSSNews(limit = 20, options = {}) {
  const feedUrls = options.feedUrls?.length ? options.feedUrls : RSS_NEWS_CONFIG.feedUrls;
  const maxItemsPerFeed = options.maxItemsPerFeed || RSS_NEWS_CONFIG.maxItemsPerFeed;

  if (!feedUrls.length) {
    console.log('[RSS News] No feed URLs configured, skipping.');
    return { success: 0, failed: 0, skipped: 0 };
  }

  console.log(`[RSS News] Fetching from ${feedUrls.length} feeds...`);

  const seenLinks = new Set();
  const candidates = [];
  let failed = 0;

  for (const feedUrl of feedUrls) {
    try {
      const items = await fetchFeedItems(feedUrl, maxItemsPerFeed);

      for (const item of items) {
        if (!item.link || seenLinks.has(item.link)) {
          continue;
        }

        seenLinks.add(item.link);
        candidates.push({ feedUrl, item });
      }
    } catch (error) {
      console.error(`[RSS News] Failed to fetch feed ${feedUrl}:`, error.message);
      failed++;
    }
  }

  let success = 0;
  let skipped = 0;

  for (const candidate of candidates.slice(0, limit)) {
    try {
      const newsData = await toItemData(candidate.feedUrl, candidate.item);
      const result = await processNewsArticle(newsData);

      if (result.status === 'success') {
        success++;
      } else if (result.status === 'skipped') {
        skipped++;
      }
    } catch (error) {
      console.error(`[RSS News] Failed to process article ${candidate.item.link}:`, error.message);
      failed++;
    }
  }

  console.log(`[RSS News] Processing complete: ${success} succeeded, ${failed} failed, ${skipped} skipped`);
  return { success, failed, skipped };
}

export default {
  name: SOURCE_NAME,
  fetchFeedItems,
  fetchArticle,
  process: processRSSNews,
};
