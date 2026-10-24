# B01-B07 Data Foundation Runbook

## B01 稳定标识

- Node：`lib/data/stable-identifiers.mjs`
- Python：`quality/stable_identifiers.py`
- 跨语言向量：`contracts/fixtures/stable-id-vectors.json`

数组顺序具有业务意义，不做排序；对象键递归排序。修改算法必须升级标识版本，禁止静默改变。

## B02 数据契约

契约位于 `contracts/schemas`。本地校验器支持当前契约使用的 required、type、const、enum、pattern、format、范围和 additionalProperties。进入 Kafka 阶段后可替换为标准 JSON Schema Registry 校验器，但测试向量和兼容规则不变。

## B03 版本字段

先执行：

```powershell
npm.cmd run migrate-data-foundation
```

再启动新版应用。迁移为新增字段和索引，不删除旧列；旧记录标记为 `legacy-v1`，新记录由环境变量写入处理版本。

## B04 Golden Set

```powershell
python quality/evaluate_events.py --golden quality/fixtures/golden-events.jsonl --predictions path/to/predictions.jsonl --output reports/event-quality.json
```

预测文件每行格式为 `{"id":"g1","events":[...]}`。报告包括 Precision、Recall、F1、字段准确率和失败样本。

## B05 本地基础设施

参见 `docs/runbooks/local-data-platform.md`。基础设施完全旁路现有 PostgreSQL。当前机器如果没有 Docker，Compose 只能进行静态审查，不能执行运行态健康检查。

## B06 运行指标

先执行 B03 Migration，再使用 `lib/observability/pipeline-metrics.mjs` 创建、完成和持久化运行指标。统一计数器禁止使用负数；日志统一输出 JSON。

## B07 对账

JSONL 示例：

```powershell
python quality/reconcile.py --left old.jsonl --right new.jsonl --key stable_id --ignore-fields created_at,updated_at --float-tolerance 0.000001 --output reports/reconcile.json
```

PostgreSQL 示例：

```powershell
python quality/reconcile.py --left $env:DATABASE_URL --left-query "SELECT stable_id,title FROM news" --right new.jsonl --key stable_id
```

发现重复、缺失或字段差异时命令返回退出码 1，可直接作为 CI/Shadow Run 门禁。Iceberg 数据先由 Spark 导出 JSONL/CSV 后使用同一工具对账；进入 A03 后再增加原生 Iceberg Adapter。

## 测试

```powershell
npm.cmd run test:data-foundation
npm.cmd run test:python
npm.cmd test
```

