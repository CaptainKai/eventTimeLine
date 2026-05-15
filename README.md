# 事件时间线引擎 (Event Timeline Engine)

面向新闻与公开信息的事件情报引擎。系统从多源新闻采集开始，经过解析、实体/动作归一化、原子事件入库，构建以 `proto_events` 为核心的原子关系图，并保留旧版标准事件/叙事/假设层作为历史数据与旧 Dashboard 的只读视图。

## 当前架构

新写入链路已经从旧的“标准事件聚类层”切换为 Summary-First 原子关系图：

```text
新闻源
  ↓
news
  ↓ 解析 + 实体/动作归一化
proto_events
  ↓ batch 内聚类预筛选 + summary 归属
relationship_summaries
  ↓ summary 内异步详细构边
atomic_event_relationships
```

旧版 6 层模型仍然存在，但新写入不再依赖标准事件层：

```text
events, event_news, event_relationships, stories, hypotheses
```

这些 legacy 表主要用于旧 canonical/stories/relationships 页面和接口读取，不作为新原子图写入路径的依赖。

## 功能特性

- **多源新闻采集**：支持 Jin10、GDELT、NewsMinimalist、RSS 等来源，由统一 orchestrator 调度。
- **统一新闻 Pipeline**：所有数据源转成统一新闻结构后进入 `processNewsArticle()`。
- **事件解析**：支持 LLM parser、enhanced parser、traditional parser，并记录 LLM 解析结果。
- **实体/动作归一化**：维护实体映射、动作标准化、待审核 provisional normalizations 和重建任务。
- **原子事件图谱**：新写入以 `proto_events` 为节点，直接构造原子事件间关系。
- **Summary-First 关系层**：先将 proto 归属到 `relationship_summaries`，再异步在 summary 内构建原子边。
- **Batch 预筛选**：按事件时间默认每 `500` 条 proto 做内存聚类，只用于减少 summary 召回次数，不落库、不成为图节点。
- **异步 Worker**：内置 batch assignment worker 和 summary detail worker，避免新闻入库请求被关系计算阻塞。
- **可恢复回填**：支持全量重建、只补未归属 proto、失败 job 重置与 Phase 1 后恢复。
- **Dashboard/API**：提供新闻、旧标准事件图、原子关系、relationship summary、实体归一化审核等接口与页面。

## 核心数据模型

### 新原子关系图

| 表 | 作用 |
| --- | --- |
| `news` | 原始新闻和来源信息 |
| `proto_events` | 从新闻中抽取的原子事件，是新图谱的核心节点 |
| `relationship_summaries` | 关系层节点，描述一组相关 proto 的关系簇 |
| `relationship_summary_members` | summary 与成员 proto 的关联 |
| `relationship_summary_jobs` | summary merge/detail rebuild 后台任务队列 |
| `relationship_summary_edges` | summary 与原子关系边的关联 |
| `atomic_event_relationships` | proto 到 proto 的有向原子关系边 |
| `atomic_batch_assignment_queue` | 实时 proto 的异步 batch 归属队列 |

### Legacy 只读层

| 表 | 当前定位 |
| --- | --- |
| `events` | 旧标准事件层，保留给旧页面/接口读取 |
| `event_news` | 旧标准事件与新闻关联 |
| `event_relationships` | 旧标准事件关系图 |
| `stories` | 旧叙事聚合层 |
| `hypotheses` | 旧推演假设层 |

## Pipeline 流程

### 新新闻写入

```text
1. 数据源抓取新闻
2. `lib/pipeline/news-pipeline.mjs` 入库 `news`
3. parser 解析新闻，得到原子事件
4. `lib/pipeline/event-ingestion.mjs` 保存 `proto_events`
5. 新 proto 写入 `atomic_batch_assignment_queue`
6. `AtomicBatchAssignmentWorker` 按 500 条或 60 秒超时批量处理
7. batch 内临时聚类，cluster 只用于 summary 候选召回
8. proto 归属一个或多个 `relationship_summaries`
9. 多 summary 命中时入队 `summary_merge` job
10. `AtomicSummaryWorker` 在 summary 内构建 `atomic_event_relationships`
```

### 回填/重建阶段

全量重建脚本分阶段执行，避免全库两两比较：

- **Phase 1**：按事件时间扫描 proto，batch 内聚类预筛选并归属 summary。
- **Phase 1.5**：处理 summary merge jobs，合并被同一 proto/cluster 桥接的多个 summary。
- **Phase 2**：对 active v2 summaries 入队 full detail jobs。
- **Phase 3**：如果传入 `--drain-details`，同步消费 detail jobs 并构建原子边。

## 快速开始

### 前置要求

- Node.js `22+`
- PostgreSQL `16+`
- 可选：OpenAI 兼容 LLM API
- 可选：Elasticsearch、Puppeteer、spaCy/NLP 服务

