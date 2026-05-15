# 入口点列表

## API 路由

### 事件API
- 文件: `api/v1/events.mjs`
- 触发: HTTP 请求 (Express路由)
- 下游:
  - `lib/db/events-queries.mjs` - 数据库查询
  - `lib/analysis/canonical-merger.mjs` - 事件合并
  - `lib/analysis/event-relationship-analyzer.mjs` - 关系分析

### 新闻API
- 文件: `api/v1/news.mjs`
- 触发: HTTP 请求
- 下游: `lib/db/news-queries.mjs`

### 实体API
- 文件: `api/v1/entities.mjs`
- 触发: HTTP 请求
- 下游: `lib/db/entity-queries.mjs`

### 情报API (L5-L6)
- 文件: `api/v1/intelligence.mjs`
- 触发: HTTP 请求
- 下游: `lib/db/intelligence-queries.mjs`, `lib/analysis/story-manager.mjs`

## 主程序

### 服务器入口
- 文件: `server.mjs`
- 触发: `node server.mjs`
- 下游:
  - Express 初始化
  - API 路由注册 (`api/v1/*.mjs`)
  - 后台定时任务 (`startBackgroundTasks`)

### 编排器
- 文件: `apis/orchestrator.mjs`
- 触发: 手动调用或定时任务
- 下游:
  - `apis/sources/*.mjs` - 数据源处理器
  - `lib/pipeline/aggregate-events.mjs` - 聚合分析

## 数据获取 (Sources)

### Jin10 快讯
- 文件: `apis/sources/jin10.mjs`
- 触发: `processJin10()`
- 下游: `lib/pipeline/news-pipeline.mjs`

### GDELT 事件
- 文件: `apis/sources/gdelt.mjs`
- 触发: `processGDELTEvents()`
- 下游: `lib/pipeline/news-pipeline.mjs`

### NewsMinimalist RSS
- 文件: `apis/sources/newsminimalist.mjs`
- 触发: `processNewsMinimalist()`
- 下游: `lib/pipeline/news-pipeline.mjs`

### 自定义 RSS
- 文件: `apis/sources/rss-news.mjs`
- 触发: `processRSSNews()`
- 下游: `lib/pipeline/news-pipeline.mjs`

## Pipeline 层

### 统一新闻处理管道 (核心入口)
- 文件: `lib/pipeline/news-pipeline.mjs`
- 触发: `processNewsArticle(newsData)`
- 流程: 入库 news → 获取 newsId → 解析 → 入库 L2-L6
- 下游:
  - `lib/db/news-queries.mjs` - 新闻入库
  - `lib/db/raw-queries.mjs` - 原始数据保存
  - `lib/pipeline/parser-selector.mjs` - 解析器选择
  - `lib/pipeline/event-ingestion.mjs` - L2-L6 入库

### 解析器选择
- 文件: `lib/pipeline/parser-selector.mjs`
- 触发: `extractWithSelectedParser(title, content, options)`
- 下游:
  - `apis/parsers/llm-parser.mjs` - LLM 解析器
  - `apis/parsers/enhanced-parser.mjs` - 增强解析器
  - `apis/parsers/traditional-parser.mjs` - 传统解析器
  - `lib/pipeline/post-processing.mjs` - 后处理

### 后处理
- 文件: `lib/pipeline/post-processing.mjs`
- 触发: `processProtoEvents(extractionResult)`
- 功能: 清洗、去重、归一化原子事件

### 事件摄入 (L2-L6)
- 文件: `lib/pipeline/event-ingestion.mjs`
- 触发: `ingestExtractedNews(extractionResult, sourceNews)`
- 下游:
  - `lib/analysis/canonical-merger.mjs` - L2→L3 聚类
  - `lib/analysis/inference-engine.mjs` - L6 假设验证
  - `lib/analysis/event-relationship-analyzer.mjs` - L4 关系分析

## 解析器

### LLM 解析器
- 文件: `apis/parsers/llm-parser.mjs`
- 触发: `extractProtoEventsWithLLM(title, content, { newsId })`
- 功能: 使用 LLM 提取原子事件，结果存入 `llm_parse_results` 表
- 配置: `lib/config/event-taxonomy.mjs` - 事件类型和动作标签

### 增强解析器
- 文件: `apis/parsers/enhanced-parser.mjs`
- 触发: `extractProtoEventsEnhanced(title, content)`
- 下游:
  - `lib/entities/entity-index.mjs` - 实体提取
  - `lib/analysis/event-deduplication.mjs` - 事件去重

## 分析引擎

### 在线聚类 (L2→L3)
- 文件: `lib/analysis/canonical-merger.mjs`
- 触发: `mergeSingleProtoEvent(proto, newsId)`
- 算法: 增量聚类，基于实体重叠+动作匹配+时间衰减

### 关系分析 (L4)
- 文件: `lib/analysis/event-relationship-analyzer.mjs`
- 触发: `analyzeNewEventRelationships(eventId)`
- 功能: 分析事件间因果关系、时序关系等

### 叙事管理 (L5)
- 文件: `lib/analysis/story-manager.mjs`
- 触发: `syncStories()`
- 功能: 聚合相关事件为叙事

### 推演引擎 (L6)
- 文件: `lib/analysis/inference-engine.mjs`
- 触发: `generateHypotheses()`, `verifyHypotheses(proto)`
- 功能: 生成和验证假设

## 配置

### 事件分类体系
- 文件: `lib/config/event-taxonomy.mjs`
- 内容:
  - `EVENT_TYPES` - 事件类型枚举
  - `ACTION_TAXONOMY` - 动作分类体系
  - `ENTITY_NORMALIZATION_MAP` - 实体归一化映射
  - `RAW_ACTION_PATTERNS` - 动作模式匹配

### 应用配置
- 文件: `config.mjs`
- 内容: 数据库连接、数据源开关、解析器配置等

## 脚本

### LLM 重新解析
- 文件: `scripts/reparse-jin10-llm.mjs`
- 功能: 对 jin10 重要新闻重新用 LLM 解析

### 数据库关系检查
- 文件: `debug/check-database-relations.mjs`
- 功能: 检查外键关系完整性

## 前端

### Dashboard
- 文件: `dashboard/public/scripts/index.js`
- 触发: 浏览器加载页面
- 下游:
  - `dashboard/public/scripts/components/*.js` - UI 组件
  - `dashboard/public/scripts/utils/api.js` - API 调用
