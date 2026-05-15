# 事件时间线引擎 - 使用指南

## 📋 概述

本次更新实现了两个核心功能：
1. **解析结果重置功能**：算法修改后可以重置解析结果，**保留原始新闻数据**
2. **事件聚类完善**：优化原子事件到标准事件的关联，提高数据一致性

---

## 🚀 快速开始

### 1. 数据库结构升级（首次使用）

```bash
# 运行数据库结构升级，为 proto_events 表添加 canonical_event_id 字段
npm run migrate-canonical-id
```

### 2. 检查数据一致性

```bash
# 运行一致性检查
npm run check-consistency
```

### 3. 自动修复一致性问题

```bash
# 尝试自动修复数据不一致的问题
npm run fix-consistency
```

---

## 🔧 核心功能详解

### 功能一：解析结果重置

当解析算法修改后，可以重置已有的解析结果，然后重新解析所有新闻。

**使用方式：**

#### 方式一：CLI 命令（推荐）

```bash
npm run reset-parsed
```

执行流程：
1. 显示警告并要求确认
2. 删除以下表数据：
   - `proto_events` - 原子事件
   - `events` - 标准事件
   - `event_news` - 事件-新闻关联
   - `event_attribute_history` - 事件属性历史
   - `event_milestones` - 事件里程碑
   - `event_relationships` - 事件关系
3. **保留表**：
   - `news` - 原始新闻数据 ✅
   - `entity_mapping` - 实体映射 ✅
   - `raw_events` - 原始事件 ✅
4. 重置序列（自动增量字段）
5. 显示重置成功信息

#### 方式二：API 接口

```bash
# 调用管理员 API 重置解析结果
POST /api/v1/admin/reset-parsed
```

重置后需要重新解析新闻：

```bash
# 批量重新解析（分批次处理）
POST /api/v1/admin/reparse-all?page=1&limit=50
```

---

### 功能二：事件聚类完善

优化原子事件与标准事件的关联机制，确保每个原子事件都有明确的标准事件关联。

**技术改进：**

1. **新增字段**：`proto_events.canonical_event_id`
   - 直接关联到标准事件（`events` 表）
   - 支持外键约束和级联删除
   - 显著提高查询效率

2. **优化合并逻辑**：`canonical-merger.mjs`
   - 在关联时直接设置 `canonical_event_id`
   - 确保数据一致性
   - 支持查询优化

---

## 📊 API 接口说明

### 管理员 API

#### 1. 重置解析结果

```
POST /api/v1/admin/reset-parsed
```

**响应示例：**
```json
{
  "success": true,
  "message": "解析结果重置成功。请调用 /api/v1/admin/reparse-all 重新解析所有新闻。",
  "reset_time": "2026-04-21T10:30:00.000Z",
  "instructions": [
    "重置成功后，需要重新解析所有新闻以生成新的事件数据",
    "调用 /api/v1/admin/reparse-all 接口进行批量重新解析",
    "或在前端使用解析功能逐个解析新闻"
  ]
}
```

#### 2. 批量重新解析

```
POST /api/v1/admin/reparse-all
```

**请求参数：**
- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 50）
- `method`: 解析方法（'enhanced' 或 'llm'，默认 'enhanced'）

**响应示例：**
```json
{
  "success": true,
  "message": "重新解析完成 - 成功: 45, 失败: 5",
  "completed": false,
  "results": [...],
  "statistics": {
    "successCount": 45,
    "failCount": 5,
    "totalNewsCount": 50,
    "totalProtoEvents": 120,
    "totalEvents": 35
  },
  "nextPage": 2,
  "instructions": "继续解析下一页：POST /api/v1/admin/reparse-all?page=2&limit=50"
}
```

#### 3. 重新解析单个新闻

```
POST /api/v1/admin/reparse/:id
```

#### 4. 检查解析状态

```
GET /api/v1/admin/parse-status
```

---

## 💡 常见使用场景

### 场景一：修改解析算法后

```bash
# 1. 重置解析结果
npm run reset-parsed

# 2. 重新启动服务器
npm run dev

# 3. 调用重新解析 API（在另一个终端）
curl -X POST http://localhost:3118/api/v1/admin/reparse-all
```

### 场景二：定期数据维护

```bash
# 1. 检查数据一致性
npm run check-consistency

# 2. 如果发现问题，尝试修复
npm run fix-consistency
```

### 场景三：快速测试修改

```bash
# 1. 重置解析结果
npm run reset-parsed

# 2. 使用增强解析器重新处理少量新闻
# 通过 API 或者在前端手动选择新闻进行解析
```

---

## 🛡️ 数据安全说明

### 保护机制

1. **原始新闻永不删除**
   - `news` 表数据始终保留
   - 即使重置所有解析结果，原始新闻仍然完整

2. **确认机制**
   - CLI 命令需要输入 "YES" 确认
   - 避免误操作

3. **回滚能力**
   - 如果需要，可以重新解析恢复事件数据

4. **备份建议**
   - 定期备份数据库
   - 特别是在重大更改之前

---

## 📝 完整工作流程示例

### 开发流程

```
1. 修改解析算法代码
   ↓
2. 运行测试
   ↓
3. 重置解析结果
   npm run reset-parsed
   ↓
4. 启动开发服务器
   npm run dev
   ↓
5. 批量重新解析
   POST /api/v1/admin/reparse-all
   ↓
6. 检查结果
   前端查看事件和新闻
   ↓
7. 验证一致性
   npm run check-consistency
```

### 生产环境升级流程

```
1. 备份数据库
   ↓
2. 升级数据库结构
   npm run migrate-canonical-id
   ↓
3. 检查一致性
   npm run check-consistency
   ↓
4. 重启服务
   ↓
5. 验证功能正常
```

---

## 🔍 调试和故障排除

### 问题：重置后没有事件数据

**解决方案：**
```bash
# 调用重新解析 API
curl -X POST http://localhost:3118/api/v1/admin/reparse-all
```

### 问题：原子事件没有关联到标准事件

**解决方案：**
```bash
# 1. 检查一致性
npm run check-consistency

# 2. 尝试自动修复
npm run fix-consistency

# 3. 如果问题仍然存在，手动重新解析相关新闻
```

### 问题：数据库升级失败

**解决方案：**
```bash
# 直接运行 SQL 脚本
psql -d timeline -f sql/add-canonical-event-id.sql
```

---

## 📚 相关文件

- `server.mjs` - 服务器主程序，包含路由配置
- `api/v1/admin.mjs` - 管理员 API 接口
- `scripts/reset-parsed-results.mjs` - 解析结果重置脚本
- `scripts/check-consistency.mjs` - 数据一致性检查脚本
- `scripts/migrate-add-canonical-id.mjs` - 数据库结构升级脚本
- `sql/reset-parsed-results.sql` - 重置解析结果的 SQL
- `sql/add-canonical-event-id.sql` - 数据库结构升级的 SQL

---

## 🆘 获取帮助

如有问题，请查看：
1. 检查服务器日志
2. 运行一致性检查脚本
3. 参考相关文档
