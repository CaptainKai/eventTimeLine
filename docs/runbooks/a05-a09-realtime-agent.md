# A05-A09 实时、检索与 Agent 运行手册

## 数据库

```powershell
npm.cmd run migrate-realtime-serving
```

迁移创建实时 ADS、Summary Candidate、Embedding 和 Agent Audit 表。若 PostgreSQL 安装了 pgvector，会自动创建 `vector` 扩展及 1536 维向量列；否则保留数组存储并自动使用关键词检索降级。

## A05 Flink DWD

```powershell
python jobs/flink/news_dwd_job.py --brokers localhost:19092 --checkpoint s3://warehouse/checkpoints/flink-news
```

任务使用业务主键、5 分钟 Watermark、30 秒 Checkpoint 和 Iceberg Sink。严重迟到数据的生产部署应增加 side output/DLQ Connector。

## A06 实时指标

```powershell
python jobs/flink/metrics_summary_job.py --brokers localhost:19092 --jdbc-url $env:DATABASE_URL --checkpoint s3://warehouse/checkpoints/flink-metrics
```

完整关系重建继续由 Spark 负责，Flink 只计算窗口指标和有 TTL 的轻量候选。

## A07 Embedding

`lib/search/embedding-service.mjs` 使用 OpenAI-compatible `/embeddings` 接口。Embedding 必须记录模型和版本，禁止不同维度直接覆盖。未配置 Embedding 服务时 Query Service 使用 PostgreSQL 全文检索。

## A08 Query Service

- `GET /api/v1/query/news?q=...`
- `GET /api/v1/query/news/:id/lineage`
- `GET /api/v1/query/topics`
- `GET /api/v1/query/graph/:id`

所有响应包含 `data_version`、`generated_at`、`source_ids` 和 `lineage_id`。

## A09 Agent Tools

- `GET /api/v1/agent/tools`
- `POST /api/v1/agent/tools/search_news`
- `POST /api/v1/agent/tools/get_event_lineage`
- `POST /api/v1/agent/tools/query_topic_trend`
- `POST /api/v1/agent/tools/query_graph`
- `POST /api/v1/agent/tools/generate_report_context`

Tool 使用字段白名单、最大行数、最大 366 天范围和统一审计；没有任意 SQL Tool，不允许 DDL/DML。

