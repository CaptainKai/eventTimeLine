# Event Timeline Engine 数据与 AI 项目说明（V2）

## 1. 项目定位

Event Timeline Engine 是一个面向公开新闻与事件情报的数据智能平台。系统将多源新闻转换为可检索、可关联、可回放、可追溯的事件资产，并进一步提供实时主题洞察、语义检索、记录级血缘、关系图谱和可信 Agent Tool。

V2 不再只是“PostgreSQL + LLM 的新闻分析应用”，而是形成了小规模数据平台原型：

```text
Sources
  -> PostgreSQL OLTP / Outbox
  -> Redpanda Kafka-compatible Topics
  -> Parser Worker
  -> Spark 离线清洗、回填、关系重算
  -> Flink 实时去重、事件时间处理、指标聚合
  -> Iceberg ODS / DWD
  -> PostgreSQL ADS / Semantic Serving
  -> Query Service / Agent Tools / Data & AI Workbench
```

当前 PostgreSQL 仍是权威路径；Kafka、Spark、Flink、Iceberg 属于已编码的小规模开发版和 Shadow Run 架构，尚未完成 C01-C03 权威路径切换。

## 2. 当前可验证规模

统计时间：2026-10-23，本地开发数据库。

| 对象 | 当前数量 | 说明 |
| --- | ---: | --- |
| 新闻 `news` | 28,376 | 多源原始新闻与处理元数据 |
| 原子事件 `proto_events` | 50,263 | 平均每篇新闻约 1.77 个原子事件 |
| 关系主题 `relationship_summaries` | 973 | Summary-First 主题聚合 |
| 原子事件关系边 | 625,560 | 平均每个原子事件约 12.45 条物理关系记录 |
| Agent 审计记录 | 1 | 来自本轮真实 HTTP 冒烟 |
| 语义向量记录 | 0 | 表与检索链路已实现，但尚未执行全量 Embedding 回填 |
| Outbox 待发布记录 | 0 | 当前无积压，不代表已完成 Kafka 生产压测 |

这些数字用于证明系统已有真实业务数据，不代表生产吞吐、SLA 或模型准确率。

## 3. 数据分层与建模

| 层级 | 当前实现 | 粒度与职责 |
| --- | --- | --- |
| ODS | `news`、`raw_events`、`ods.news.raw.v1`、Iceberg ODS DDL | 保留来源、原文、事件时间和摄入时间 |
| DWD | `proto_events`、`dwd.proto-event.v1`、Iceberg DWD DDL | 一篇新闻中的一个原子动作事实 |
| DWS | `relationship_summaries`、members、原子关系边 | 按实体、动作、时间桶和关系形成主题资产 |
| ADS | 来源质量小时表、主题趋势小时表、候选表、Query Service | 面向看板、检索和 Agent 的查询模型 |
| Governance | 版本字段、运行指标、Golden Set、对账、审计 | 质量、血缘、回填和可信控制 |

核心事实粒度是“一篇新闻中拆出的一个原子事件”。维度包括时间、来源、实体、地点、动作、事件类型、解析器版本和逻辑版本。

本轮新增 19 个版本或稳定标识字段，覆盖 `news`、`proto_events`、`relationship_summaries` 和 `atomic_event_relationships`；新增 8 张平台表，覆盖运行指标、Outbox、小时 ADS、实时候选、语义向量、Agent 审计和权威切换审计。

## 4. 批流数据工程

### 4.1 事件总线与解耦

- 定义 5 个 Kafka-compatible Topic：原始新闻、解析请求、解析结果、DWD 原子事件和 DLQ。
- 使用 Transactional Outbox 避免数据库成功但消息发布失败。
- Parser Worker 具备幂等键、重试、错误事件和可注入 Transport。
- Kafka 不可用时可关闭事件总线，保留原 PostgreSQL 主流程。

### 4.2 Spark 离线任务

已实现 5 个 Python 模块和 1 份依赖清单，覆盖：

- PostgreSQL 历史数据导出。
- ODS 到 DWD 批处理。
- Streaming/Batch 写 Iceberg。
- 历史关系候选和关系重建。
- 通用时间、主键和质量处理函数。

Spark 负责大范围回填、离线重算和历史一致性，不承担在线 API 查询。

### 4.3 Flink 实时任务

已实现 3 个 Python 模块和 1 份依赖清单，覆盖：

- Kafka 新闻流读取与事件时间 Watermark。
- 按稳定 ID 去重并保留最新摄入版本。
- 迟到数据识别。
- Iceberg DWD 写入。
- 小时来源质量聚合与 JDBC Serving 写入。
- 实时 Summary 候选及 TTL 逻辑。

Flink 负责持续计算和低延迟增量结果，不直接承担交互式查询。

### 4.4 运行边界

当前环境没有 Docker、PyFlink 和完整 Spark/Iceberg Runtime，因此完成的是代码、确定性逻辑测试、DDL 和运行手册；不能宣称已经完成集群吞吐、Checkpoint 恢复或 Exactly-once 实测。

## 5. 数据质量与可信性

V2 形成了四层可信控制：

1. **契约层**：8 个 JSON Schema，约束主键、版本、时间和置信度。
2. **处理层**：稳定 ID、幂等写入、重试、降级、DLQ 和 Outbox。
3. **质量层**：Golden Set、事件抽取评测、跨存储对账、结构化运行指标。
4. **应用层**：Query 响应统一返回 `data_version`、`generated_at`、`source_ids` 和 `lineage_id`。

Node 与 Python 共用稳定标识测试向量；质量工具可以识别缺失、重复、字段差异、版本差异，并对浮点与时间精度设置容差。

