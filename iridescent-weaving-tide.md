# 事件时间线引擎实施计划

## 概述

事件时间线引擎（Event Timeline Engine）是一个完整的数据采集、处理和展示系统，实现了从结构化新闻流到可查询事件时间线的完整流程。系统设计参考了 Crucix 项目的架构模式，但专注于事件时间线的展示和分析。

## 架构设计

### 整体架构

```
Event Timeline Engine/
├── 数据采集层 (15分钟轮询，支持源扩展)
├── 事件解析管道 (标准化、实体映射、去重)
├── 数据库层 (原始事件、标准化事件、实体映射、聚合视图)
├── 查询与API层 (REST + GraphQL用于时间线/筛选查询)
└── 前端展示层 (最新新闻、事件列表、时间轴/日历、筛选)
```

### 技术栈

- 后端: Node.js 22+ (ESM), Express 5.1.0
- 数据库: PostgreSQL 16+ (JSONB存储原始数据，时序优化)
- 搜索: Elasticsearch 8.x (全文搜索和时间线查询)
- 前端: Vanilla JS + HTML (自包含), Chart.js (时间线可视化)
- 爬虫支持: Puppeteer (可选，网页抓取), Cheerio (轻量级解析)

## 实施阶段

### 阶段1: 基础架构 (1-2周)
1. 数据库模式设计 - 创建原始事件、标准化事件、实体映射和聚合视图的SQL文件
2. 核心基础设施 - 服务器、数据库连接、配置系统
3. 数据采集层 - 实现GDELT源连接器
4. 事件解析管道 - 构建基础事件标准化和实体映射

### 阶段2: 核心功能 (2-3周)
1. 后端API - 实现事件、时间线、筛选的REST端点
2. 前端组件 - 构建新闻滚动、事件列表和基础时间线视图
3. 查询优化 - 添加索引和聚合视图以实现快速时间线查询
4. 去重逻辑 - 使用模糊匹配实现事件去重

### 阶段3: 高级功能 (2-3周)

2. 高级时间线视图 - 添加日历视图、交互式筛选
3. Elasticsearch集成 - 设置搜索索引用于全文查询


### 阶段4: 测试与优化 (1周)
1. 综合测试 - 编写集成、单元和源测试
2. 性能测试 - 对大量事件的负载测试--注意减少api的调用，一次数据获取完之后可以存下来
3. 文档 - 完整的API文档、源扩展指南和架构文档
4. 部署 - Docker配置、生产优化

## 核心功能模块

### 数据库设计

**文件**: `sql/001_initial_schema.sql`

包含四个核心表：
- `raw_events`: 存储未处理的原始事件数据（JSONB类型）
- `entity_mapping`: 实体标准化映射表（国家、组织、人物等）
- `normalized_events`: 标准化事件表
- `event_aggregates`: 预计算聚合视图，用于快速时间线查询

### 数据采集与解析

**文件**: `apis/orchestrator.mjs`

- 15分钟轮询机制
- 并行源获取（类似Crucix）
- 事件标准化和实体映射
- 事件去重逻辑

### 后端API

**文件**: `api/v1/events.mjs`

提供以下端点：
- `/api/v1/events`: 获取所有事件（分页）
- `/api/v1/events/:id`: 获取单个事件
- `/api/v1/events/search`: 搜索事件
- `/api/v1/events/normalized`: 获取标准化事件
- `/api/v1/events/timeline`: 获取时间线数据（支持日期范围和粒度）

### 前端组件

**文件**: `dashboard/public/scripts/components/timeline.js`

- 新闻滚动组件
- 事件列表组件
- 时间轴/日历可视化（Chart.js）
- 地点和事件角度筛选

### 数据源扩展接口

**文件**: `apis/sources/README.md`

提供详细的源扩展文档，包括：
- 创建新源的步骤
- 源模块的标准接口
- 示例代码

### 测试脚本

**文件**: `test/` 目录

- 单元测试（解析器、去重逻辑、实体映射）
- 集成测试（完整管道）
- 源测试（各数据源连接器）
- 性能测试（大事件量负载测试）

## 文件结构

```
event-timeline-engine/
├── server.mjs                          # Express服务器(SSE, API端点)
├── config.mjs                          # 配置文件
├── .env.example                        # 环境变量模板
├── package.json                        # 依赖
├── docker-compose.yml                 # Docker部署配置
├── diag.mjs                            # 诊断脚本
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA_SOURCES.md
│   └── API.md
├── sql/
│   ├── 001_initial_schema.sql
│   ├── 002_event_aggregates.sql
│   └── 003_indexes.sql
├── apis/
│   ├── orchestrator.mjs               # 主管道协调器
│   ├── utils/
│   ├── sources/                       # 数据源模块
│   │   ├── gdelt.mjs
│   │   └── custom/                    # 爬虫式源
│   └── parsers/                       # 事件解析器
├── lib/
│   ├── db/                            # 数据库操作
│   ├── cache/                         # Redis缓存(可选)
│   └── queue/                         # 异步解析队列(可选)
├── api/                               # REST API端点
│   └── v1/
│       ├── events.mjs
│       ├── sources.mjs
│       ├── entities.mjs
│       ├── timeline.mjs
│       └── filters.mjs
├── dashboard/                         # 前端
├── test/                              # 测试脚本
└── runs/                              # 运行时数据(gitignored)
```

## 关键特性

1. **数据源扩展性**: 模块化设计，支持未来添加新源，包括爬虫式获取
2. **高效查询**: 预计算聚合视图确保时间线/日历查询的快速响应
3. **事件标准化**: 实体映射和标准化确保数据一致性
4. **实时更新**: SSE (Server-Sent Events) 提供实时数据更新
5. **去重机制**: 模糊匹配算法减少重复事件
6. **搜索与筛选**: 支持地点、事件类型、时间范围等多种筛选方式

## 部署配置

**文件**: `docker-compose.yml`

包含三个服务：
- PostgreSQL 16数据库
- Elasticsearch 8.x搜索服务
- Node.js应用程序

## 启动执行

### 1. 创建项目目录
```bash
cd d:/code
mkdir event-timeline-engine
cd event-timeline-engine
```

### 2. 初始化项目
```bash
npm init -y
npm pkg set type="module"
```

### 3. 安装依赖
```bash
npm install express@5.1.0 pg@8.11.0 chart.js@4.4.0
npm install puppeteer@21.0.0 cheerio@1.0.0 elasticsearch@8.12.0 --save-optional
```


---

**请求批准**: 请审核此实施计划。计划覆盖了所有要求的功能，包括数据采集、事件解析、数据库设计、展示界面和测试脚本。系统架构具有良好的扩展性，支持未来添加新的数据源，包括爬虫式的数据获取方法。