### 安装

```bash
cd eventTimeLine
npm install
```

### 配置

```bash
cp .env.example .env
```

重点配置项：

| 变量 | 说明 |
| --- | --- |
| `PORT` | 服务端口，默认 `3118` |
| `DATABASE_URL` / `PG*` | PostgreSQL 连接配置 |
| `OPENAI_API_KEY` | 存在时启用 LLM parser |
| `DEFAULT_PARSER` | 默认 parser，默认 `enhanced` |
| `BACKGROUND_SWEEP_ENABLED` | 是否启动后台新闻抓取 |
| `RSS_NEWS_ENABLED` / `RSS_NEWS_FEEDS` | RSS 数据源配置 |
| `NORMALIZATION_AUDIT_ENABLED` | 是否启动归一化审核任务 |
| `ATOMIC_BATCH_ASSIGNMENT_WORKER_ENABLED` | 是否启动原子图 batch 归属 worker，默认开启 |
| `ATOMIC_SUMMARY_WORKER_ENABLED` | 是否启动 summary detail worker，默认开启 |
| `ATOMIC_BATCH_ASSIGNMENT_BATCH_SIZE` | 实时 batch 归属批量，默认 `500` |
| `ATOMIC_BATCH_ASSIGNMENT_FLUSH_AFTER_MS` | 未满批时强制处理等待时间，默认 `60000` |
| `ATOMIC_SUMMARY_WORKER_BATCH_SIZE` | summary job 每轮 claim 数，默认 `10` |

### 数据库迁移

基础迁移：

```bash
npm run migrate
```

原子关系图相关迁移：

```bash
npm run migrate-atomic-graph
npm run migrate-atomic-summary-queue
npm run migrate-atomic-summary-merge
npm run migrate-atomic-batch-assignment
```

### 启动服务

```bash
npm start
```

访问：

- Dashboard：http://localhost:3118
- 健康检查：http://localhost:3118/api/health

### 抓取数据

```bash
npm run sweep
```

## 原子图回填与重建

### 推荐全量重建

```bash
npm run rebuild-atomic-graph -- --full --drain-details --batch-size 500
```

### 只补未归属 proto

```bash
npm run backfill-atomic-unassigned -- --batch-size 500 --drain-details
```

### Dry run

```bash
npm run rebuild-atomic-graph -- --full --dry-run --limit 500 --batch-size 500
npm run backfill-atomic-unassigned -- --dry-run --batch-size 500
```

### Phase 1 已完成后的恢复

如果 Phase 1 已完成，但 merge/detail job 失败，不需要重新 `--full`：

```bash
npm run rebuild-atomic-graph -- --resume-after-phase1 --reset-failed-jobs --drain-details --job-batch-size 10
```

### 说明

- `--full` 只清空新原子图表，不清空 legacy `events/stories/hypotheses`。
- `--limit`、`--since`、`--batch-size` 只控制脚本运行范围或批次，不作为业务关系规模硬限制。
- batch cluster 是内存预筛选结构，不落库、不作为图节点。
- 原子关系边仍然只在 `proto_events` 与 `proto_events` 之间生成。

## 常用 npm scripts

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动 API、Dashboard 和后台 worker |
| `npm run dev` | 带 trace warnings 启动服务 |
| `npm run sweep` | 执行一次数据源抓取/聚合 |
| `npm test` | 运行测试 |
| `npm run migrate` | 执行基础迁移脚本 |
| `npm run migrate-atomic-graph` | 创建原子关系图基础表 |
| `npm run migrate-atomic-summary-queue` | 创建 summary job 队列字段和表 |
| `npm run migrate-atomic-summary-merge` | 添加 summary soft merge 字段和索引 |
| `npm run migrate-atomic-batch-assignment` | 创建实时 batch assignment 队列表 |
| `npm run rebuild-atomic-graph` | 全量或范围重建原子关系图 |
| `npm run backfill-atomic-unassigned` | 只回填尚未归属 summary 的 proto |
| `npm run check-consistency` | 检查数据一致性 |
| `npm run fix-consistency` | 修复可自动修复的一致性问题 |
| `npm run reset-parsed` | 重置解析结果 |

## API 概览

### 新闻

- `GET /api/v1/news`：新闻列表
- `GET /api/v1/news/search`：新闻搜索
- `GET /api/v1/news/stats`：新闻统计
- `GET /api/v1/news/with-proto-events`：带 proto 的新闻列表
- `GET /api/v1/news/:id/proto-events`：指定新闻的 proto events

### Legacy 标准事件/情报

- `GET /api/v1/events/graph`：旧标准事件关系图
- `GET /api/v1/events/aggregation`：旧事件聚合统计
- `POST /api/v1/events/:id/update-graph`：更新旧事件图相关数据
- `POST /api/v1/events/rebalance-graph`：重平衡旧事件图
- `GET /api/v1/intelligence/stories`：旧叙事列表
- `GET /api/v1/intelligence/stories/:id`：旧叙事详情
- `GET /api/v1/intelligence/news/:id/lineage`：旧 L1-L6 血统追踪
- `GET /api/v1/intelligence/hypotheses/pending`：待验证假设

