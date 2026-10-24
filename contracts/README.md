# Data Contracts

消息契约采用 JSON Schema Draft 2020-12。所有消息必须包含：

- `schema_version`：消息结构版本。
- `event_id`：跨 PostgreSQL、Kafka、Iceberg、Spark、Flink 稳定的 SHA-256 标识。
- `event_time`：业务事件时间。
- `ingested_at`：进入平台的 UTC 时间。
- `pipeline_run_id`：本次处理运行标识。

兼容原则：同一主版本只允许新增非必填字段或扩展 metadata；删除字段、修改类型或改变语义必须升级 Topic/Schema 主版本。

