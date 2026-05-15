新闻处理完整流程

RSS/新闻源摄入
     ↓
① 关键词分类（快优步）
     ↓
② LLM 分类增强（可选）
     ↓
③ 重要性评分
     ↓
④ 故事追踪 + 生命周期管理
     ↓
⑤ 去重 + 聚类
     ↓
⑥ 重要性排序 + Top N 选择
     ↓
⑦ Insights 生成（World Brief 摘要）
     ↓
⑧ Brief 合成 + per-story Why Matters
     ↓
⑨ 信封组装 + 过滤
     ↓
⑩ 投递（Email / Telegram / Slack / Discord / Webhook）
Stage 0：RSS 摄入
文件： server/worldmonitor/news/v1/list-feed-digest.ts

从多个 RSS/Atom 源并发抓取新闻，按 variant 分类（full、tech、finance、happy、commodity）。

关键处理：

日期严格校验：非法的或未来的 pubDate 直接丢弃，不用 Date.now() 伪造
旧闻过滤：超过 NEWS_MAX_AGE_HOURS（默认 48h）的直接丢弃
描述提取：HTML 剥离 → 实体解码 → 去空格 → 截断 400 字符 → 与标题重复则丢弃
Stage 1：关键词分类
文件： server/worldmonitor/news/v1/_classifier.ts
函数： classifyByKeyword(title, variant?)

用关键词映射表将新闻分为 5 个威胁等级 + 14 个类别：

等级	触发词示例	说明
critical	military strike, ceasefire collapse, nuclear	国际地缘影响事件
high	conflict update, sanctions, terrorist attack	武装冲突升级
medium	military exercises, protest movements	区域政策变化
low	diplomatic meetings, trade discussions	外交接触
info	editorial, analysis, tutorial	评论/教程
排除列表过滤掉名人、体育、生活方式内容。

Stage 2：LLM 分类增强（可选）
文件： list-feed-digest.ts lines 500-546
函数： enrichWithAiCache(items)

查 Redis 缓存 classify:sebuf:v4:{titleHash}（由 LLM 推理的分类结果）
缓存命中时，用 LLM 结果升级关键词分类
Tier cap 限制：LLM 升级最多比关键词分类高 2 级，防止静态页面污染（如 "About Section 508" 不会被升级到 critical）
Stage 3：重要性评分
文件： list-feed-digest.ts lines 152-169
函数： computeImportanceScore(level, source, corroborationCount, publishedAt)


importanceScore = severityScore × 0.55
                + tierScore × 0.20
                + corroborationScore × 0.15
                + recencyScore × 0.10

severityScore: critical=100, high=75, medium=50, low=25, info=0
tierScore: tier1=100, tier2=75, tier3=50, tier4=25
corroborationScore: min(corroborationCount, 5) × 20
recencyScore: max(0, 1 - ageMs/24h) × 100
关键洞察： corroboration（多源证实）是一个独立维度——同一故事被越多不同来源报道，分数越高。

Stage 4：故事追踪 + 生命周期
Redis 数据结构：

Key	类型	说明
story:track:v1:{hash}	Hash	元数据（firstSeen、lastSeen、mentionCount、currentScore、peakScore...）
story:sources:v1:{hash}	Set	报道此故事的所有来源
story:peak:v1:{hash}	SortedSet	峰值分数追踪
故事生命周期阶段：

阶段	条件
BREAKING	首次出现
DEVELOPING	2-5次提及 且 < 2小时
SUSTAINED	6+次提及 或 > 2小时
FADING	currentScore < peakScore × 0.5
Stage 5：去重 + 聚类
Jaccard 路径： scripts/_clustering.mjs
Embedding 路径： scripts/lib/brief-dedup-embed.mjs
融合路径： scripts/lib/brief-dedup.mjs

两套并行（可切换）：

Jaccard（快，粗粒度）：

停用词去除后 token 化标题
倒排索引加速
Union-Find 贪心聚类，阈值 0.5
Embedding + Entity Veto（精确）：

生成标题的语义向量
Entity Veto 防止误合并：同一地点 + 不同行为者 → 拒绝
支持 Complete-link（保守）和 Single-link（可传递）两种模式
Stage 6：重要性排序 + Top N
文件： _clustering.mjs
函数： scoreImportance(cluster), selectTopStories(clusters, maxCount)

聚类内部评分公式：


score = sourceCount×10 + violence×100 + military×80 + unrest×70 + flashpoint×60 + crisis×30
× 0.3 if CEO/earnings/IPO keyword demoted
× 2.0 if violence + flashpoint combo
选择条件：sourceCount >= 2 OR isAlert OR score > 100
每来源最多 3 条，最多选 8 条。

Stage 7：Insights 生成（World Brief 摘要）
文件： scripts/seed-insights.mjs
函数： fetchInsights()

读取 news:digest:v1:full:en
聚类 → 选 Top 8
Corroboration 门槛：只有 sourceCount >= 2 的故事才生成 World Brief
LLM 调用 briefSystemPrompt() + briefUserPrompt() 生成一段 2 句摘要
Stage 8：Brief LLM 合成
文件： scripts/lib/brief-llm.mjs

三个并行的 LLM 任务：

任务	输出	缓存
generateDigestProse()	执行摘要（lead + threads + signals）	4h
generateWhyMatters()	每条新闻的"为什么重要"	24h
generateStoryDescription()	描述性句子（非 why matters，是"发生了什么"）	24h
Digest Prose Prompt 输出结构化 JSON：


{
  "lead": "第一句必须命名具体行为者和事件，不能是空洞的地缘政治表述",
  "threads": [{ "tag": "Energy", "teaser": "具体事件一句话" }],
  "signals": ["前瞻性监控项，≤14词"],
  "rankedStoryHashes": ["LLM重新排序后的故事哈希"]
}
Stage 9：Brief 组装 + 过滤
文件： shared/brief-filter.js
函数： filterTopStories(), assembleStubbedBriefEnvelope()

Source-Topic Cap：每个 (source, category) 对最多 2 条，防止单一来源主导

过滤掉的新闻类型：

severity / headline / url / shape 不合格
超出 cap 限制
institutional_static_page：静态机构页面污染（如 "About Section 508"）
Stage 10：投递
文件： scripts/seed-digest-notifications.mjs
Cron： 每 30 分钟触发

对每个用户：

查 Convex 获取 alert rules
计算 digest 窗口（自上次发送以来的故事）
去重 + 主题分组
LLM 合成
组装 Brief 信封
写入 Redis brief:{userId}:{issueSlot}（TTL 7天）
签名 URL
发送至所有配置渠道（Email / Telegram / Slack / Discord / Webhook）
总结：数据处理方法全景
处理方法	位置	作用
关键词规则	_classifier.ts	快速初分类（5等级×14类别）
LLM 推理	多处	分类升级、摘要生成、Why Matters
Jaccard 文本相似度	analysis-core.ts	聚类去重
Embedding 向量相似度	brief-dedup-embed.mjs	语义去重
Entity Veto	brief-dedup-embed.mjs	防止地点相同但行为者不同的误合并
来源分级	_shared/source-tiers.ts	tier1-4 加权（Reuters > 一般来源）
多源证实计数	Redis Sets	corroborationScore 驱动
生命周期模型	list-feed-digest.ts	BREAKING/DEVELOPING/SUSTAINED/FADING
地理聚类	correlation-engine/engine.ts	按国家/实体/距离聚类信号
Source-Topic Cap	brief-filter.js	防止单一来源主导
Personalization	brief-compose.mjs	按用户敏感度、档案、问候语定制