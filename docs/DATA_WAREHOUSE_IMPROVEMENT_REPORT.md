# 数据仓库升级收益与测试报告

## 1. 测试环境与口径

- 测试时间：2026-10-23。
- 数据库：本地 PostgreSQL 当前快照。
- 数据规模：28,376 篇新闻、50,263 个原子事件、973 个 Summary、625,560 条原子关系边。
- 性能测试：预热后执行 9 轮热查询，报告 P50、P95 和平均耗时。
- 一致性测试：比较现场聚合与 DWS 预聚合的 Top 50 Summary ID、成员数和关系数。
- 报告文件：`reports/data-warehouse-benchmark.json`、`reports/data-warehouse-benchmark.md`。

本报告只描述当前单机数据快照，不外推为生产 SLA。

## 2. 数仓概念带来的实际变化

### 2.1 从重复现场计算到 DWS 预聚合

升级前查询需要扫描 Summary 成员表和关系成员表，分别分组后再与主题表 Join。升级后直接读取 DWS `relationship_summaries.member_count/edge_count`。

| 指标 | 现场 Join + 聚合 | DWS 预聚合 | 改善 |
| --- | ---: | ---: | ---: |
| P50 | 752.06 ms | 1.39 ms | **541.52x** |
| P95 | 800.55 ms | 2.12 ms | **377.73x** |
| 平均 | 746.63 ms | 1.48 ms | **506.18x** |
| P50 延迟降低 | - | - | **99.82%** |
| P95 延迟降低 | - | - | **99.74%** |
| Top 50 一致率 | - | - | **100%（50/50）** |

这证明 DWS 的价值不是换表名，而是把高频、稳定口径的计算前置并复用。

### 2.2 从数据库自增 ID 到跨系统稳定 ID

升级前历史 `news.stable_id` 覆盖率为 0%，Kafka、Iceberg、Spark 和 Flink 无法使用同一个业务主键关联。

本轮执行分批回填：

- 首批写入：10,000 条。
- 遇到无 URL、无来源原生 ID 的遗留数据后停止并修正策略。
- 第二批写入：18,376 条，共 19 批。
- 最终覆盖：28,376/28,376，**0% → 100%，提升 100 个百分点**。
- 对无外部标识的遗留数据使用显式 `legacy-news-{id}` 输入生成稳定哈希，避免伪造来源 ID。

### 2.3 从隐式处理逻辑到版本化数据

- 新闻版本字段完整率：28,376/28,376，**100%**。
- 新增 19 个稳定标识或版本字段，覆盖新闻、原子事件、Summary 和关系边。
- Query Service 返回数据版本、生成时间、来源 ID 和血缘 ID。

收益是算法升级后可以区分旧数据与新数据，并为回填、对账和回滚提供条件；该提升属于治理能力，不能用查询性能百分比代替。

### 2.4 从同步单体到可灰度批流链路

| 能力 | 升级前 | 当前 |
| --- | --- | --- |
| Parser 路径 | 进程内同步解析 | `inline/shadow/worker` 三态，Worker 结果可消费落库 |
| DWD 权威源 | PostgreSQL | `postgres/iceberg-shadow/iceberg` 三态 |
| 查询权威源 | 旧 Repository | `legacy/shadow/ads` 三态并记录对账 |
| 消息一致性 | 直接处理 | Transactional Outbox + 幂等事件 ID |
| 切换保护 | 无 | 未完成 Runtime 验证时自动阻止 worker/Iceberg 权威切换 |

Shadow 冒烟结果：

- Parser 请求 `worker`，因 Runtime 未验证，实际生效 `shadow`。
- DWD 请求 `iceberg`，实际生效 `iceberg-shadow`。
- Query 生效 `shadow`，旧路径返回 5 条，ADS 返回 0 条，匹配率 0%。
- 系统保留旧结果，不会因为 ADS 尚无数据而切成空结果。

这项提升主要体现在风险控制：从“人工改代码切换”变为“配置切换 + 自动保护 + 影子审计”。

### 2.5 从无回填入口到可恢复向量建设

