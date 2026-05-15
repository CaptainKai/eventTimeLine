/**
 * 爬虫基础类
 *
 * 使用示例：
 * class MyCrawler extends CrawlerBase {
 *   constructor() {
 *     super({
 *       name: 'my-crawler',
 *       url: 'https://example.com',
 *       frequency: '15m'
 *     });
 *   }
 * }
 */

export class CrawlerBase {
  constructor(options) {
    this.name = options.name;
    this.url = options.url;
    this.frequency = options.frequency || '60m'; // 默认每小时
    this.userAgent = 'Event Timeline Engine Bot 1.0';
    this.headers = {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    this.browser = null;
    this.page = null;
  }

  /**
   * 初始化浏览器 (Puppeteer)
   */
  async initBrowser() {
    try {
      // 动态导入puppeteer (可选依赖)
      const puppeteer = await import('puppeteer');

      this.browser = await puppeteer.launch({
        headless: process.env.PUPPETEER_HEADLESS !== 'false',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });

      this.page = await this.browser.newPage();
      await this.page.setUserAgent(this.userAgent);
      await this.page.setExtraHTTPHeaders(this.headers);

      console.log(`[${this.name}] Browser initialized`);
      return true;
    } catch (error) {
      console.warn(`[${this.name}] Puppeteer not available, falling back to simple fetch`);
      return false;
    }
  }

  /**
   * 关闭浏览器
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * 加载页面 (使用浏览器或简单fetch)
   */
  async loadPage(url = this.url) {
    if (this.page) {
      try {
        await this.page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        const content = await this.page.content();
        return this.parseHTML(content);
      } catch (error) {
        console.error(`[${this.name}] Page load error:`, error);
        throw error;
      }
    } else {
      // 使用cheerio进行简单解析
      return this.loadSimplePage(url);
    }
  }

  /**
   * 使用cheerio加载页面 (不使用浏览器)
   */
  async loadSimplePage(url) {
    try {
      const { safeFetch } = await import('../utils/fetch.mjs');
      // 动态导入cheerio (可选依赖)
      const cheerio = await import('cheerio');

      const response = await safeFetch(url, { headers: this.headers });
      const html = await response.text();
      return cheerio.load(html);
    } catch (error) {
      console.error(`[${this.name}] Simple page load error:`, error);
      throw error;
    }
  }

  /**
   * 解析HTML (供子类重写)
   */
  parseHTML(html) {
    // 默认使用cheerio解析
    // 注意：这里需要确保cheerio已加载
    throw new Error('parseHTML() should be implemented or cheerio should be available');
  }

  /**
   * 提取事件 (子类必须实现此方法)
   */
  async extractEvents($) {
    throw new Error('extractEvents() must be implemented by subclass');
  }

  /**
   * 运行爬虫
   */
  async run() {
    console.log(`[${this.name}] Starting crawler...`);

    try {
      const hasBrowser = await this.initBrowser();
      const $ = await this.loadPage();
      const events = await this.extractEvents($);

      if (hasBrowser) {
        await this.closeBrowser();
      }

      console.log(`[${this.name}] Extracted ${events.length} events`);
      return events;
    } catch (error) {
      console.error(`[${this.name}] Crawler error:`, error);
      throw error;
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * 数据保存接口 (子类可重写)
   * 这个接口允许爬虫直接保存其结果，无需经过完整管道
   */
  async saveEvent(event) {
    console.log(`[${this.name}] Event received:`, event.title || event);
    // 默认实现仅记录，子类可重写以实际保存
    return true;
  }

  /**
   * 批量保存事件
   */
  async saveEvents(events) {
    const results = [];
    for (const event of events) {
      try {
        const result = await this.saveEvent(event);
        results.push({ success: true, event, result });
      } catch (error) {
        results.push({ success: false, event, error: error.message });
      }
    }
    return results;
  }
}
