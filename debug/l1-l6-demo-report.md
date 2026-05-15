================================================================================
L1-L6 全链路聚类演示报告
Event Timeline Engine — 多层聚类策略演示
日期: 2026-04-26
================================================================================

## 系统摘要
- 输入新闻: 14 条
- 英文新闻: 8 条
- 中文新闻: 6 条
- 原子事件: 14 个
- 标准事件: 10 个（聚类压缩率: 28.6%）
- 关系边: 5 条
- 故事线: 6 条
- 假设: 5 个

## 聚类效果分析

### ✅ 成功聚类: [event-1] "United States sanction China"
  - 聚合 3 篇报道
  - 来源: Reuters, 新华社, Bloomberg
  - 涉及语言: en
  - 原子事件: proto-1, proto-2, proto-3

### ✅ 成功聚类: [event-5] "Russia attack Ukraine"
  - 聚合 2 篇报道
  - 来源: BBC, 央视新闻
  - 涉及语言: en
  - 原子事件: proto-7, proto-8

### ✅ 成功聚类: [event-9] "Israel attack Iran"
  - 聚合 2 篇报道
  - 来源: Al Jazeera, 新华网
  - 涉及语言: en
  - 原子事件: proto-12, proto-13

## Entity Veto 机制效果
Entity Veto 防止了"同地点不同行为者"的错误合并

### 🚫 被 Veto 阻止的合并
  - [event-1] United States sanction at Washington
  - [event-4] Federal Reserve cut_rate at Washington
  - 原因: shared_location_different_actor

## 故事线总结

### 📖 story-1: 贸易冲突 / Trade Conflict
  - 事件数: 5
  - 升级等级: 10/10
  - [event-1] United States sanction China
  - [event-2] European Union investigate China
  - [event-3] S&P 500 price_decrease 
  - [event-5] Russia attack Ukraine
  - [event-6] European Union sanction Russia

### 📖 story-2: 货币政策 / Monetary Policy
  - 事件数: 1
  - 升级等级: 3/10
  - [event-4] Federal Reserve cut_rate 

### 📖 story-3: 市场波动 / Market Volatility
  - 事件数: 1
  - 升级等级: 3/10
  - [event-7] Crude Oil price_increase 

### 📖 story-4: 军事部署 / Military Deployment
  - 事件数: 1
  - 升级等级: 3/10
  - [event-8] NATO deploy 

### 📖 story-5: 军事冲突 / Military Conflict
  - 事件数: 1
  - 升级等级: 4/10
  - [event-9] Israel attack Iran

### 📖 story-6: 地缘威胁 / Geopolitical Threat
  - 事件数: 1
  - 升级等级: 3/10
  - [event-10] Iran threaten 

## 假设与预测

### 🔮 72% 概率: 其他国家可能加入关税战，全球经济衰退风险上升
  - 时间范围: 30天
  - 状态: pending

### 🔮 68% 概率: 央行可能采取宽松货币政策对冲贸易影响
  - 时间范围: 14天
  - 状态: pending

### 🔮 70% 概率: 如果贸易紧张持续，股市可能继续下跌
  - 时间范围: 30天
  - 状态: pending

### 🔮 65% 概率: 冲突可能升级为更大规模军事行动
  - 时间范围: 7天
  - 状态: pending

### 🔮 78% 概率: 能源价格将因供应中断风险持续上涨
  - 时间范围: 14天
  - 状态: pending

## 聚类算法对比
| 算法 | 来源项目 | 作用 | 阈值 |
|------|---------|------|------|
| Jaccard 初筛 | 两者都有 | 快速排除不相关候选 | ≥0.15 |
| TF-IDF 语义 | FinceptTerminal | 语义相似度计算 | 加权 0.25 |
| Entity Overlap | 原有 | 实体集合重叠度 | 加权 0.25 |
| Entity Veto | worldmonitor | 防止错误合并 | 硬性规则 |
| Action Match | 原有 | 动作分类匹配 | 加权 0.15 |
| Time Decay | 原有 | 时间衰减因子 | 加权 0.10 |
| Union-Find | worldmonitor | 批量贪心聚类 | ≥0.5 |
| Story Thread | worldmonitor | 低阈值叙事分组 | ≥0.30 |

## 关联信号检测
| 信号类型 | 来源 | 说明 |
|---------|------|------|
| velocity_spike | FinceptTerminal | 报道量突增检测 |
| triangulation | FinceptTerminal | 多源交叉验证 |
| keyword_spike | FinceptTerminal | 威胁关键词激增 |

================================================================================
报告生成完毕
================================================================================