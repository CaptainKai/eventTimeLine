import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { fetchArticle, fetchFeedItems } from '../../apis/sources/rss-news.mjs';
import { parseFeedDocument } from '../../apis/utils/rss-parser.mjs';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function createResponse(body, contentType = 'text/plain') {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
    },
  });
}

describe('RSS Parser', () => {
  it('should parse RSS items and normalize fields', async () => {
    const xml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Markets react to surprise rate cut</title>
            <link>/news/markets-rate-cut</link>
            <guid>market-1</guid>
            <pubDate>Fri, 17 Apr 2026 08:15:00 GMT</pubDate>
            <description><![CDATA[<p>Traders reacted sharply to the central bank move.</p>]]></description>
          </item>
        </channel>
      </rss>
    `;

    const items = await parseFeedDocument(xml, 'https://example.com/feed.xml');

    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].title, 'Markets react to surprise rate cut');
    assert.strictEqual(items[0].link, 'https://example.com/news/markets-rate-cut');
    assert.strictEqual(items[0].guid, 'market-1');
    assert.strictEqual(items[0].published_at, '2026-04-17T08:15:00.000Z');
    assert.match(items[0].description, /central bank move/);
  });

  it('should fetch feed items and return newest entries first', async () => {
    global.fetch = async () => createResponse(`
      <rss version="2.0">
        <channel>
          <item>
            <title>Older update</title>
            <link>https://example.com/older</link>
            <pubDate>Fri, 17 Apr 2026 07:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Newer update</title>
            <link>https://example.com/newer</link>
            <pubDate>Fri, 17 Apr 2026 09:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `, 'application/rss+xml');

    const items = await fetchFeedItems('https://example.com/feed.xml', 2);

    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].title, 'Newer update');
    assert.strictEqual(items[1].title, 'Older update');
  });
});

describe('RSS Article Fetch', () => {
  it('should fetch article html and extract readable content', async () => {
    global.fetch = async () => createResponse(`
      <html lang="en">
        <head>
          <meta property="og:title" content="Parliament approves emergency package" />
        </head>
        <body>
          <article>
            <p>Parliament approved an emergency spending package after a day of tense debate.</p>
            <p>The bill directs additional funding to hospitals, ports and food distribution networks.</p>
          </article>
        </body>
      </html>
    `, 'text/html');

    const article = await fetchArticle('https://example.com/story');

    assert.strictEqual(article.title, 'Parliament approves emergency package');
    assert.strictEqual(article.lang, 'en');
    assert.match(article.content, /emergency spending package/);
    assert.match(article.content, /food distribution networks/);
  });
});
