# 数据源扩展接口文档

## 概述

事件时间线引擎支持灵活的数据源扩展机制。本文档说明如何创建和集成新的数据源，包括爬虫式数据获取方法。

## 目录

- [数据源架构](#数据源架构)
- [创建新数据源](#创建新数据源)
- [爬虫源实现](#爬虫源实现)
- [数据接口规范](#数据接口规范)
- [配置和注册](#配置和注册)
- [测试数据源](#测试数据源)

---

## 数据源架构

### 整体架构图

```
数据源层
├── 标准API源 (如 GDELT)
│   ├── 数据获取模块
│   ├── 数据解析模块
│   └── 数据标准化模块
└── 爬虫源 (自定义)
    ├── 爬虫基础类
    ├── 数据提取器
    └── 数据标准化模块

数据管道层
├── 实体标准化
├── 事件去重
└── 数据存储
```

### 源模块结构

每个数据源模块应包含以下部分：

```javascript
// 源模块结构
{
  name: 'source-name',        // 源名称
  fetch(),                     // 获取数据
  parse(),                     // 解析原始数据
  normalize(),                 // 标准化数据
  process()                    // 完整处理流程
}
```

---

## 创建新数据源

### 步骤1：创建源模块文件

在 `apis/sources/` 目录下创建新的源模块文件：

```javascript
// apis/sources/my-custom-source.mjs

/**
 * 自定义数据源示例
 */

import { safeFetch } from '../utils/fetch.mjs';
import { saveRawEvent } from '../../lib/db/raw-queries.mjs';
import { saveNormalizedEvent } from '../../lib/db/normalized-queries.mjs';

// 源配置
const SOURCE_CONFIG = {
  name: 'my-custom-source',
  baseUrl: 'https://api.example.com',
  endpoint: '/events',
  enabled: true,
};

/**
 * 获取数据
 */
export async function fetchData(options = {}) {
  try {
    const url = new URL(SOURCE_CONFIG.endpoint, SOURCE_CONFIG.baseUrl);

    // 添加查询参数
    Object.entries(options).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });

    const response = await safeFetch(url.toString());
    return response.json();
  } catch (error) {
    console.error('[Custom Source] Fetch error:', error);
    throw error;
  }
}

/**
 * 解析原始数据
 */
export function parseRawData(rawItem) {
  return {
    source: SOURCE_CONFIG.name,
    source_event_id: rawItem.id.toString(),
    event_time: new Date(rawItem.timestamp).toISOString(),
    raw_data: rawItem,
    source_url: rawItem.url,

    // 提取字段供后续标准化使用
    _title: rawItem.title,
    _description: rawItem.description,
    _actor1: rawItem.actor1,
    _actor2: rawItem.actor2,
    _location: rawItem.location,
    _type: rawItem.event_type,
    _tone: rawItem.sentiment,
    _mentions: rawItem.mentions || 1,
  };
}

/**
 * 标准化事件
 */
export async function normalizeEvent(parsedEvent) {
  // 这里可以调用实体标准化逻辑
  // 类似 GDELT 解析器的实现

  return {
    event_type: parsedEvent._type || 'Unknown',
    event_time: parsedEvent.event_time,
    title: parsedEvent._title,
    description: parsedEvent._description,
    location: parsedEvent._location,
    tone: parsedEvent._tone,
    mentions: parsedEvent._mentions,
    importance: calculateImportance(parsedEvent),
    normalized_data: {
      source: SOURCE_CONFIG.name,
      original: parsedEvent.raw_data,
    },
  };
}

/**
 * 计算事件重要性
 */
function calculateImportance(parsedEvent) {
  let importance = 0;

  // 基于提及次数
  if (parsedEvent._mentions) {
    importance += Math.min(parsedEvent._mentions * 0.1, 2);
  }

  // 基于情感强度
  if (parsedEvent._tone !== undefined) {
    importance += Math.abs(parsedEvent._tone) * 0.1;
  }

  return Math.min(importance, 10);
}

/**
 * 完整处理流程
 */
export async function processData(options = {}) {
  console.log(`[${SOURCE_CONFIG.name}] Starting data processing...`);

  try {
    // 获取数据
    const rawData = await fetchData(options);

    if (!Array.isArray(rawData)) {
      throw new Error('Expected array of events');
    }

    let success = 0;
    let failed = 0;

    // 处理每个事件
    for (const rawItem of rawData) {
      try {
        // 解析原始数据
        const parsed = parseRawData(rawItem);

        // 保存原始事件
        const rawEventId = await saveRawEvent(parsed);

        // 标准化事件
        const normalized = await normalizeEvent(parsed);

        // 保存标准化事件
        await saveNormalizedEvent({
          raw_event_id: rawEventId,
          ...normalized,
        });

        success++;
      } catch (error) {
        console.error(`[${SOURCE_CONFIG.name}] Failed to process item:`, error);
        failed++;
      }
    }

    console.log(`[${SOURCE_CONFIG.name}] Processing complete: ${success} succeeded, ${failed} failed`);
    return { success, failed };
  } catch (error) {
    console.error(`[${SOURCE_CONFIG.name}] Processing error:`, error);
    throw error;
  }
}

export default {
  name: SOURCE_CONFIG.name,
  fetch: fetchData,
  parse: parseRawData,
  normalize: normalizeEvent,
  process: processData,
};
```

### 步骤2：创建解析器

如果需要特殊的解析逻辑，创建单独的解析器文件：

```javascript
// apis/parsers/my-custom-parser.mjs

import { getOrCreateEntity } from '../../lib/db/entity-queries.mjs';

export async function parseCustomEvent(rawEvent) {
  // 解析逻辑
  const parsed = {
    event_time: rawEvent.date,
    title: rawEvent.headline,
    description: rawEvent.summary,
  };

  // 标准化实体
  if (rawEvent.country) {
    const entity = await getOrCreateEntity(rawEvent.country, 'country');
    parsed.actor1_id = entity.id;
  }

  return parsed;
}
```

### 步骤3：注册到协调器

在 `apis/orchestrator.mjs` 中注册新源（后面会创建）。

---

## 爬虫源实现

### 爬虫基础类

我们提供了爬虫基础类，简化爬虫源的开发：

```javascript
// apis/sources/custom/crawler-base.mjs

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
      const { fetchText } = await import('../utils/fetch.mjs');
      const cheerio = await import('cheerio');

      const html = await fetchText(url, { headers: this.headers });
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
    const cheerio = require('cheerio');
    return cheerio.load(html);
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
}
```

### 爬虫示例实现

```javascript
// apis/sources/custom/news-crawler.mjs

import { CrawlerBase } from './crawler-base.mjs';
import { saveRawEvent } from '../../../lib/db/raw-queries.mjs';
import { saveNormalizedEvent } from '../../../lib/db/normalized-queries.mjs';

export class NewsCrawler extends CrawlerBase {
  constructor() {
    super({
      name: 'news-crawler',
      url: 'https://example-news-site.com',
      frequency: '30m',
    });
  }

  /**
   * 提取事件
   */
  async extractEvents($) {
    const events = [];

    // 查找新闻条目
    $('.news-item').each((index, element) => {
      const title = $(element).find('.title').text().trim();
      const url = $(element).find('a').attr('href');
      const date = $(element).find('.date').text().trim();
      const summary = $(element).find('.summary').text().trim();
      const location = $(element).find('.location').text().trim();

      if (title && url) {
        events.push({
          title,
          url,
          date: this.parseDate(date),
          summary,
          location,
          source: this.name,
        });
      }
    });

    return events;
  }

  /**
   * 解析日期
   */
  parseDate(dateStr) {
    // 根据网站的日期格式进行解析
    try {
      return new Date(dateStr).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * 处理并保存事件
   */
  async processAndSave(events) {
    let success = 0;
    let failed = 0;

    for (const event of events) {
      try {
        const rawEventId = await saveRawEvent({
          source: this.name,
          source_event_id: event.url,
          event_time: event.date,
          raw_data: event,
          source_url: event.url,
        });

        await saveNormalizedEvent({
          raw_event_id: rawEventId,
          event_type: 'News',
          event_time: event.date,
          title: event.title,
          description: event.summary,
          location: event.location,
          normalized_data: {
            source: this.name,
          },
        });

        success++;
      } catch (error) {
        console.error(`[${this.name}] Failed to save event:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * 完整运行
   */
  async runAndSave() {
    const events = await this.run();
    return this.processAndSave(events);
  }
}

export const crawler = new NewsCrawler();
```

---

## 数据接口规范

### 原始事件格式

所有数据源在保存原始事件时，必须提供以下字段：

```javascript
{
  source: 'source-name',           // 源名称 (必填)
  source_event_id: 'unique-id',    // 源内唯一ID (必填)
  event_time: '2024-01-15T10:30:00Z',  // ISO时间 (必填)
  raw_data: { ... },               // 完整原始数据 (JSONB, 必填)
  source_url: 'https://...',       // 源URL (可选)
}
```

### 标准化事件格式

```javascript
{
  raw_event_id: 123,                 // 关联的原始事件ID (必填)
  event_type: 'Make statement',      // 事件类型 (必填)
  event_time: '2024-01-15T10:30:00Z',  // ISO时间 (必填)
  actor1_id: 456,                    // 参与者1实体ID (可选)
  actor2_id: 789,                    // 参与者2实体ID (可选)
  sentiment: 0.5,                    // 情感值 -10到10 (可选)
  importance: 8.5,                   // 重要性 0到10 (可选)
  location: 'Washington',             // 地点名称 (可选)
  location_id: 101,                   // 地点实体ID (可选)
  event_code: '010',                  // 原始事件代码 (可选)
  tone: 2.3,                          // 情感色调 (可选)
  mentions: 15,                       // 提及次数 (可选)
  title: '事件标题',                  // 标题 (可选但推荐)
  description: '事件描述',            // 描述 (可选但推荐)
  normalized_data: { ... },           // 额外标准化数据 (可选)
}
```

---

## 配置和注册

### 配置文件

在 `config.mjs` 中添加源配置：

```javascript
// config.mjs
sources: {
  gdelt: {
    enabled: true,
    priority: 1,
  },
  'my-custom-source': {
    enabled: true,
    priority: 2,
  },
  'news-crawler': {
    enabled: true,
    priority: 3,
  },
}
```

### 环境变量

在 `.env` 中添加源特定的环境变量：

```
# 自定义源配置
MY_CUSTOM_SOURCE_API_KEY=your-api-key
MY_CUSTOM_SOURCE_BASE_URL=https://api.example.com

# 爬虫配置
NEWS_CRAWLER_URL=https://news.example.com
NEWS_CRAWLER_FREQUENCY=30m
```

---

## 测试数据源

### 单元测试

为新数据源创建测试文件：

```javascript
// test/sources/my-custom-source.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchData, parseRawData } from '../../apis/sources/my-custom-source.mjs';

describe('Custom Source', () => {
  describe('Data Parsing', () => {
    it('should parse raw data correctly', () => {
      const testData = {
        id: 123,
        title: 'Test Event',
        timestamp: '2024-01-15',
      };

      const parsed = parseRawData(testData);

      assert.ok(parsed);
      assert.strictEqual(parsed._title, 'Test Event');
      assert.ok(parsed.event_time);
    });
  });
});
```

### 集成测试

在协调器中添加源并进行端到端测试。

---

## 最佳实践

1. **错误处理**：始终提供适当的错误处理和回退机制
2. **速率限制**：尊重目标网站的 `robots.txt` 和速率限制
3. **缓存策略**：实现数据缓存以避免重复请求
4. **增量更新**：支持增量更新，只获取新数据
5. **去重机制**：在源级别实现基本去重
6. **日志记录**：提供详细的日志记录以便调试
7. **测试覆盖**：为新源编写充分的测试

---

## 示例文件清单

```
apis/
├── sources/
│   ├── my-custom-source.mjs       # 你的自定义源
│   └── custom/
│       ├── crawler-base.mjs       # 爬虫基类
│       └── news-crawler.mjs       # 爬虫示例
└── parsers/
    └── my-custom-parser.mjs       # 自定义解析器

test/
└── sources/
    └── my-custom-source.test.mjs  # 源测试

docs/
└── DATA_SOURCES.md                 # 本文档
```
