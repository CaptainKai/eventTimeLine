const ARTICLE_SELECTORS = [
  'article',
  '[itemprop="articleBody"]',
  'main article',
  'main',
  '.article-body',
  '.entry-content',
  '.post-content',
  '.story-body',
  '.story-content',
  '.article-content',
  '.news-article-body',
  '#main-content',
];

function normalizeWhitespace(value) {
  return typeof value === 'string'
    ? value.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    : '';
}

function normalizeParagraphs(values) {
  const paragraphs = values
    .map(value => normalizeWhitespace(value))
    .filter(value => value.length >= 40);

  return [...new Set(paragraphs)].join('\n\n').trim();
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function clipText(value, maxLength = 320) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function textFromElement($, element) {
  if (!element || element.length === 0) {
    return '';
  }

  const paragraphs = element
    .find('p')
    .toArray()
    .map(node => $(node).text());

  if (paragraphs.length > 0) {
    return normalizeParagraphs(paragraphs);
  }

  return normalizeWhitespace(element.text());
}

function pickBestArticleBody($) {
  for (const selector of ARTICLE_SELECTORS) {
    const element = $(selector).first();
    const content = textFromElement($, element);

    if (content.length >= 200) {
      return content;
    }
  }

  const paragraphContent = normalizeParagraphs(
    $('p')
      .toArray()
      .map(node => $(node).text())
  );

  if (paragraphContent.length >= 120) {
    return paragraphContent;
  }

  const bodyText = normalizeWhitespace($('body').text());
  return bodyText.length >= 160 ? bodyText : '';
}

function pickFirstMeta($, selectors, attribute = 'content') {
  for (const selector of selectors) {
    const value = normalizeWhitespace($(selector).first().attr(attribute) || $(selector).first().text());
    if (value) {
      return value;
    }
  }

  return '';
}

export async function extractArticleFromHtml(html, sourceUrl = '') {
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  $('script, style, noscript, template, svg, iframe, form, nav, footer, aside').remove();

  const title = pickFirstMeta($, [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    'article h1',
    'main h1',
    'h1',
    'title',
  ]);

  const publishedAt = parseDate(pickFirstMeta($, [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publish-date"]',
    'meta[name="date"]',
    'time[datetime]',
  ], 'content')) || parseDate(pickFirstMeta($, ['time[datetime]'], 'datetime'));

  const description = pickFirstMeta($, [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]);

  const content = pickBestArticleBody($);
  const lang = normalizeWhitespace($('html').attr('lang') || '').split('-')[0] || null;

  return {
    source_url: sourceUrl,
    title: title || description || sourceUrl,
    description: description || clipText(content, 280),
    content: content || description || title || '',
    published_at: publishedAt,
    lang,
    word_count: content ? content.split(/\s+/).filter(Boolean).length : 0,
  };
}