- 可生成向量的新闻：28,376 条。
- 当前已写向量：0 条，覆盖率 0%。
- Dry Run：100 条、4 个批次、失败 0，验证分页和断点逻辑。
- 支持 `batch-size`、`limit`、`after-id`、Embedding 版本和幂等 Upsert。

当前缺少可用 Embedding Runtime，因此不能报告语义召回准确率或全量耗时；但数据资格覆盖已从 0 条提升到 28,376 条。

## 3. 自动化测试结果

### 3.1 总体结果

| 测试类型 | 旧检查点 | 当前 | 增量 |
| --- | ---: | ---: | ---: |
| Node 测试 | 89 | 108 | +19，**提升 21.35%** |
| Python 测试 | 6 | 9 | +3，**提升 50%** |
| 总测试数 | 95 | 117 | +22，**提升 23.16%** |
| 当前通过率 | - | 117/117 | **100%** |

### 3.2 新增覆盖维度

- Parser 权威模式的合法性和 Runtime 保护。
- Parser Result Consumer 的 Topic 订阅和结果落库。
- 稳定 ID 历史回填的确定性和批处理。
- Embedding 回填的分页、断点、批次和 Upsert。
- Agent Tool 参数白名单、时间范围、审计成功/拒绝。
- 前端搜索参数、请求取消、URL 状态、图谱布局和动态 Tool 参数。
- Spark/Flink 纯逻辑：去重、Watermark 迟到拆分、候选 TTL。
- 数据契约、跨语言稳定 ID 和运行指标。

### 3.3 运行态验证

- SQL 024-027 迁移均成功执行。
- Authority API 返回 Parser、DWD、Query 的 requested/effective/guarded 状态。
- Query Shadow 请求成功返回旧路径数据并生成对账结果。
- 工作台、首页、查询、血缘、图谱和 Agent Tool HTTP 冒烟均成功。
- 仓库基准 Top 50 数据一致率 100%。

## 4. 缺口完成状态

### C01 Parser 权威路径

**已实现**：三态开关、Outbox 请求、Parser Worker、Parser Result Consumer、稳定 ID 找回新闻、结果幂等摄入、Runtime 自动保护。

**尚未正式切换**：没有 Redpanda 连续运行和 Lag/失败率基线，因此当前有效模式仍应保持 `shadow`。

### C02 DWD 权威存储

**已实现**：三态权威配置、Iceberg ODS/DWD DDL、Spark/Flink 写入任务、稳定 ID 100% 覆盖、切换状态 API 和 Runtime 自动保护。

**尚未正式切换**：本机没有 Spark/Flink/Iceberg Runtime，无法完成全量同步、Checkpoint 恢复和 PostgreSQL/Iceberg 连续对账，因此有效模式保持 `iceberg-shadow`。

### C03 实时聚合查询

**已实现**：`legacy/shadow/ads` 路由、ADS Repository、异步影子对账、数量/重合率审计和前端 Query Service。

**尚未正式切换**：当前 ADS 主题表为 0 行，Shadow 匹配率为 0%，不满足切换条件。系统正确保持 legacy 返回。

### 向量回填

**已实现**：稳定 ID 全量回填、Embedding 批请求、缺失扫描、分批断点、覆盖率统计和 Dry Run。

**尚未完成**：缺少可用 Embedding 模型服务，向量覆盖率仍为 0%。

## 5. 面试可使用的量化结论

可以准确表述为：

> 我把项目从在线 Join 聚合改为 DWS 预计算。在 973 个主题、62.56 万条关系边的本地快照上，9 轮热查询中 P50 从 752.06ms 降到 1.39ms，提升 541.52 倍，P95 降低 99.74%，Top 50 结果一致率 100%。同时将 28,376 条历史新闻的跨系统稳定 ID 覆盖率从 0% 提升到 100%，自动化测试从 95 项增加到 117 项并全部通过。

必须附带边界：这是单机 PostgreSQL 热查询，不是生产 SLA；Spark/Flink/Iceberg 仍在 Shadow 阶段；Embedding 尚未全量执行。

