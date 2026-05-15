项目地址： D:\code\worldmonitor

worldmonitor 的新闻实体提取和关系构建是一个四层架构，没有使用外部 NER 模型，而是基于静态词典 + 规则匹配 + 语义向量的混合方案。

第一层：实体提取（Entity Extraction）
方式一：实体注册表 + 别名匹配
实体通过静态注册表预定义在 entities.ts 中，每个实体包含 aliases（别名）和 keywords（关键词）：


// entities.ts 示例
{ id: 'IR', type: 'country', name: 'Iran', aliases: ['Iran', 'Islamic Republic of Iran'], keywords: ['tehran'] }
{ id: 'AAPL', type: 'company', name: 'Apple', aliases: ['Apple', 'Apple Inc', 'AAPL'], keywords: ['iphone', 'cupertino'] }
匹配过程在 entity-index.ts:98-143：

别名匹配：对每个别名构建 \b{alias}\b 正则，在标题中搜索，置信度 0.95（长名）或 0.85（短名）
关键词匹配：对关键词做 includes 匹配，置信度 0.7
方式二：Gazetteer（地名词典）提取
这是更关键的部分——用于区分地点实体和行为者实体，在 brief-dedup-embed.mjs:70-117：


标题: "Biden meets Xi in Tokyo"
→ locations: ["tokyo"]
→ actors: ["biden", "xi"]
算法流程：

标题按空格分词，清理标点
贪心最长短语匹配——从左到右，先尝试 2-4 词的多词地点（如 "Red Sea"、"Strait of Hormuz"），再回退到单token
首字母大写的token：在地名词典中 → Location，否则 → Actor

第二层：新闻聚类（Clustering）
这是构建"不同新闻之间关系"的核心。有三套并行的聚类方案：

2a. Jaccard 文本相似度聚类
在 analysis-core.ts:215-342：


"Russia launches missile strike on Kyiv"  ┐
"Russian missiles hit Ukrainian capital"   ├─ 同一个 cluster（Jaccard ≥ 0.5）
"Kyiv under Russian missile attack"       ┘
算法：

去停用词后 token 化标题
构建倒排索引（token → 文档列表），快速找到候选
用 Union-Find 做贪心聚类，Jaccard 阈值 0.5
为 cluster 选择最高信息源的标题作为代表
2b. Embedding + Entity Veto 聚类
这是更精细的版本，在 brief-dedup-embed.mjs：


"Biden meets Xi in Tokyo"  ↔  "Biden meets Putin in Tokyo"
→ 语义向量可能很近（都涉及 Biden + Tokyo）
→ 但 VETO：共享地点 "tokyo"，但行为者不同（Xi vs Putin）
→ **拒绝合并**
关键函数 shouldVeto (line 134-149)：

两标题共享至少一个地点
各自拥有对方没有的行为者
→ 拒绝合并
支持两种聚类模式：

Complete-link：新成员必须和 cluster 内所有成员都达到阈值（保守）
Single-link：通过中间节点可传递合并（更宽松，F1 0.73 vs 0.53）
2c. 信号关联聚类
在 correlation-engine/engine.ts 中，按三种维度聚类信号：

维度	方法	示例
按国家	clusterByCountry	同一国家的所有信号聚合
按实体	clusterByEntity	包含 "oil"、"sanctions"、"tariff" 等关键词的信号
按地理距离	clusterByProximity	网格化 Union-Find 空间聚类
第三层：实体关系图（Entity Graph）
在 entity-graph.json 中定义了结构化的关系图：


{
  "nodes": [
    { "id": "IR", "label": "Iran", "type": "country", "related": ["IL", "YE", "LB"] },
    { "id": "IL", "label": "Israel", "type": "country", "related": ["IR"] }
  ],
  "edges": [
    { "from": "IR", "to": "IL", "type": "adversary", "weight": 0.95 },
    { "from": "IR", "to": "YE", "type": "proxy", "weight": 0.8 },
    { "from": "SA", "to": "OIL", "type": "producer", "weight": 1.0 },
    { "from": "HORMUZ", "to": "OIL", "type": "trade_route", "weight": 0.9 }
  ]
}
关系类型：adversary（对手）、proxy（代理）、producer（生产）、trade_route（贸易航线）、disrupts（破坏）

第四层：故事线（Story Threading）
在去重之后，还会做一次语义主题分组（groupTopicsPostDedup），用更低的阈值（0.45）将已去重的故事按语义分组为连续的叙事块，让所有关于同一事件的故事在版面中连续出现。

整体流程总结

RSS/新闻流
  ↓
① Entity Extraction — 从标题提取实体（别名匹配 + Gazetteer）
  ↓
② Clustering — Jaccard / Embedding 将报道同一事件的新闻聚合
  ↓
③ Entity Veto — 防止"同地点不同行为者"的错误合并
  ↓
④ Entity Graph — 用预定义的关系网为 cluster 注入关联上下文
  ↓
⑤ Correlation — 按国家/实体/地理距离聚类多维信号
  ↓
⑥ Story Threading — 语义主题分组为连续叙事