## 6. RAG 与语义检索

旧版本只有 RAG 数据底座；V2 已实现可运行的检索链路：

- 新闻、原子事件和 Summary 的 Embedding 文本模板。
- OpenAI-compatible Embedding API 调用。
- `semantic_embeddings` 存储表。
- PostgreSQL 数组余弦检索；环境支持时可增加 pgvector 列。
- Embedding 服务失败时回退关键词检索。
- Query Service 返回证据 ID、数据版本、生成时间和血缘 ID。

仍需诚实说明：当前向量表记录数为 0，尚未完成全量 Embedding 回填，因此“向量召回质量提升”没有可报告数据，Recall@K、MRR 和重排评测仍是下一阶段工作。

## 7. Data Agent

V2 从“可封装为 Tool”升级为 5 个可执行、可校验、可审计的 Agent Tool：

| Tool | 能力 | 护栏 |
| --- | --- | --- |
| `search_news` | 关键词或语义新闻检索 | 参数白名单、最大 50 条 |
| `get_event_lineage` | 新闻到原子事件血缘 | 强制新闻 ID |
| `query_topic_trend` | 查询主题趋势 | 最大 50 条 |
| `query_graph` | 查询 Summary 内部图谱 | 强制 Summary ID |
| `generate_report_context` | 生成带证据的报告上下文 | 最大 30 条、时间范围限制 |

所有调用记录 Request ID、Tool、参数、状态、耗时、结果数量、证据 ID、版本和错误码。前端调试台根据 Tool Definition 动态生成表单，不允许任意参数透传。

这仍不是自主规划 Agent Runtime；项目重点是把可控 Tool、可信上下文和审计底座先做扎实。

## 8. 查询服务与前端工作台

新增 7 个 Query/Agent/Authority HTTP 路由，提供新闻查询、血缘、主题、图谱、Tool Definition、Tool 执行和权威状态。

“数据与 AI 工作台”包含四个联动视图：

- 智能检索：关键词/语义模式、来源、日期、数量、请求取消和降级提示。
- 实时洞察：主题强度、成员数、关系数、置信度、时间窗口和自动刷新。
- 血缘图谱：新闻、原子事件、处理版本和最多 60 节点/80 边的 SVG 图谱。
- Agent 调试台：动态参数、Request ID、执行结果、证据与原始 JSON。

已打通“主题 → 检索 → 新闻 → 血缘/图谱 → Agent 结果”，并通过 URL 保存关键状态。首页增加升级摘要；新查询链路失败时不影响旧总览。

## 9. 可验证工程结果

| 指标 | 升级前可验证检查点 | 当前 | 变化 |
| --- | ---: | ---: | ---: |
| Node 自动化测试 | 89 | 108 | +19，提升 21.35% |
| Python 自动化测试 | 6 | 9 | +3，提升 50% |
| 数据契约 Schema | 0 | 8 | +8 |
| Kafka Topic 契约 | 0 | 5 | +5 |
| Agent Tool | 0 | 5 | +5 |
| Query/Agent/Authority 新路由 | 0 | 7 | +7 |
| 数据平台新增表 | 0 | 8 | +8 |
| 核心表版本/稳定标识字段 | 0 | 19 | +19 |
| 数据与 AI 专用工作台 | 0 | 1 个页面、4 个 Tab | 完成端到端可视化 |

功能测试最终结果：Node 108/108、Python 9/9。数仓基准中 DWS P50 为 1.39ms，对比现场聚合 752.06ms，提升 541.52 倍且 Top 50 一致率 100%。真实 HTTP 冒烟中，工作台和首页均返回 200；样例查询返回 2 条新闻、1 个原子事件和 20 个图谱节点；Agent Request ID 成功写入并原样返回。

“提升 21.35%”只表示 Node 自动化测试用例数量增长。查询性能提升来自独立的 9 轮仓库基准；当前仍没有足够基线支持宣称流式吞吐、语义召回或模型准确率提升。

## 10. 权威路径与未完成事项

以下三项仍未切换：

- C01：Parser 权威路径仍未从进程内 Parser 切到 Kafka Parser Worker。
- C02：Iceberg 尚未成为 DWD 历史明细权威存储。
- C03：Dashboard 已接入新 Query Service，但尚未通过 Feature Flag 将全部旧查询切到新 ADS Repository。

下一步应先完成 Shadow Run 对账，再进行 Feature Flag 灰度；不能因为前端能展示新结果，就宣称数据权威路径已经迁移完成。

## 11. 核心代码证据

| 能力 | 文件 |
| --- | --- |
| 数据契约 | `contracts/schemas/*.schema.json` |
| Outbox 与 Kafka | `sql/025_event_bus_outbox.sql`、`lib/events/`、`services/outbox-publisher/` |
| Parser Worker | `services/parser-worker/` |
| Spark | `jobs/spark/` |
| Flink | `jobs/flink/` |
| Iceberg DDL | `lakehouse/ddl/001_ods_dwd.sql` |
| 质量评测与对账 | `quality/evaluate_events.py`、`quality/reconcile.py` |
| Semantic Search | `lib/search/embedding-service.mjs`、`lib/db/semantic-search-queries.mjs` |
| Query Service | `lib/query/query-service.mjs`、`api/v1/data-query.mjs` |
| Agent Tools | `lib/agent/`、`lib/db/agent-audit-queries.mjs` |
| 数据与 AI 工作台 | `dashboard/public/data-ai-workbench.html`、`dashboard/public/scripts/components/` |
| 自动化测试 | `test/unit/`、`test/python/` |
