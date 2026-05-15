# Event Timeline 数据库表关系说明

## 概述

本系统采用 **6 层情报模型**，数据从原始新闻流向高层推演假设。

## 层级结构

```
L1: 新闻层 (news)
    ↓ 解析
L2: 原子事件层 (proto_events)
    ↓ 聚类合并
L3: 标准事件层 (events)
    ↓ 关系构建
L4: 事件关系层 (event_relationships)
    ↓ 叙事聚合
L5: 叙事层 (stories)
    ↓ 推演
L6: 假设层 (hypotheses)
```

## 核心表关系图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              数据流向                                        │
└─────────────────────────────────────────────────────────────────────────────┘

raw_events ──────────────────────────────────────────────────────────────────┐
    │                                                                         │
    │ raw_event_id                                                            │
    ▼                                                                         │
news ────────────────────────────────────────────────────────────────────────┤
    │                                                                         │
    │ news_id                                                                 │
    ▼                                                                         │
proto_events ────────────────────────────────────────────────────────────────┤
    │                                                                         │
    │ canonical_event_id                                                      │
    ▼                                                                         │
events ───────────────────────────────────────────────────────────────────────┤
    │                                                                         │
    ├──► event_news ◄─────────────────────────────────────────────────────────┤ (关联表)
    │         │                                                               │
    │         └──► news (反向关联)                                            │
    │                                                                         │
    ├──► event_relationships (source_event_id / target_event_id)              │
    │                                                                         │
    │ story_id                                                                │
    ▼                                                                         │
stories ──────────────────────────────────────────────────────────────────────┤
    │                                                                         │
    │ story_id                                                                │
    ▼                                                                         │
hypotheses ───────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                           实体映射 (共享)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

entity_mapping
    ▲
    │ actor_entity_id, object_entity_id, location_id
    │
    └───────┬───────────────┬───────────────┬───────────────┐
            │               │               │               │
        proto_events    events      event_aggregates  normalized_events
```

## 表详细说明

### L1: 新闻层

#### `raw_events` - 原始事件
- 存储：各数据源获取的原始数据
- 关系：`news.raw_event_id → raw_events.id`

#### `news` - 新闻文章
- 存储：新闻标题、内容、来源、重要性等
- 关键字段：
  - `raw_event_id` → 关联原始数据
  - `event_id` → **已废弃**，现在通过 `proto_events` 关联
  - `importance` → 重要性分数 (0-1)
- 关系：
  - `news.id ← proto_events.news_id`
  - `news.id ← event_news.news_id`

#### `llm_parse_results` - LLM 解析结果
- 存储：LLM 解析的原始响应和统计
- 关系：`news_id → news.id`

### L2: 原子事件层

#### `proto_events` - 原子事件
- 存储：从新闻中提取的原子事实 (actor + action + object)
- 关键字段：
  - `news_id` → 关联新闻 (**必须**)
  - `canonical_event_id` → 关联标准事件
  - `actor_raw` / `action_raw` / `object_raw` → 原始提取结果
  - `actor_entity_id` / `object_entity_id` / `location_id` → 归一化实体
- 关系：
  - `news_id → news.id` (**外键**)
  - `canonical_event_id → events.id`
  - `actor_entity_id → entity_mapping.id`

### L3: 标准事件层

#### `events` - 标准事件
- 存储：聚类后的标准事件
- 关键字段：
  - `event_type` → 事件类型
  - `actor1_id` / `actor2_id` → 主要实体
  - `location_id` → 地点
  - `story_id` → 关联叙事
- 关系：
  - `events.id ← proto_events.canonical_event_id`
  - `events.id ← event_news.event_id`
  - `story_id → stories.id`

#### `event_news` - 事件-新闻关联表
- 存储：事件与新闻的多对多关系
- 关键字段：
  - `event_id → events.id`
  - `news_id → news.id`
- **注意**：通过此表可以查询事件关联的所有新闻

#### `event_milestones` - 事件里程碑
- 存储：事件的关键节点
- 关系：`event_id → events.id`

#### `event_attribute_history` - 事件属性历史
- 存储：事件属性的快照历史
- 关系：`event_id → events.id`

### L4: 事件关系层

#### `event_relationships` - 事件关系
- 存储：事件之间的关系 (因果、相关等)
- 关键字段：
  - `source_event_id` → 源事件
  - `target_event_id` → 目标事件
  - `relationship_type` → 关系类型

### L5: 叙事层

#### `stories` - 叙事
- 存储：相关事件的聚合叙事
- 关系：`events.story_id → stories.id`

### L6: 假设层

#### `hypotheses` - 推演假设
- 存储：基于叙事的预测
- 关系：`story_id → stories.id`

### 辅助表

#### `entity_mapping` - 实体映射
- 存储：实体归一化映射 (原始名 → 标准名)
- 被引用：`proto_events`, `events`, `event_aggregates`, `normalized_events`

#### `source_status` - 数据源状态
- 存储：各数据源的抓取状态

#### `event_aggregates` - 事件聚合统计
- 存储：按日期、类型聚合的统计

#### `normalized_events` - 归一化事件
- 存储：早期版本的归一化数据，可能已废弃

## 查询示例

### 查询新闻的所有原子事件
```sql
SELECT pe.*
FROM proto_events pe
WHERE pe.news_id = {news_id};
```

### 查询事件关联的所有新闻
```sql
SELECT n.*
FROM news n
JOIN event_news en ON en.news_id = n.id
WHERE en.event_id = {event_id};
```

### 查询新闻对应的标准事件
```sql
SELECT DISTINCT e.*
FROM events e
JOIN proto_events pe ON pe.canonical_event_id = e.id
WHERE pe.news_id = {news_id};
```

### 查询未解析的新闻
```sql
SELECT n.*
FROM news n
LEFT JOIN proto_events pe ON pe.news_id = n.id
WHERE pe.id IS NULL;
```

### 查询新闻的完整链路 (L1-L6)
```sql
SELECT
    n.id as news_id,
    n.title,
    pe.id as proto_event_id,
    e.id as event_id,
    s.id as story_id,
    h.id as hypothesis_id
