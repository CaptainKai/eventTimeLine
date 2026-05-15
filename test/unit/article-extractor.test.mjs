import assert from 'node:assert';
import { describe, it } from 'node:test';
import { extractArticleFromHtml } from '../../apis/utils/article-extractor.mjs';

describe('Article Extractor', () => {
  it('should extract title, published time and article body', async () => {
    const html = `
      <html lang="en-US">
        <head>
          <title>Fallback title</title>
          <meta property="og:title" content="Summit reaches fragile ceasefire" />
          <meta property="article:published_time" content="2026-04-17T12:00:00Z" />
          <meta name="description" content="World leaders announced a fragile ceasefire after overnight talks." />
        </head>
        <body>
          <nav>Ignore me</nav>
          <article>
            <h1>Summit reaches fragile ceasefire</h1>
            <p>World leaders announced a fragile ceasefire after overnight talks in Geneva, easing fears of immediate escalation.</p>
            <p>Officials said negotiators will meet again next week to discuss humanitarian corridors and prisoner exchanges.</p>
          </article>
          <script>window.ignore = true;</script>
        </body>
      </html>
    `;

    const article = await extractArticleFromHtml(html, 'https://example.com/story');

    assert.strictEqual(article.title, 'Summit reaches fragile ceasefire');
    assert.strictEqual(article.published_at, '2026-04-17T12:00:00.000Z');
    assert.strictEqual(article.lang, 'en');
    assert.match(article.content, /fragile ceasefire/);
    assert.match(article.content, /humanitarian corridors/);
    assert.ok(!article.content.includes('Ignore me'));
    assert.ok(article.word_count > 10);
  });

  it('should fall back to meta description when article body is missing', async () => {
    const html = `
      <html>
        <head>
          <meta name="description" content="A short market bulletin about new tariff measures." />
        </head>
        <body>
          <div class="shell">No article paragraphs here.</div>
        </body>
      </html>
    `;

    const article = await extractArticleFromHtml(html, 'https://example.com/brief');

    assert.strictEqual(article.description, 'A short market bulletin about new tariff measures.');
    assert.strictEqual(article.content, 'A short market bulletin about new tariff measures.');
  });
});
