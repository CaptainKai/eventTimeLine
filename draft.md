## 整体概括
全球事件时间引擎（Event Timeline Engine）
## 核心能力一句话：

输入：结构化新闻流（GDELT等）  
输出：标准化事件 + 时间关系 + 可查询结构

## 🧱 总体架构（可直接拆团队）

[数据采集] → [事件解析] → [事件存储] → [查询服务] → [前端展示]

### 任务

-   每15分钟拉取数据
-   去重
-   入库 raw 表

---

### 数据结构（raw）

gdelt_events_raw (  
  global_event_id BIGINT PRIMARY KEY,  
  event_time DATE,  
  actor1 TEXT,  
  actor2 TEXT,  
  event_code TEXT,  
  tone FLOAT,  
  mentions INT,  
  source_url TEXT,  
  raw_json JSONB  
)

事件标准化（规则优先）

event = {  
  "type": map_cameo(event_code),  
  "actors": [actor1, actor2],  
  "time": event_time,  
  "sentiment": tone,  
}

---

### ② 实体标准化（非常关键）

问题：

> USA / United States / US → 必须统一

---

### 解决：

-   建一个 entity mapping 表

entity_mapping (  
  raw_name TEXT,  
  canonical_name TEXT,  
  type TEXT  
)

---

---

### ③ 事件去重（核心难点）

同一事件：

-   多条新闻
-   多次记录

# 四、数据库设计（生产级）

---

## 🧠 推荐架构

主库：

PostgreSQL

搜索：

Elasticsearch

图谱（后期）：

Neo4j

---

---

## 核心表（必须实现）

---

### 1️⃣ entity 表

entity (  
  id SERIAL PRIMARY KEY,  
  name TEXT,  
  type TEXT, -- country/org/person  
  normalized_name TEXT  
)

---

### 2️⃣ event 表（核心）

event (  
  id SERIAL PRIMARY KEY,  
  date DATE,  
  actor1_id INT,  
  actor2_id INT,  
  event_type TEXT,  
  sentiment FLOAT,  
  importance FLOAT  
)

---

### 3️⃣ event_aggregate（性能关键）

👉 预计算

event_daily_stats (  
  date DATE,  
  actor1_id INT,  
  actor2_id INT,  
  event_count INT,  
  avg_sentiment FLOAT,  
  score FLOAT  
)

---

👉 用于：

> 时间线绘制（避免实时聚合）