# 开发日志

## 2026-04-25: Pipeline 重构与 LLM 解析优化

### 主要变更

#### 1. 创建统一新闻处理管道

**新增文件**: `lib/pipeline/news-pipeline.mjs`

将数据获取和解析入库逻辑集中到 pipeline 层：
- `processNewsArticle(newsData)` - 统一处理入口
- 流程：入库 news → 获取 newsId → 解析 → 入库 L2-L6

**好处**：
- 数据源代码大幅简化，只需关注数据获取和格式转换
- 处理流程集中，修改顺序只需改一处
- 新增数据源只需实现 `toItemData()` 函数

#### 2. 创建共享配置文件

**新增文件**: `lib/config/event-taxonomy.mjs`

统一管理事件分类配置：
- `EVENT_TYPES` - 事件类型枚举
- `ACTION_TAXONOMY` - 动作分类体系
- `ENTITY_NORMALIZATION_MAP` - 实体归一化映射
- `getActionTaxonomyText()` / `getEntityNormalizationRulesText()` - 用于 LLM prompt

**好处**：
- LLM parser 和后处理 pipeline 使用相同配置
- 修改一处全局生效

#### 3. 修复 LLM 解析结果存储问题

**问题**：之前 `extractWithSelectedParser` 调用 LLM parser 时没有传 `newsId`，导致 `llm_parse_results` 表没有记录。

**修复**：
1. 修改 `parser-selector.mjs` 接收 `newsId` 参数
2. 修改 `event-ingestion.mjs` 支持传入已有的 `news_id`
3. 调整处理顺序：先入库 news → 获取 newsId → 解析

#### 4. 简化数据源代码

重构以下数据源，只负责获取数据和格式转换：
- `apis/sources/jin10.mjs`
- `apis/sources/gdelt.mjs`
- `apis/sources/newsminimalist.mjs`
- `apis/sources/rss-news.mjs`

每个数据源实现 `toItemData()` 函数，然后调用 `processNewsArticle()`。

#### 5. 新增辅助脚本

- `scripts/backfill-llm-recent.mjs` - 补充 LLM 解析结果
- `debug/check-database-relations.mjs` - 检查数据库关系完整性
- `debug/check-importance-data.mjs` - 检查重要性数据

#### 6. 更新文档

- 更新 `.agent/` 目录下的入口点、模式和示例文档
- 新增 `docs/database-schema.md` - 数据库表关系说明
- 更新 `README.md`

### 数据库状态

- 新闻总数：3836
- 原子事件：2624
- 标准事件：763
- LLM 解析结果：110

### 关键代码位置

| 功能 | 文件 |
|------|------|
| 统一处理入口 | `lib/pipeline/news-pipeline.mjs` |
| 解析器选择 | `lib/pipeline/parser-selector.mjs` |
| 事件分类配置 | `lib/config/event-taxonomy.mjs` |
| LLM 解析器 | `apis/parsers/llm-parser.mjs` |
| 数据库表关系 | `docs/database-schema.md` |

### 后续优化方向

1. 对历史重要新闻批量重新 LLM 解析
2. 优化 LLM prompt 提高提取准确率
3. 增加解析失败的自动重试机制

---

## 历史记录

### 之前的架构

数据获取和解析入库逻辑分散在各个数据源文件中，修改处理顺序需要改动多个文件。

### 重构后

```
数据源 (只负责获取数据)
    ↓ toItemData() 转换格式
Pipeline (统一处理)
    ↓ processNewsArticle()
数据库
```
