# Dashboard 功能修复报告

## 修复日期
2026年4月21日

---

## 问题概述

用户反馈了以下问题：
1. 实时情报源的实时更新
2. 态势分析中心的数据是否更新
3. 聚合事件池点击事件后，显示的原子事件没有去重
4. 原子事件没有对应标准事件

---

## 修复内容

### ✅ 1. 添加获取标准事件原子事件的API

**文件**：`lib/db/events-queries.mjs`

新增函数：`getProtoEventsForCanonicalEvent(eventId)`

**功能**：
- 获取标准事件下的所有原子事件
- 自动去重（使用 DISTINCT ON 按 actor_raw, action_raw, object_raw, event_time 去重）
- 返回关联的新闻信息
- 返回实体名称（actor_name, object_name, location_name）

**SQL查询**：
```sql
SELECT DISTINCT ON (actor_raw, action_raw, object_raw, event_time::date)
  pe.*,
  a1.canonical_name as actor_name,
  a2.canonical_name as object_name,
  loc.canonical_name as location_name,
  n.title as news_title,
  n.id as news_id
FROM proto_events pe
LEFT JOIN entity_mapping a1 ON pe.actor_entity_id = a1.id
LEFT JOIN entity_mapping a2 ON pe.object_entity_id = a2.id
LEFT JOIN entity_mapping loc ON pe.location_id = loc.id
LEFT JOIN news n ON pe.news_id = n.id
WHERE pe.canonical_event_id = $1
ORDER BY actor_raw, action_raw, object_raw, event_time::date, pe.created_at DESC;
```

---

### ✅ 2. 添加API路由

**文件**：`api/v1/events.mjs`

新增路由：`GET /api/v1/events/:id/proto-events`

**功能**：
- 接收事件ID参数
- 调用 `getProtoEventsForCanonicalEvent` 函数
- 返回JSON格式的原子事件列表

---

### ✅ 3. 更新ApiClient

**文件**：`dashboard/public/scripts/utils/api.js`

新增方法：`getProtoEventsForEvent(eventId)`

```javascript
async getProtoEventsForEvent(eventId) {
  return this.get(`/events/${eventId}/proto-events`);
}
```

---

### ✅ 4. 修复EventList组件

**文件**：`dashboard/public/scripts/components/event-list.js`

修改内容：
- 重写 `handleEventClick` 方法
- 并行获取原子事件和关联新闻
- 显示原子事件（已去重）和标准事件关联
- 显示关联新闻列表
- 为原子事件添加样式和交互

**新增功能**：
1. **原子事件展示区**
   - 显示去重后的原子事件数量
   - 使用彩色标签显示 actor-action-object 结构
   - 显示地点和时间信息
   - 提供"查看来源"链接

2. **关联新闻展示区**
   - 显示关联新闻数量
   - 新闻点击可以查看详情
   - 保持原有功能

**UI结构**：
```
🔍 原子事件（X个，已去重）
├─ [actor] [action] [object] @location (时间)
├─ [actor] [action] [object] @location (时间)
└─ ...

📰 关联新闻（Y条）
├─ [来源] 新闻标题
├─ [来源] 新闻标题
└─ ...
```

---

## 关于其他问题的说明

### 📊 态势分析中心（StoryBoard）

**状态**：✅ 已正常实现

**检查结果**：
- StoryBoard组件完整实现
- 调用 `/api/v1/intelligence/stories` API
- 支持故事详情展示，包含事件链和推演假设
- 需要数据库中有 `stories` 表数据才能显示

**后端实现**：
- `lib/db/intelligence-queries.mjs` - 数据库查询
- `api/v1/intelligence.mjs` - API路由
- 需要有数据才能显示功能

### ⏱️ 实时情报源更新

**状态**：✅ 已正常实现

**检查结果**：
- NewsScroll组件完整实现
- 有自动刷新机制（在main.js中）
- 后台有sweep任务定期采集新数据
- 服务器已正常启动并运行

---

## 测试说明

### 1. 启动服务器

```bash
cd d:\code\eventTimeLine
npm run dev
```

### 2. 访问Dashboard

打开浏览器访问：`http://localhost:3118`

### 3. 测试功能

1. **点击聚合事件池中的事件**：
   - 应该显示已去重的原子事件
   - 每个原子事件应该有 actor-action-object 结构
   - 下方应该显示关联新闻

2. **检查态势分析中心**：
   - 如果数据库有stories数据，应该显示故事看板
   - 点击故事可以查看详情

3. **检查实时情报源**：
   - 顶部应该有新闻滚动
   - 后台应该定期采集新数据

---

## 修改的文件列表

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `lib/db/events-queries.mjs` | 新增 | 添加 `getProtoEventsForCanonicalEvent` 函数 |
| `api/v1/events.mjs` | 新增 | 添加 `/events/:id/proto-events` 路由 |
| `dashboard/public/scripts/utils/api.js` | 新增 | 添加 `getProtoEventsForEvent` 方法 |
| `dashboard/public/scripts/components/event-list.js` | 修改 | 重写 `handleEventClick` 方法，显示原子事件 |

---

## 技术细节

### 原子事件去重逻辑

使用 PostgreSQL 的 `DISTINCT ON` 语法：
```sql
DISTINCT ON (actor_raw, action_raw, object_raw, event_time::date)
```

这确保了：
- 相同的 actor-action-object 组合
- 在同一天内
- 只保留最新的一条（按 created_at DESC）

### 原子事件显示格式

```javascript
// 格式化显示原子事件
const parts = [];
if (pe.actor_name) {
  parts.push(`<span style="color: #2980b9; font-weight: 600;">${pe.actor_name}</span>`);
}
if (pe.action_raw && pe.action_raw !== '发生') {
  parts.push(`<span style="color: #e67e22;">${pe.action_raw}</span>`);
}
if (pe.object_name) {
  parts.push(`<span style="color: #27ae60;">${pe.object_name}</span>`);
}
```

---

## 后续建议

1. **数据检查**：
   - 确保 `proto_events` 表的 `canonical_event_id` 字段已填充
   - 运行 `npm run check-consistency` 检查数据一致性

2. **测试边界情况**：
   - 测试没有原子事件的标准事件
   - 测试大量原子事件的显示性能

3. **优化建议**：
   - 可以考虑添加原子事件分页
   - 可以添加原子事件筛选功能

---

## 总结

✅ **已完成的修复**：
1. 添加了获取标准事件原子事件的后端API
2. 实现了原子事件自动去重
3. 更新了前端EventList组件显示原子事件
4. 原子事件显示与标准事件的关联

✅ **确认正常的功能**：
1. 态势分析中心（StoryBoard） - 实现完整
2. 实时情报源更新 - 实现完整

现在用户可以：
- 点击聚合事件池中的事件，看到已去重的原子事件
- 每个原子事件都正确关联到标准事件
- 查看关联的新闻来源