FROM news n
LEFT JOIN proto_events pe ON pe.news_id = n.id
LEFT JOIN events e ON e.id = pe.canonical_event_id
LEFT JOIN stories s ON s.id = e.story_id
LEFT JOIN hypotheses h ON h.story_id = s.id
WHERE n.id = {news_id};
```

## 重要说明

1. **news.proto_event_id 字段已废弃**：现在通过 `proto_events.news_id` 反向关联

2. **news.event_id 字段已废弃**：现在通过 `proto_events → canonical_event_id → events` 链路关联

3. **正确的事件查询路径**：
   - 新闻 → 原子事件：`news.id ← proto_events.news_id`
   - 原子事件 → 标准事件：`proto_events.canonical_event_id → events.id`
   - 标准 事件 → 新闻：`events.id ← event_news.event_id ← event_news.news_id → news.id`

4. **event_news 表的作用**：当多条新闻关联同一事件时，此表记录所有关联关系

## 字段使用情况分析 (2026-04-25)

### 预留字段（当前使用率低，保留用于未来功能）

| 表 | 字段 | 使用率 | 用途 |
|---|---|---|---|
| news | tone | 0.6% | 语义基调，未来情感分析 |
| news | event_id | 15.6% | 冗余字段，通过 proto_events 关联 |
| events | estimated_end_time | 0% | 事件预估结束时间 |
| events | action | 0% | 标准化动作标签 |
| events | object_id | 0% | 作用对象实体ID |
| stories | summary | 0% | 叙事摘要 |
| stories | last_event_at | 0% | 叙事最后更新时间 |
| stories | normalized_data | 0% | 叙事归一化数据 |
| hypotheses | expires_at | 0% | 假设过期时间 |

### 废弃字段（设计错误，建议删除）

| 表 | 字段 | 原因 |
|---|---|---|
| news | proto_event_id | 设计错误，news 和 proto_events 是一对多关系，正确的关联是 `proto_events.news_id → news.id` |

### 数据统计 (2026-04-25)

| 表 | 记录数 |
|---|---|
| news | 3,886 |
| proto_events | 2,625 |
| events | 764 |
| event_relationships | 6,524 |
| stories | 12 |
| hypotheses | 27,874 |
| llm_parse_results | 111 |
| entity_mapping | 1,778 |
