# A01-A04 数据链路运行手册

## 1. 数据库迁移

```powershell
npm.cmd run migrate-data-foundation
npm.cmd run migrate-event-outbox
```

`EVENT_BUS_ENABLED=false` 时现有链路不写 Outbox。启用后，新闻 Upsert、NewsRaw 和 ParserRequest Outbox 在同一个 PostgreSQL 事务中提交。

## 2. 启动 Redpanda 与 Iceberg

```powershell
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml up -d
```

`redpanda-init` 自动创建 5 个 Topic；`minio-init` 自动创建 `warehouse` Bucket。

## 3. 启动 A01/A02 Worker

```powershell
$env:EVENT_BUS_ENABLED='true'
npm.cmd run outbox:publisher
npm.cmd run parser:worker
```

Outbox Publisher 使用 Kafka 幂等 Producer、`acks=-1`、`FOR UPDATE SKIP LOCKED` 和指数退避。Parser Worker 使用独立 Consumer Group，解析失败写 `parser.result.v1` 的 failed 结果，原始请求可通过 Kafka 重放。

## 4. 创建 Iceberg 表

使用带 Iceberg Package 的 Spark SQL 执行：

```powershell
spark-sql --conf spark.sql.catalog.timeline=org.apache.iceberg.spark.SparkCatalog `
  --conf spark.sql.catalog.timeline.type=rest `
  --conf spark.sql.catalog.timeline.uri=http://localhost:18181 `
  -f lakehouse/ddl/001_ods_dwd.sql
```

## 5. Kafka 到 Iceberg ODS

```powershell
spark-submit jobs/spark/stream_to_iceberg.py `
  --brokers localhost:19092 `
  --topic ods.news.raw.v1 `
  --checkpoint s3a://warehouse/checkpoints/ods-news `
  --table timeline.ods.news_raw
```

实际提交时需提供 Spark Kafka Connector、Iceberg Runtime 和 S3 FileIO Package。

## 6. A04 历史导入

```powershell
python jobs/spark/export_postgres.py --database-url $env:DATABASE_URL --output tmp/news-history.jsonl
python jobs/spark/batch_job.py --mode local --input tmp/news-history.jsonl --output tmp/dwd-news.jsonl
python jobs/spark/batch_job.py --mode spark --input tmp/news-history.jsonl --output timeline.dwd.news_cleaned
```

Local 模式用于 CI 和逻辑验证；Spark 模式用于真实分布式写入。

## 7. 关系批重建

```powershell
python jobs/spark/relationship_rebuild.py --input tmp/proto-events.jsonl --output-dir tmp/rebuild --logic-version summary-v1
```

关系重建按 ISO Week、实体签名和动作签名生成稳定 Summary，内部关系对数受 `--max-pairs-per-summary` 限制，避免超级节点再次产生平方级爆炸。

## 8. 回滚

- 关闭 `EVENT_BUS_ENABLED`：停止产生新 Outbox，不影响现有同步 Parser。
- 停止 Publisher/Parser Worker：Outbox 和 Kafka Offset 保留，可恢复续跑。
- Iceberg 使用独立 Snapshot；失败批次不切换 Serving，不覆盖 PostgreSQL 权威数据。
- A01-A04 当前仍是 Shadow Path，完成 B07 对账前不得切换权威读取。

