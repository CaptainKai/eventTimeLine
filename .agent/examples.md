# 修改示例

## 示例1: 新增数据源

**目标**: 添加一个新的数据源（如 Reuters RSS）

**步骤**:
1. 创建 `apis/sources/reuters.mjs`:
   ```javascript
   import { processNewsArticle } from '../../lib/pipeline/news-pipeline.mjs';
   
   function toItemData(item) {
     return {
       source: 'reuters',
       source_url: item.link,
       title: item.title,
       content: item.description,
       published_at: item.pubDate,
       importance: 0.5,
       lang: 'en',
       reliability_score: 0.9,
       normalized_data: { reuters_id: item.id },
     };
   }
   
   export async function processReuters(limit = 20) {
     const items = await fetchItems(limit);
     for (const item of items) {
       await processNewsArticle(toItemData(item));
     }
   }
   ```
2. 在 `config.mjs` 中添加配置
3. 在 `apis/orchestrator.mjs` 中注册数据源

---

## 示例2: 修改事件类型和动作标签

**目标**: 添加新的事件类型 "cyber" 和新的动作标签 "hack"

**步骤**:
1. 修改 `lib/config/event-taxonomy.mjs`:
   ```javascript
   export const EVENT_TYPES = [..., 'cyber'];
   
   export const ACTION_TAXONOMY = {
     ...,
     CYBER: ['hack', 'breach', 'defend']
   };
   ```
2. LLM parser 和后处理 pipeline 自动使用新配置
3. 无需修改其他文件

---

## 示例3: 修改解析流程顺序

**目标**: 改变解析流程，如先尝试传统解析，失败后再用 LLM

**步骤**:
1. 修改 `lib/pipeline/news-pipeline.mjs` 中的 `processNewsArticle` 函数
2. 调整解析器调用顺序
3. 数据源文件无需修改

---

## 示例4: 增加实体归一化规则

**目标**: 添加 "UK" -> "United Kingdom" 的归一化

**步骤**:
1. 修改 `lib/config/event-taxonomy.mjs`:
   ```javascript
   export const ENTITY_NORMALIZATION_MAP = {
     ...,
     'UK': 'United Kingdom',
     'United Kingdom': 'United Kingdom',
   };
   ```
2. LLM prompt 和后处理自动生效

---

## 示例5: 修复实体误匹配问题

**目标**: 修复类似"外交部"被"对外交谈判"误匹配的问题

**步骤**:
1. 在 `apis/parsers/enhanced-parser.mjs` 中增加精确匹配辅助函数
2. 替换所有简单的 `.includes()` 检查为精确匹配
3. 创建测试用例验证边界情况
4. 运行测试验证修复

---

## 示例6: 调整 LLM 解析触发条件

**目标**: 修改 jin10 数据源的 LLM 解析触发阈值

**步骤**:
1. 修改 `config.mjs`:
   ```javascript
   sourceConfig: {
     jin10: { preferLLMWhenImportanceAbove: 0.6 }, // 从 0.4 改为 0.6
   }
   ```
2. 无需修改代码，配置即时生效

---

## 示例7: 添加新的事件关系类型

**目标**: 新增"相关"关系类型到事件关系分析

**步骤**:
1. 修改 `lib/analysis/event-relationship-analyzer.mjs`
   - 在关系类型枚举中增加新类型
   - 添加新类型的判断逻辑
2. 修改 `lib/db/event-relationships-queries.mjs`
   - 确保支持新关系类型的存储和查询
3. 修改前端 `dashboard/public/scripts/components/graph.js`
   - 增加新关系类型的可视化样式

---

## 示例8: 批量重新解析历史数据

**目标**: 对某一时间段的重要新闻重新用 LLM 解析

**步骤**:
1. 创建或修改 `scripts/reparse-*.mjs` 脚本
2. 设置筛选条件（时间、来源、重要性）
3. 调用 `extractProtoEventsWithLLM(title, content, { newsId, saveResult: true })`
4. 运行脚本

---

## 示例9: 查看数据库表关系

**目标**: 理解 L1-L6 的表关联关系

**参考文档**: `docs/database-schema.md`

**查询路径**:
```
news.id ← proto_events.news_id
proto_events.canonical_event_id → events.id
events.id ← event_news.event_id
events.story_id → stories.id
hypotheses.story_id → stories.id
```

---

## 示例10: 调试解析结果

**目标**: 查看某条新闻的解析结果和 LLM 原始响应

**步骤**:
1. 查询 `llm_parse_results` 表:
   ```sql
   SELECT * FROM llm_parse_results WHERE news_id = [news_id];
   ```
2. 查看 `raw_response` 字段获取 LLM 原始响应
3. 查看 `proto_events` 表获取处理后的原子事件
