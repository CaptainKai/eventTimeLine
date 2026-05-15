# 修改模式

## 1. API 变更模式
- **影响范围**: API 路由 + 数据库查询 + 前端调用
- **步骤**:
  1. 修改 `api/v1/[feature].mjs` - API 接口
  2. 修改 `lib/db/[feature]-queries.mjs` - 数据库查询
  3. 更新 `dashboard/public/scripts/utils/api.js` - 前端 API 客户端
  4. 更新 `dashboard/public/scripts/components/[component].js` - 前端展示

## 2. 事件提取变更模式
- **影响范围**: 解析器 + 实体识别 + 配置
- **步骤**:
  1. 修改 `lib/config/event-taxonomy.mjs` - 事件类型/动作标签 (共享配置)
  2. 修改 `apis/parsers/llm-parser.mjs` - LLM 解析 prompt
  3. 修改 `apis/parsers/enhanced-parser.mjs` - 增强解析逻辑
  4. 更新 `lib/pipeline/post-processing.mjs` - 后处理逻辑
  5. 添加/更新测试用例到 `test/` 文件夹

## 3. 实体识别变更模式
- **影响范围**: 实体数据库 + 索引系统 + 配置
- **步骤**:
  1. 修改 `lib/entities/entity-database.mjs` - 预定义实体库
  2. 修改 `lib/config/event-taxonomy.mjs` - 实体归一化映射 (如需要)
  3. 可能需要更新 `lib/entities/entity-index.mjs` - 匹配算法
  4. 更新 `lib/db/entity-queries.mjs` - 实体存储逻辑

## 4. 新增数据源模式
- **影响范围**: 数据源 + Pipeline
- **步骤**:
  1. 创建 `apis/sources/[source-name].mjs`
  2. 实现 `toItemData(item)` 函数，转换为统一格式
  3. 调用 `processNewsArticle(newsData)` 处理
  4. 在 `config.mjs` 中添加数据源配置
  5. 在 `apis/orchestrator.mjs` 中注册数据源

## 5. Pipeline 流程变更模式
- **影响范围**: 新闻处理流程
- **步骤**:
  1. 修改 `lib/pipeline/news-pipeline.mjs` - 统一入口
  2. 如需修改解析顺序，只需改此文件
  3. 数据源文件无需修改

## 6. 事件处理变更模式 (L2-L6)
- **影响范围**: 摄入流程 + 合并逻辑
- **步骤**:
  1. 修改 `lib/pipeline/event-ingestion.mjs` - 摄入流程
  2. 更新 `lib/analysis/canonical-merger.mjs` - 合并规则
  3. 更新 `lib/analysis/event-deduplication.mjs` - 去重逻辑
  4. 添加测试到 `test/` 文件夹

## 7. 实体关系分析变更模式 (L4)
- **影响范围**: 关系分析 + 知识图谱
- **步骤**:
  1. 修改 `lib/analysis/event-relationship-analyzer.mjs` - 关系分析逻辑
  2. 更新 `lib/db/event-relationships-queries.mjs` - 关系存储
  3. 更新 `dashboard/public/scripts/components/graph.js` - 关系图展示

## 8. 前端展示变更模式
- **影响范围**: 组件 + API 调用
- **步骤**:
  1. 修改 `dashboard/public/scripts/components/[component].js` - UI 组件
  2. 更新 `dashboard/public/styles/[style].css` - 样式
  3. 可能需要更新 `dashboard/public/scripts/utils/api.js` - API 接口

## 9. 数据库变更模式
- **影响范围**: 数据库查询 + 数据模型
- **步骤**:
  1. 修改 SQL 文件在 `sql/` 文件夹
  2. 更新 `lib/db/[feature]-queries.mjs` - 查询语句
  3. 更新相关 API 文件在 `api/v1/` 文件夹
  4. 可能需要更新前端组件

## 10. LLM 解析配置变更模式
- **影响范围**: LLM parser + 配置
- **步骤**:
  1. 修改 `lib/config/event-taxonomy.mjs` - 事件类型/动作标签
  2. LLM parser 自动使用更新后的配置
  3. 后处理 pipeline 自动使用更新后的配置
  4. 无需多处修改，保持一致性

## 关键设计原则

### Pipeline 集中化
- 数据源只负责**获取数据**和**格式转换**
- 处理流程集中在 `lib/pipeline/news-pipeline.mjs`
- 新增数据源只需实现 `toItemData()` 并调用 `processNewsArticle()`

### 配置共享
- `lib/config/event-taxonomy.mjs` 统一管理事件类型、动作标签、实体归一化
- LLM parser 和后处理 pipeline 使用相同配置
- 修改一处，全局生效

### 6 层情报模型
```
L1: news (新闻层)
    ↓ 解析
L2: proto_events (原子事件层)
    ↓ 聚类
L3: events (标准事件层)
    ↓ 关系构建
L4: event_relationships (事件关系层)
    ↓ 叙事聚合
L5: stories (叙事层)
    ↓ 推演
L6: hypotheses (假设层)
```
