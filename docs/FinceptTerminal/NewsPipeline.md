# FinceptTerminal 新闻处理流程总览

## 一、完整流水线总图

```
RSS FEEDS (80+ 源，分 4 级)
    │
    ▼
NewsService::fetch_all_news()
    │  QNetworkAccessManager 并行抓取，5s 超时
    │  RSS XML 解析 (RSS 2.0 + Atom)
    ▼
enrich_article()          ◄── 每篇文章必经
    │  ① 优先级分配 (FLASH/URGENT/BREAKING/NORMAL)
    │  ② 情感分析 (规则加权词表)
    │  ③ 影响度评估
    │  ④ 分类细化 (关键词命中)
    │  ⑤ Ticker 提取
    │  ⑥ 语言检测 (CJK/西里尔/阿拉伯/梵文)
    │  ⑦ 威胁分类
    │  ⑧ 来源可信度标记
    ▼
CacheManager.put() + emit articles_updated
    │
    ├──► DataHub 发布 (按类别/代码分发)
    ├──► SQLite 持久化 (FTS5 全文搜索)
    │
    ▼
NewsNlpService (异步调用 Python)
    ├── extract_entities()     ◄── 实体提取 (国家/组织/人/股票代码)
    ├── cluster_semantic()     ◄── TF-IDF 语义聚类
    ├── geolocate_articles()   ◄── 地理编码
    └── translate_text()       ◄── 翻译
    │
    ▼
NewsCorrelationService
    ├── detect_signals()       ◄── 关联信号检测
    │     velocity_spike / keyword_spike /
    │     triangulation / geo_convergence /
    │     hotspot_escalation / military_surge
    ├── compute_instability()  ◄── 国家不稳定指数 (CII)
    ├── detect_deviations()    ◄── 基线偏差检测 (Z-score)
    └── detect_focal_points() ◄── 焦点地区检测
    │
    ▼
Alerting (监控词高亮 / 偏差通知 / 突发新闻推送)
    │
    ▼
NewsScreen 渲染
    ├── NewsFeedModel (WIRE 模式 / CLUSTERS 模式)
    ├── NewsTickerStrip (滚动突发头条)
    └── NewsCommandBar (搜索/分类/排序/汇总)
```

---

## 二、各环节详解

### 2.1 新闻获取 (Ingestion)

**文件**: `NewsService.cpp:50-172`

- **80+ RSS 源**，分 4 级：
  - **Tier 1** (官方/通讯社)：Reuters World/Business/Markets、AP、SEC、Fed、UN、IMF、ECB、英格兰银行
  - **Tier 2** (主流财经媒体)：Bloomberg、WSJ、MarketWatch、CNBC、Seeking Alpha、BBC、NYT 等
  - **Tier 3** (专业)：CoinDesk、CoinTelegraph、ZeroHedge、Defense News、OilPrice、Kitco 等
  - **Tier 4** (博客/聚合)：Hacker News、Abnormal Returns、Marginal Revolution
- **并行抓取**，5 秒超时
- **渐进加载**：`fetch_all_news_progressive()` 每收到一个 feed 就 emit `articles_partial`，UI 可提前渲染
- **实时推送**：WebSocket 连接 `wss://api.fincept.in/ws/news`，接收突发新闻

---

### 2.2 内容富化 (Enrichment)

**文件**: `NewsService.cpp:651-799`，每篇文章必经此步

| 处理步骤 | 方法 | 输出 |
|---------|------|------|
| **优先级分配** | 关键词匹配 "breaking"/"urgent"/"announce" | FLASH / URGENT / BREAKING / NORMAL |
| **情感分析** | 加权词表：47 正面词 (surge=3, soar=3...)，48 负面词 (crash=3, plunge=3...) | BULLISH / BEARISH / NEUTRAL + net score |
| **影响度评估** | 优先级或 \|net\| >= 6 → HIGH，\|net\| >= 3 → MEDIUM | HIGH / MEDIUM / LOW |
| **分类细化** | 关键词命中覆盖 RSS 默认分类 | GEOPOLITICS / MARKETS / ECONOMIC / EARNINGS / CRYPTO / ENERGY / DEFENSE / TECH / REGULATORY / GENERAL |
| **Ticker 提取** | 正则 `\b[A-Z]{2,5}\b` 过滤常见词 | 股票代码列表 |
| **语言检测** | 字符范围分析 (CJK/西里尔/阿拉伯/梵文) | 语言标识 |
| **威胁分类** | 模式匹配 critical/high/medium | threat_level + threat_category |
| **来源可信度** | 标记官方媒体 (XINHUA/CGTN/RT/TASS) 和需谨慎源 (ZEROHEDGE/INFOWARS) | source_flag |

---

### 2.3 情感分析 (三层)

| 层 | 位置 | 方法 |
|---|------|------|
| **Layer 1** | `enrich_article()` C++ | 加权词表，实时计算，存 `NewsArticle::sentiment` |
| **Layer 2** | `news_nlp.py analyze_sentiment_batch()` | Python 批量，返回置信度 + 正负信号词 |
| **Layer 3** | `NewsService::analyze_article()` 调用 API | 返回完整分析：情感分值/强度/置信度、市场影响预测、关键词、主题、摘要、4 类风险信号 |

---

### 2.4 分类/聚类

**分类** (`NewsService.cpp:721-745`): RSS 默认分类 + 关键词覆盖

