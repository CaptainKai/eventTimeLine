function normalizeWhitespace(value) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : '';
}

function stripHtml(value) {
  return normalizeWhitespace(
    String(value || '')
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
      .replace(/<[^>]+>/g, ' ')
  );
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function resolveUrl(baseUrl, value) {
  if (!value) {
    return '';
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function getNodeText($, node, selectors) {
  for (const selector of selectors) {
    const text = normalizeWhitespace(node.find(selector).first().text());
    if (text) {
      return text;
    }
  }

  return '';
}

function getNodeAttr($, node, selectors, attribute) {
  for (const selector of selectors) {
    const value = normalizeWhitespace(node.find(selector).first().attr(attribute));
    if (value) {
      return value;
    }
  }

  return '';
}

function mapRssItem($, item, feedUrl) {
  const node = $(item);
  const rawDescription = node.find('description').first().html() || node.find('content\\:encoded').first().html() || '';
  const title = getNodeText($, node, ['title']);
  const link = resolveUrl(feedUrl, getNodeText($, node, ['link']));
  const guid = getNodeText($, node, ['guid']);
  const publishedAt = parseDate(getNodeText($, node, ['pubDate', 'dc\\:date', 'published']));
  const source = getNodeText($, node, ['source']) || new URL(feedUrl).hostname;

  return {
    title,
    link,
    guid: guid || link,
    published_at: publishedAt,
    description: stripHtml(rawDescription),
    source,
  };
}

function mapAtomEntry($, entry, feedUrl) {
  const node = $(entry);
  const rawSummary = node.find('summary').first().html() || node.find('content').first().html() || '';
  const title = getNodeText($, node, ['title']);
  const href = getNodeAttr($, node, ['link[rel="alternate"]', 'link'], 'href');
  const link = resolveUrl(feedUrl, href);
  const guid = getNodeText($, node, ['id']) || link;
  const publishedAt = parseDate(getNodeText($, node, ['updated', 'published']));
  const source = new URL(feedUrl).hostname;

  return {
    title,
    link,
    guid,
    published_at: publishedAt,
    description: stripHtml(rawSummary),
    source,
  };
}

export async function parseFeedDocument(xml, feedUrl) {
  const cheerio = await import('cheerio');
  const $ = cheerio.load(xml, { xmlMode: true });
  const rssItems = $('channel > item').toArray().map(item => mapRssItem($, item, feedUrl));

  if (rssItems.length > 0) {
    return rssItems.filter(item => item.link || item.guid);
  }

  return $('feed > entry')
    .toArray()
    .map(entry => mapAtomEntry($, entry, feedUrl))
    .filter(item => item.link || item.guid);
}

export function pickNewestFeedItems(items, limit = 20) {
  return [...items]
    .sort((left, right) => {
      const leftTime = left.published_at ? new Date(left.published_at).getTime() : 0;
      const rightTime = right.published_at ? new Date(right.published_at).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, limit);
}