### 新原子关系图

- `GET /api/v1/atomic-relationships`：原子事件关系边分页
- `GET /api/v1/relationship-summaries`：关系层 summary 列表
- `GET /api/v1/relationship-summaries/:id/graph`：指定 summary 内部 proto/edge 图

### 管理与 Dashboard

- `GET /api/v1/dashboard/overview`：Dashboard 总览数据
- `GET /api/v1/dashboard/pending-normalizations`：待审核归一化项
- `GET /api/v1/dashboard/normalization-audit-logs`：归一化审核日志
- `POST /api/v1/admin/reset-parsed`：重置解析状态
- `POST /api/v1/admin/reparse-all`：批量重新解析
- `POST /api/v1/admin/reparse/:id`：重新解析指定新闻

## 新增数据源

新增数据源通常只需要实现“抓取 + 转换”为统一新闻格式，然后调用 `processNewsArticle()`：

```javascript
import { processNewsArticle } from '../../lib/pipeline/news-pipeline.mjs';

function toItemData(item) {
  return {
    source: 'my-source',
    source_url: item.link,
    title: item.title,
    content: item.content,
    published_at: item.pubDate,
    importance: 0.5,
    lang: 'en'
  };
}

await processNewsArticle(toItemData(item));
```

参考：

- `apis/sources/jin10.mjs`
- `apis/sources/gdelt.mjs`
- `apis/sources/newsminimalist.mjs`
- `apis/sources/rss-news.mjs`

## 项目结构

```text
eventTimeLine/
├── server.mjs                         # Express 服务、路由挂载、worker 启停
├── config.mjs                         # 应用配置与环境变量读取
├── api/v1/                            # REST API
├── apis/
│   ├── orchestrator.mjs               # 多数据源调度
│   ├── sources/                       # Jin10/GDELT/RSS/NewsMinimalist
│   └── parsers/                       # LLM/enhanced/traditional parsers
├── lib/
│   ├── pipeline/                      # news pipeline、ingestion、workers
│   ├── analysis/                      # 原子关系分析、summary 管理、legacy 分析器
│   ├── db/                            # 数据库访问层
│   ├── config/                        # 事件分类、动作/实体配置
│   └── entities/                      # 内置实体库
├── dashboard/public/                  # 前端 Dashboard
├── scripts/                           # 迁移、回填、重建、审计脚本
├── sql/                               # 数据库 schema/migration SQL
├── docs/                              # 架构与数据库文档
└── test/                              # 单元/集成测试
```

## 关键代码位置

| 功能 | 文件 |
| --- | --- |
| 统一新闻处理入口 | `lib/pipeline/news-pipeline.mjs` |
| 原子事件入库 | `lib/pipeline/event-ingestion.mjs` |
| Batch assignment worker | `lib/pipeline/atomic-batch-assignment-worker.mjs` |
| Summary detail worker | `lib/pipeline/atomic-summary-worker.mjs` |
| Batch 内聚类预筛选 | `lib/analysis/batch-event-clusterer.mjs` |
| 原子关系分析 | `lib/analysis/atomic-relationship-analyzer.mjs` |
| Summary 归属/合并/detail job | `lib/analysis/relationship-summary-manager.mjs` |
| 原子关系 DB 查询 | `lib/db/atomic-relationship-queries.mjs` |
| Summary DB 查询 | `lib/db/relationship-summary-queries.mjs` |
| Batch assignment 队列 DB 查询 | `lib/db/atomic-batch-assignment-queries.mjs` |
| 全量原子图重建 | `scripts/rebuild-atomic-relationship-graph.mjs` |
| 未归属 proto 回填 | `scripts/backfill-unassigned-atomic-graph.mjs` |

## 文档

- `docs/atomic-relationship-graph.md`：原子关系图说明
- `docs/database-schema.md`：数据库表关系说明
- `DEVELOP_DIARY.md`：开发日志与架构演进记录
- `USAGE_GUIDE.md`：使用说明
- `.agent/`：项目内开发提示与代码地图

## 测试

```bash
npm test
node test/unit/relationship-summary-manager.test.mjs
node test/unit/batch-event-clusterer.test.mjs
```

## 技术栈

- **Runtime**：Node.js 22+，ESM
- **Web**：Express 5
- **Database**：PostgreSQL，JSONB，事务和 DB job 队列
- **Frontend**：Vanilla JS Dashboard
- **AI/Parser**：OpenAI 兼容 LLM API + 规则增强解析器
- **Optional**：Elasticsearch、Puppeteer、spaCy/NLP 服务

## License

MIT