**TF-IDF 语义聚类** (`news_nlp.py cluster_semantic()`):
- 同义词归一化 (fed → federal_reserve 等)
- 金融领域停用词过滤
- 构建 TF-IDF 向量，余弦相似度
- 单遍聚类，阈值 0.25

**Jaccard 标题聚类** (`NewsClusterService.cpp`):
- 标题分词 (小写，>2 字符)
- 24 小时时间窗口
- Jaccard 阈值 0.25（同类别 0.20）
- 输出 `NewsCluster`：`lead_article` + `velocity` (rising/stable/falling)

---

### 2.5 存储结构

**SQLite 表**

```
news_articles          主表：id, headline, summary, source, region, category,
                       link, sort_ts, priority, sentiment, impact, tickers (JSON),
                       tier, lang, threat_level, threat_cat, threat_conf,
                       source_flag, fetched_at
                       + FTS5 虚拟表 (headline+summary, porter 词干)

news_monitors          关键词监控：id, label, keywords (JSON), color, enabled

news_baselines         滚动基线：category, hourly_counts (JSON), mean, stddev

news_entity_cache      实体缓存：article_id, entities_json, geo_lat, geo_lon

news_instability       CII 指数：country_code, cii_score, level, signal_data
```

**CacheManager**: 10 分钟 TTL，article 列表 key 为 `news:articles`

---

### 2.6 关联信号检测 (Correlation)

**文件**: `news_correlation.py` (通过 `NewsCorrelationService` 调用)

| 信号类型 | 触发条件 |
|---------|---------|
| `velocity_spike` | 某分类 1 小时报道量较前一时段增长 3x+ |
| `keyword_spike` | 威胁关键词出现 5+ 次 |
| `triangulation` | 同一标题出现在 3+ 来源 |
| `geo_convergence` | 同一地区 5+ 事件（跨多分类） |
| `hotspot_escalation` | 冲突关键词出现 10+ 次 |
| `military_surge` | 军事相关词汇出现 8+ 次 |

**国家不稳定指数 (CII)**：0-100 分，加权多信号 (冲突 25/网络 10/自然灾害 15/市场 15/监管 10...)
四级：CRITICAL(≥75) / HIGH(≥50) / ELEVATED(≥30) / STABLE(<30)

**基线偏差检测**：滚动 7 天每小时基线，Z-score ≥ 2.0 触发警告

**焦点地区检测**：按 1 度网格（约 111km）分组，3+ 事件聚集触发

---

### 2.7 NLP 处理（Python 层）

| 函数 | 能力 | 输入 → 输出 |
|------|------|-----------|
| `extract_entities()` | 字典+正则实体提取 | 文本 → 国家/组织/人/Ticker |
| `cluster_semantic()` | TF-IDF 余弦相似度聚类 | 文章列表 → 语义簇 |
| `analyze_sentiment_batch()` | 批量情感分析 | 文章列表 → 情感+置信度+信号词 |
| `extract_and_geocode()` | 地理解析 | 文本 → 经纬度 |
| `nearby_infrastructure()` | OSM Overpass API 查附近设施 | 坐标 → 机场/军事基地/港口/电厂 |
| `compute_instability()` | CII 计算 | 事件列表 → 国家分值 |
| `detect_focal_points()` | 焦点网格检测 | 事件列表 → 热点网格 |

---

### 2.8 MCP 接口

| Tool | 功能 |
|------|------|
| `get_news` | 获取最新头条，支持分类/时间/情感/关键词过滤 |
| `get_top_news` | 获取 FLASH/URGENT/BREAKING 优先级文章 |
| `search_news` | 全文搜索（标题、摘要、来源、Ticker） |
| `get_news_summary` | 各分类文章数量 + 情感分布 |
| `get_news_sources` | 列出所有活跃新闻源 |
| `add_news_monitor` | 创建关键词监控（标签+关键词+颜色） |
| `get_news_monitors` | 列出已配置监控 |
| `refresh_news` | 强制刷新（绕过缓存） |

---

## 三、新闻 vs NER 的关系

```
原始新闻
  │
  ▼
┌─────────────────────────────────────────┐
│  enrich_article() C++ 层                │
│  (每篇必过，处理后即可入库/推送)            │
│  · 情感分析 · 优先级 · 分类 · Ticker 提取  │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│  NewsNlpService (异步 Python)           │
│  · 实体提取 (国家/组织/人/Ticker)         │
│  · TF-IDF 语义聚类                       │
│  · 地理编码                              │
│  · 翻译                                  │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│  NewsCorrelationService (异步 Python)    │
│  · 关联信号检测                          │
│  · CII 不稳定指数                        │
│  · 基线偏差检测                          │
│  · 焦点地区检测                          │
└──────────────┬──────────────────────────┘
               ▼
        最终展示 + 告警
```

**核心区别**：
- `enrich_article()` 是 **C++ 实时处理**，随抓取同步完成，是所有新闻的**基础层**
- `NewsNlpService` 是 **Python 异步增强**，在基础层之后额外做实体/聚类/地理编码
- `NewsCorrelationService` 是 **跨文章关联分析**，依赖富化后的数据

**NER 只是富化管道中的一个环节**，情感分析、分类、优先级分配、Ticker 提取、语言检测、威胁分类均同步在 C++ 层完成。
