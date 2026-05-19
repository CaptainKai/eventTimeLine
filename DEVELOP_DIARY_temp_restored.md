# 事件时间线引�? - �€发日�? (Develop Diary)

## 2026-05-14 - 原子关系�? Summary-First 批�?理回�?��阶�?化执行修�?

### 背景与目�?
�?��继续重构原子关系图的新写入与回填链路：不再�€�过标准事件层聚类后建立关系，�€�是�? `proto_events` 先归属到 `relationship_summaries` 关系层节点，再由后台任务�? summary 内部构建 `atomic_event_relationships` 原子事件边�€?

### 为什么拆成�?�?���?
拆阶段不�?��了�?加流程�?杂度，�€�是为了把�€�快速归属�€��€�关系层合并”�€�细粒度原子边�?算�€�解耦，避免全库两两比较，也避免�? summary 尚未稳定时重复构边�€?

1. **Phase 1：Batch 内聚�? + Summary 归属**
   - 鎸変簨浠舵椂闂存帓搴忥紝姣忔壒榛樿� `500` 鏉� proto銆�
   - batch 内只做内存临时聚类，聚类结果不落库�€�不成为图节点�€?
   - 聚类�?��于减�? summary �?��次数；最终仍然是每个 `proto_event` 作为原子节点加入 summary�?
   - 如果 cluster 命中已有 active `kind:%` summary，则�? proto 绑定到命�?�� summary�?
   - 如果 cluster 没有命中 summary，单成员创建 `isolated` summary，�?成员创建�€�?���? relationship summary�?
   - �?��段目标是�?���?���? summary/member 和必要的 merge job，不做重的原子边两两计算�?

2. **Phase 1.5锛歋ummary Merge**
   - 当同�€�? proto 或同�€�? cluster 同时命中多个 summary，�?明这�? summary 之间�?��证据桥接起来了�€?
   - 此时不能长期让一�? proto 多挂多个关系节点，否则关系层会越来越碎�€?
   - 通过 `summary_merge` job 选择 canonical summary，并把其�? summary �? members/edges 去重迁移过去�?
   - �?��并的 summary 使用�?��并：`summary_status='merged'`、`merged_into_summary_id=<canonical>`，不物理删除，便于�?计和跳转�?
   - 这个阶�?必须早于 full detail rebuild，否则会先在即将�?��并的 summary 内重复构边，�?��大量计算�?

3. **Phase 2：Detail Job 入队**
   - summary 归属�? merge 完成后，active summary 集合已经相�?稳定�?
   - 对每�? active v2 summary 入队�€�? full detail job�?
   - 入队阶�?�?��建任务，不直接阻塞主流程做边计算�?

4. **Phase 3锛欴rain Detail Jobs锛堝彲閫夛級**
   - 如果脚本�? `--drain-details`，则同�?消费 detail job�?
   - detail job �?�� summary 内部对成�? proto 做�?细关系分析，upsert `atomic_event_relationships`，并刷新 summary �? `member_count`、`edge_count`、`avg_confidence`、时间范围等统�?�?
   - 实时生产链路不等待这�?��段完成；新闻解析保存 proto 后先进入 batch assignment queue，由后台 worker 异�?归属和构边�€?

### 鏍稿績鍘熺悊
- **Summary-first**：先判断新原子事件是否属于某�?��系层节点，再在命�?�� summary 内部细算原子边�€?
- **Batch 预筛�?**：batch 内聚类只做�€��€�召回优化，不替代原子事件节点，也不落库�?
- **关系层合�?**：一�? proto 同时桥接多个 summary 时，优先合并 summary，减少关系层碎片化�€?
- **异�?细算**：原子边构建放入 `relationship_summary_jobs`，避免入库�?求�?重�?算阻塞�€?
- **�?��复回�?**：Phase 1 完成后�?�? Phase 1.5/Phase 2 失败，可以用 resume 参数继续，不必重跑已经�€�时完成�? summary 归属�?

### 鏈��淇�敼璁板綍
- **�?? merge job 参数类型错�?**：`lib/db/relationship-summary-queries.mjs` �? summary job、merge、stats、graph 查�?相关 SQL 参数补充显式 cast，例�? `$1::int`、`$2::text`、`$4::jsonb`，解�? PostgreSQL 报错“无法确定参�? $1 的数�?��型�€��€?
- **琛ラ綈澶辫触浠诲姟鎭㈠�**锛氭柊澧�/淇濈暀 `resetFailedRelationshipSummaryJobs()`锛屾敮鎸佸皢 failed job 閲嶇疆涓� pending锛岄厤鍚堥噸寤鸿剼鏈�户缁�秷璐广€�
- **补齐 Phase 1 后恢复参�?**：`scripts/rebuild-atomic-relationship-graph.mjs` �?�� `--resume-after-phase1` 跳过已完成的 summary assignment，并�?�� `--reset-failed-jobs` 重置失败�? summary jobs�?
- **避免�?���?**：`--resume-after-phase1` 禁�?�? `--full` 同时使用，防止恢复时�?��空已完成�? Phase 1 数据�?
- **统一 batch 默�?�?**：`rebuild-atomic-relationship-graph.mjs` 默�? batch size 调整�? `500`，与实时 batch assignment worker �? backfill 脚本保持�€致�€?
- **验证结果**：已通过 `node --check` �€�? `relationship-summary-queries`、`rebuild-atomic-relationship-graph`、`relationship-summary-manager`；并通过 `relationship-summary-manager.test.mjs` �? `batch-event-clusterer.test.mjs` 单测�?

### 当前推荐恢�?命令
Phase 1 已完成但 Phase 1.5 merge job �? SQL 参数类型失败时，不需要重�? `--full`。推荐执行：

```powershell
npm.cmd run rebuild-atomic-graph -- --resume-after-phase1 --reset-failed-jobs --drain-details --job-batch-size 10

### 2026-05-14 性能优化记录

**问题分析：**
1. Phase 2 的 `detail_rebuild` 执行全量两两配对 ($O(n^2)$)，超大 Summary (13,000+ 成员) 产生 8900 万对比较，导致计算量爆炸。
2. `enqueueFullDetailJobs` 存在 SQL 语法错误，导致部分 Job 永久失败。

**修复措施：**
1. **快速剪枝**：在 `AtomicRelationshipAnalyzer` 中增加评分阈值检查，分数低于 0.35 的对子直接跳过后续复杂计算。
2. **聚类采样**：在 `RelationshipSummaryManager` 中引入 `MAX_REBUILD_MEMBERS` (1000) 限制。超过限制的 Summary 会先进行内部聚类，仅对聚类代表节点进行配对，模拟增量过程。
3. **Bug 修复**：修正 `rebuild-atomic-relationship-graph.mjs` 中的 `unnest` SQL，确保日期对象正确序列化。
4. **状态重置**：清理了卡住的 `running` 和 `failed` 任务，恢复系统调度。

**下一步：**
以较小的并发量 (`--job-batch-size 2`) 重新启动 Phase 2。
```

如需定位单个失败 job，可临时降低并发批量�?

```powershell
npm.cmd run rebuild-atomic-graph -- --resume-after-phase1 --reset-failed-jobs --drain-details --job-batch-size 1
```

## 2026-05-06 - LLM 解析器三阶�?重构：实�?/动作归一�? + 层级�?��

### �?���?�� (LLM Parser Three-Stage Refactor: Normalization + Hierarchy)
改进 LLM 解析�?��使其能�?�?
1. 提取�€有事件�€�实体�€�动作，不遗�?
2. 利用 LLM 进�?实体/动作归一化判�?��而非�?��码映�?
3. 识别实体层级关系（�?"美国国防�?"挂在美国下）
4. 结构化输出，直接�?��于后�?��码执行（�? agent 模式�?
5. 保持 LLM 和传统方法的隔�?

### 闂��鍒嗘瀽璁板綍
1. **提示词不够明�?**�?"忽略评�?、�?测�€��?点�€��?�?"过于粗暴，�?"特朗�?��评某政策"�?���?��件，"宣布�€周后对话"也是事件（只�?��记为 future�?
2. **复合动作漏提�?**�?"宣布出售武器"�?���?��作还�?���?��（�?�? + 出售）应该拆�?
3. **多�?体漏提取**�?"向台湾和日本出售武器"应�?拆成两个事件
4. **模糊指代�?���?**�?"双方"应�?还原为具体国家名
5. **关键数�€�未提取**：金额（10亿美元）、幅度（25�?��点）等未结构化提�?
6. **�?��码映射膨�€ prompt**：给 LLM 塞几十条实体映射表会降低性能
7. **实体无层�?**：没�? parent_entity 概念�?"美国国防�?"和美国是分�?�?

### 解决方�?：三阶�? LLM Pipeline

```
鏂伴椈杈撳叆
  鈹�
  鈻�
Stage 1: 事件提取�?1次调�?���? 输出原�? actors/action/objects
        鈹�
        鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹�
        鈻�                                      鈻�
Stage 2a: 实体归一化（1次调�?��     Stage 2b: 动作归一化（1次调�?��
        鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹�
                        鈹�
                        鈻�
                Stage 3: 缁撴灉鍚堝苟锛堢函浠ｇ爜锛�
```

### �?��内�?记录

#### 1. 閰嶇疆鎵╁厖 ([lib/config/event-taxonomy.mjs](lib/config/event-taxonomy.mjs))
- 新�? `ENTITY_TYPES` 枚举�?8 种实体类型）
- 鎵╁睍 `ACTION_TAXONOMY`锛氭柊澧� MILITARY_DETAIL锛坰ell_weapons锛夈€乀RADE锛坕mport/export锛夈€丯EGOTIATE锛坣egotiate锛�
- 新�? `ACTION_SYNONYM_MAP`（动作同义词映射，兜底用�?
- 鏂板� `getEntityHierarchyRulesText()`锛堜緵 LLM prompt 浣跨敤锛�

#### 2. 数据库迁�? ([sql/011_entity_hierarchy.sql](sql/011_entity_hierarchy.sql)) [NEW]
```sql
ALTER TABLE entity_mapping ADD COLUMN IF NOT EXISTS parent_entity_id INT REFERENCES entity_mapping(id);
ALTER TABLE entity_mapping ADD COLUMN IF NOT EXISTS entity_subtype VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_entity_parent ON entity_mapping(parent_entity_id);
```

#### 3. 瀹炰綋鏌ヨ�妯″潡澧炲己 ([lib/db/entity-queries.mjs](lib/db/entity-queries.mjs))
- 鏂板� `getOrCreateEntityWithHierarchy(rawName, canonicalName, entityType, parentEntityId, confidence)`
- 鏂板� `getEntityHierarchy(entityId)` 鈥� 閫掑綊鏌ョ埗閾�
- 鏂板� `getEntitiesByParent(parentEntityId)` 鈥� 鏍规嵁鐖跺疄浣撹幏鍙栧瓙瀹炰綋

#### 4. 瀹炰綋褰掍竴鍖栨ā鍧� [NEW] ([lib/pipeline/entity-normalizer.mjs](lib/pipeline/entity-normalizer.mjs))
- 鍙�� Stage 2a 璋冪敤锛屾寔涔呭寲瀹炰綋鍒� entity_mapping 琛�
- �?��缓存避免同一 raw_name 重�?调用 LLM
- DB 权威优先：entity_mapping 已有时用 DB 的，LLM 的作为参�?

#### 5. LLM 解析器重�? ([apis/parsers/llm-parser.mjs](apis/parsers/llm-parser.mjs)) �? 三阶段架�?

**Stage 1 Prompt 关键设�?**�?
- 事件定义明确：声�?/批评/表�€�本�?��事件；future 事件也提取但标�? temporal_status
- 复合动作必须拆分�?"宣布出售"�? "宣布" + "出售"�?
- 多�?体必须展�€�?"向A和B出售"�? 两个事件�?
- 模糊指代必须还原�?"双方"�? 具体国�?名）
- 关键数�€�提取到 details 字�?

**Stage 1 杈撳嚭**锛�
```json
{
  "events": [{
    "actors": ["美国国防�?"],
    "action": "鍑哄敭",
    "objects": ["姝﹀櫒瑁呭�"],
    "details": {"金�?": "10亿美�?", "�?���?": "台湾"},
    "temporal_status": "past",
    "evidence_snippet": "原文�?��撑�?事件的句�?"
  }]
}
```

**Stage 2a Prompt**锛氬疄浣撳綊涓€鍖�
- 输入：去重后的实体列�?
- 杈撳嚭锛歿 raw_name, canonical_name, entity_type, parent_entity, confidence }
- 层级规则：国家下属机�? parent_entity �?��家名

**Stage 2b Prompt**锛氬姩浣滃綊涓€鍖�
- 输入：去重后的动作列�?
- 杈撳嚭锛歿 raw_action, normalized_action, action_category, is_standard_match }

**并�?调用**：Stage 2a �? 2b �? `Promise.all()` 并�?执�?

#### 6. 后�?理模块�?�? ([lib/pipeline/post-processing.mjs](lib/pipeline/post-processing.mjs))
- 新�? `processLlmProtoEvents()` �? LLM 专用后�?理，信任 LLM 归一化结�?
- 现有 `processProtoEvents()` 保持不变，服�? enhanced/traditional 解析�?

#### 7. 瑙ｆ瀽鍣ㄩ€夋嫨鍣ㄦ洿鏂� ([lib/pipeline/parser-selector.mjs](lib/pipeline/parser-selector.mjs))
- LLM �?��调用 `processLlmProtoEvents()`
- 传统�?��调用 `processProtoEvents()`

### 楠岃瘉缁撴灉璁板綍

#### 娴嬭瘯鐜��
- 新闻来源：jin10（重要�€? >= 0.4 或内容长�? > 300 字�?的新闻）
- 测试新闻 3 条：国台办回应�€�哈塞特透露白�?AI审查、宝光股份公�?

#### 三阶�? LLM 提取效果

**鏂伴椈 1锛氬浗鍙板姙鍥炲簲鍙颁紒涓庨�鏂囩兢"鍒囧壊"**
- Stage 1 提取�?14 �?��始事�?
- Stage 2a 瀹炰綋褰掍竴鍖栵細15 涓�疄浣�
- Stage 2b 动作归一化：5 �?���?
- 鍘婚噸鍚庯紙processLlmProtoEvents锛夛細5 涓� proto-events

**新闻 2：哈塞特透露白�?拟为AI模型建立审查机制**
- Stage 1 提取�?14 �?��始事�?
- Stage 2a 瀹炰綋褰掍竴鍖栵細16 涓�疄浣�
- Stage 2b 动作归一化：11 �?���?
- 鍘婚噸鍚庯紙processLlmProtoEvents锛夛細12 涓� proto-events

**新闻 3：宝光股份氦气业务公�?**
- Stage 1 提取�?3 �?��始事�?
- Stage 2a 瀹炰綋褰掍竴鍖栵細2 涓�疄浣�
- Stage 2b 动作归一化：3 �?���?
- 鍘婚噸鍚庯紙processLlmProtoEvents锛夛細3 涓� proto-events

#### 瀹炰綋褰掍竴鍖栫ず渚嬶紙from Stage 2a锛�
- "美国国�?经济委员会主任哈塞特" �? Hassett (person)
- "瀹濆厜鑲′唤" 鈫� Baoguang Co., Ltd. (company)
- "Anthropic" 鈫� Anthropic (company)
- "鐧藉�" 鈫� The White House (organization)

#### 动作归一化示例（from Stage 2b�?
- "正在研究" �? UNKNOWN (无标准匹�?)
- "瀹ｅ竷" 鈫� announce (STATEMENT)
- "price_increase" 鈫� price_increase (PRICE)
- "�?��" �? UNKNOWN (无标准匹�?)

#### 发现的问�?
1. **事件过度拆分**：LLM 将同�€句话拆成了�?�?��似事件（如陈斌华�? 8 �? announce 都是关于"台独"表�€�），去重后仍有多余
2. **动作归一化不完整**：部分中文动作（�?"正在研究"�?"拟建�?"）未匹配到标准动�?
3. **实体层级�?��久化**：Stage 2a 归一化了实体�? entity-normalizer.mjs 尚未�?��整调用来持久化层级关�?

#### 浼犵粺瑙ｆ瀽鍣ㄨ矾寰勯獙璇�
- 浼犵粺瑙ｆ瀽鍣ㄨ矾寰勬�甯稿伐浣�
- 输出�? LLM �?��隔�?（使�? `processProtoEvents` 而非 `processLlmProtoEvents`�?

#### 下一步改进方�?
1. 优化 Stage 1 的事件合并�€�辑，减少过度拆�?
2. 扩大 `ACTION_SYNONYM_MAP` 覆盖更�?�?��动作
3. 完善 `entity-normalizer.mjs` 的持久化调用，使 entity_mapping 表的 `parent_entity_id` 正确�?��
4. 考虑�? Stage 2b �? UNKNOWN 动作进�?二�? LLM 调用，提升归�€化率

---

## 2026-04-26 - 涓�嫳鏂� NER 鍒嗙�涓庤嚜閫傚簲璇�█閫夋嫨

### �?���?�� (Chinese/English NER Separation + Language-Auto-Selection)
将实体提取拆分为�?��文两�?���? NER 链路，并�? pipeline/API 层实现根�??�€�?€�应选择对应的解析函数�€�解决中文子串�?匹配（�?"对�?交谈�?"�?���?"外交�?"）和英文 `\b` 词边界不适配�?��的问题�€?

### 闂��鍒嗘瀽璁板綍
1. **`\b` 对中文无�?**：entity-index 原来使用 `\b` 词边界，对中文不生效；`(^|[^�€-鿿])WORD([^�€-鿿]|$)` 在连�?��文文�?��也无法成立（词间无天然分隔）
2. **�?�� NER �€要独立方�?**：参�? FinceptTerminal 的内�?���? + �?���€长匹配方�?
3. **英文 NER 参�€? worldmonitor**：Gazetteer �€长短�?���? + 分层�?��度（alias 0.95/0.85, keyword 0.70, substring 0.50�?

### �?��内�?记录

#### 1. 实体数据库�?�? ([lib/entities/entity-database.mjs](lib/entities/entity-database.mjs))
- **新�? `keywords` 字�?**：为关键实体添加上下文关�?��（�? USA �? Washington, White House, Pentagon, American�?
- **鎵╁厖鍥藉�**锛欰ustralia, Brazil, Canada, Italy, Spain, Poland, Pakistan, South Africa
- **扩充城市**：Paris, Berlin, Rome, Brussels, Seoul, Taipei, Hong Kong
- **鎵╁厖缁勭粐**锛欰SEAN, G7, G20
- **鏂板� regions**锛氬崡娴枫€佸彴娴枫€佹尝鏂�咕銆佺孩娴枫€侀粦娴�
- **补充�?���?��**：美�? �? "美方"/"华盛�?"，中�? �? "�?��"/"北京" �?

#### 2. 实体索引重写 ([lib/entities/entity-index.mjs](lib/entities/entity-index.mjs)) �? 英文 NER 引擎
- **边界匹配**：英文使�? `\b` 词边界，�?��使用 `includes()`（词典实体已精�€�，无需额�?边界�?
- **鍒嗗眰缃�俊搴�**锛歟xact 闀垮悕 0.95 / 鐭�悕 0.85 / keyword 0.70 / substring 0.50
- **�?���€长短�?**：别名按长度降序排列，优先匹配长�??
- **关键词索�?**：新增�?实体 `keywords` 字�?的索引支�?
- **导出函数保持不变**：`extractEntities()`, `extractEntitiesByCategory()`, `groupEntitiesByType()` 签名和返回类型一�?

#### 3. 瑙ｆ瀽鍣ㄦ媶鍒� ([apis/parsers/enhanced-parser.mjs](apis/parsers/enhanced-parser.mjs))
- **新�? `parseChineseNews(title, content)`**：内�?��文实体词�? + `includes` 匹配 + �?���€长短�?��配（参�€? FinceptTerminal 内置字典方式�?
- **新�? `parseEnglishNews(title, content)`**：调�? entity-index + 边界匹配 + 分层�?��度（参�€? worldmonitor Gazetteer�?
- **保留 `extractProtoEventsEnhanced()`**：向后兼容别名，默�?调用 `parseEnglishNews()`
- **删除冗余代码**：移除硬编码�?��词典提取和合并�€�辑
- **输出结构不变**：保�? `proto_events` 数组格式，不影响数据库存�?

#### 4. Pipeline 鑷�€傚簲璇�█閫夋嫨 ([lib/pipeline/parser-selector.mjs](lib/pipeline/parser-selector.mjs))
- **新�? `detectLanguage()`**：优先使�? `options.lang` 字�?，未提供则�€�过�?��字�?占比�?���€测（>30% �?��字�?判定为中文）
- **�?���?��**：`detectLanguage()` �? `zh` �? `parseChineseNews()` / `en` �? `parseEnglishNews()`

#### 5. Pipeline �? API 更新
- `lib/pipeline/news-pipeline.mjs`锛氬皢 `lang` 浼犻€掔粰 `extractWithSelectedParser()`
- `api/v1/news.mjs`：两处调用根�? `news.lang` 或�?求体 `lang` 选择
- `api/v1/admin.mjs`：两处调用根�? `news.lang` 选择

### 楠岃瘉缁撴灉璁板綍
- **entity-index**锛氭�纭�尮閰� "浼婃湕"锛�85%锛夈€�"澶栦氦閮ㄥ０鏄�"锛�85%锛夈€�"US sanctions Russia"锛�95%锛�
- **防�?匹配**�?"对�?交谈判进行中" 不匹�?"外交�?" ✅；"Jerome Powell speaks" 不匹�?"rome" �?
- **�?��去重**�?"商务部�?布新政策" 仅返回一�?"商务�?"实体，不重�? �?
- **pipeline**：`parser-selector.mjs` �?���€测�€�辑正常工作，中英文�?���?��
- **现有测试**：`test/test-entity-fix.mjs` 全部通过

## 2026-04-24 - 新闻去重链路�??�? GDELT 增量流式改�€?

### �?���?�� (Dedup + Incremental Streaming)
解决“重复抓取�?致重复解析�€�内存占用偏高�€�临时文件清理滞后�€�的�??。重点将新闻写入链路升级为前�?���? + 原子 upsert，并�? GDELT 采集改�€�成增量感知与流式�?理�€?

### 闂��鍒嗘瀽璁板綍
1. **重�?解析�??**：原链路�?�� source 会先执�?解析�?��再在 `ingest` 阶�?判断新闻�?��已存�?��导致重�?新闻仍会触发解析与后�??理�€?
2. **写入并发窗口**：`news` 去重虽有 `UNIQUE(source, source_url)`，但代码层是“先查后写�€�，存在并发竞�€�窗口�€?
3. **GDELT 非�?量与内存放大**�?
   - 旧�€�辑�? `masterfilelist` 取�?�? export，可能�?取历史文件�€?
   - 解压后整�? CSV `readFile` 进内存，�? `slice(limit)`，开�€偏高�?
4. **状�€��?测不完整**：`source_status` 仅�?�? `events_fetched`，跳过量与文件级幂等状�€�不直�?�?

### �?��内�?记录

#### 1. source 层�€�解析前查重”短�?
- 淇�敼锛�
  - `apis/sources/rss-news.mjs`
  - `apis/sources/jin10.mjs`
  - `apis/sources/newsminimalist.mjs`
  - `apis/sources/gdelt.mjs`
- 在调用解析器前�?�? `checkNewsExists + isNewsParsed`，命�?��直接 `skip`，避免重复新闻触发解析与聚类�?

#### 2. 新闻写入改为原子 Upsert
- 淇�敼锛歚lib/db/news-queries.mjs`
- �? `upsertNews` 改为 `INSERT ... ON CONFLICT(source, source_url) DO UPDATE ... RETURNING`�?
- 更新策略优化�?
  - `reliability_score` 取较高�€�（避免�?��质量新数�??盖）�?
  - `normalized_data` 浣跨敤 JSONB merge銆�
  - 空字符串不�?盖已有有效字段�€?

#### 3. GDELT 临时文件清理与流式�?�?
- 淇�敼锛歚apis/utils/gdelt-helper.mjs`
- 清理策略改为 `try/finally` 立即回收临时�?��（替�? `setTimeout` 延迟删除）�€?
- 鏂板�锛�
  - `getLatestGDELTExportInfo()`：优先�?�? `lastupdate.txt`，失败再回�€€ `masterfilelist`�?
  - `streamLatestGDELTLines(limit, onLine)`：解压后按�?流式读取 CSV，仅处理�? `limit` 行�€?

#### 4. GDELT 鏂囦欢绾у箓绛変笌鐘舵€佽拷韪�
- 淇�敼锛歚apis/sources/gdelt.mjs`
- 新�?“文件级 marker 幂等跳过”：同一 export 文件已�?理时整轮跳过�?
- `source_status` 增加并使�?��
  - `last_processed_marker`锛堟枃浠跺悕绾у箓绛夛級
  - `skipped_count`（跳过�?数）
- 跳过�??保留上�? `events_fetched`，不再重�?�� 0�?

#### 5. SQL 与运维脚�?���?
- 鏂板�锛�
  - `scripts/audit-news-dedup.mjs`锛堥噸澶嶄笌澧為噺宸℃�锛�
  - `sql/cleanup-news-duplicates.sql`（历史重复清理）
  - `sql/006_source_status_marker.sql`
  - `sql/007_source_status_skipped_count.sql`
- 更新�?
  - `sql/001_initial_schema.sql`：`source_status` 增加 `last_processed_marker`、`skipped_count`

### 楠岃瘉缁撴灉璁板綍
- **去重效果**：同窗口两轮采集，�?二轮 `skip` 显著上升，重复解析明显减少�€?
- **GDELT 姝ｇ‘鎬�**锛氬凡浠� `lastupdate.txt` 璇诲彇鏈€鏂� export锛堜緥濡� `20260424101500.export.CSV.zip`锛夛紝涓嶅啀璇�彇鍘嗗彶鏂囦欢銆�
- **流式有效�?**：GDELT 已按行�?理，`linesRead` �? `limit` 对齐，不再整�? CSV 读入�?
- **幂等验证**：同�€ export 文件�?��次执行直接命�? `already-processed-export` 跳过�?
- **鐘舵€佹寔涔呭寲**锛歚source_status.last_processed_marker` 涓� `skipped_count` 宸插彲鏌ヨ�銆�

---

## 2026-04-24 - 网络连接异常排查�? GDELT 助手健壮性优�?

### �?���?�� (Network Troubleshooting & GDELT Robustness)
排查系统运�?过程�?��面积出现�? `ECONNRESET` 错�?，涉及金十数�? API、GDELT 以及�?��数据库连接�€?

### 闂��鍒嗘瀽璁板綍
1. **现象**：`npm start` �?��后，�€有�?�? API 请求（Jin10, NewsMinimalist, GDELT）均在重试后失败，报�? `TypeError: fetch failed` �? cause �? `read ECONNRESET`。同时本�? PostgreSQL 数据库也出现相同错�?�?
2. **璇婃柇杩囩▼**锛�
   - 缂栧啓 `scratch/diagnose-network.mjs` 娴嬭瘯鑴氭湰銆�
   - 发现不仅�? API 地址，连 `www.baidu.com` �? `localhost:5432` �? Node.js �??下也全部超时�?
   - 结�?：这�?��型的**�??网络故障**。极大可能是由于�?��代理工具（�? Clash/V2Ray）开�?��系统代理但无法�?常工作，导致 Socket 连接�?��统层级重�?€?
3. **代码隐患**：发�? `gdelt-helper.mjs` 绕过�? `safeFetch` 封�?直接使用了全�€ `fetch`，缺乏重试机制�€?

### �?��内�?记录

#### 1. 浼樺寲 GDELT 鍔╂墜 ([apis/utils/gdelt-helper.mjs](apis/utils/gdelt-helper.mjs))
- **统一工具调用**：将�€有直接使�? `fetch` 的地方替�?�� `safeFetch`�?
- **增强鲁�?�?**：利�? `safeFetch` �?���? 3 次重试机制，应�?�?��网络抖动�?

#### 2. 缃戠粶璇婃柇鑴氭湰 ([scratch/diagnose-network.mjs](scratch/diagnose-network.mjs)) [NEW]
- 提供了环境�?测功能，�?��印代理环境变量�€�测试�?网连通�€�及查�? Windows 注册表中的系统代理�?�?€?

### 楠岃瘉缁撴灉璁板綍
- **代码验证**：`gdelt-helper.mjs` 已成功切换至 `safeFetch`�?
- **�??建�?**�?**�??�?��络环境问�?**。建�?��户�?查代理软件状态或尝试关闭系统代理后重新运行�€?

---

## 2026-04-22 - �?? Dashboard 事件图显示异常与名称缺失�??

### �?���?�� (Fixing Event Graph Display & Missing Names)
解决 Dashboard 事件关系图中节点名称显示为空、关系连线不显示以及后�? API �? 500 错�?的问题�€�确保标准事件在各�?情况下都能拥有具有描述�€�的名称�?

### �?��内�?记录

#### 1. 淇��鍚庣� API 閫昏緫 ([api/v1/events.mjs](api/v1/events.mjs))
- **移除冗余代码**：删除了 `/graph` 接口�?��完整且错�?��内联实现逻辑�?
- **调用封�?函数**：改为直接调�? `getRelationshipGraph` 数据库辅助函数，�?�� `nodes` �? `links` 数据完整�?
- **�??运�?时错�?**：修复了�? `graph.links` �?��义�?致的 `forEach` 崩溃�?500 错�?）�€?
- **增强日志**：在 API 层添加了关键变量打印，实时监控节点名称的合成结果�?

#### 2. 优化节点名称合成算法 ([lib/db/event-relationships-queries.mjs](lib/db/event-relationships-queries.mjs))
- **引入关联查�?**：在获取关系图数�?��，�€�过 `LEFT JOIN` 关联 `entity_mapping` �?��获取 `actor1_name` �? `location_name`�?
- **重构�?��命名逻辑**：针对标准事件层级，实现了更符合�?���?��的智能合成�€�辑�?
  - **三元组合成优�?**：优先提�? `[主体][动作][�?��]`（�?“伊朗�?击以色列”）作为节点名称�?
  - **事件类型�?���?**：建立了 `eventTypeMap`，将 `Fight`, `Protest` 等英文标签映射为“军事冲突�€��€��€�抗�?��动�€�等�?��描述�?
  - **结构化兜�?**：若三元组不�?��则合�? `[主体][地点][类型]` 格式�?
  - **长度与质量过�?**：自动过滤过�?��无意义的名称，确�? Dashboard 上的信息密度�?
- **日志验证**：在数据库层增加节点名称合成过程的�?�? log�?


### 楠岃瘉缁撴灉璁板綍
- **后�?验证**：控制台 log 显示节点名称已�?�?��成，例�? `"Israel Fight @ Gaza Strip"` �? `"Iran Protest"`�?
- **前�?验证**：Dashboard 关系图节点标签不再为空，连线关系正常展示，交互模态�?加载正常�?

---

## 2026-04-22 - 实现L4事件�? + 优化态势分析�?��

### �?���?�� (Event Graph & Dashboard Enhancement)
实现L4事件图功能，完成6层情报架构的核心�€�?€�优化dashboard�?��态势分析�?��，�?强事件关系可视化展示，�?用户能直观地看到不同标准事件之间的关联关系�€?

### �?��内�?记录

#### 1. L4事件图核心算法实�? ([lib/analysis/event-relationship-analyzer.mjs](lib/analysis/event-relationship-analyzer.mjs))
- **统一多特征评分函�?**�?
  ```javascript
  score(i,j) =
    0.3 * entity_overlap(i,j)     // 实体重叠（Jaccard相似度）
  + 0.15 * action_compat(i,j)    // 动作兼�?性评�?
  + 0.25 * semantic_sim(i,j)     // �?��相似度（预留接口�?
  + 0.2 * temporal_prox(i,j)     // 时间接近度（指数衰减�?
  + 0.1 * spatial_prox(i,j)      // 空间接近�?
  ```
- **新�?关系类型**：`temporal`（时间边）和 `sub_event`（子事件），现在�?��7种关系类�?
- **优化候�€�集�€�?**�?7天时间窗 + 实体重叠双重过滤，提高�?索效�?
- **增量图构�?**：`updateGraphForNewEvent()` 函数，支持�?量更新，避免全量重算
- **图再平衡**：`rebalanceGraph()` 函数，定期清理弱边（weight < 0.3�?

#### 2. 增强事件关系查�? ([lib/db/event-relationships-queries.mjs](lib/db/event-relationships-queries.mjs))
- **优化节点显示**：标准事件现在使用�?应的原子事件标�?显示（优先用新闻标�?，否则用actor-action-object组合�?
- **添加原子事件查�?**：在 `getRelationshipGraph()` �?��询每�?��准事件�?应的原子事件，用于生成更友好的节点标�?

#### 3. 澧炲己鐨別vents API ([api/v1/events.mjs](api/v1/events.mjs))
- **新�? `/api/v1/events/:id/update-graph`**：�?量更新单�?��件的事件图关�?
- **新�? `/api/v1/events/rebalance-graph`**：清理弱边，执�?图再平衡
- **澧炲己 `/api/v1/events/graph`**锛�
  - 添加统�?功能（关系类型统计�€�平均权重�€�置信度等）
  - 杩斿洖瀹屾暣鐨勫浘缁熻�淇℃伅

#### 4. Dashboard事件图可视化优化 ([dashboard/public/scripts/components/graph.js](dashboard/public/scripts/components/graph.js))
- **添加边类型图�?**：在图左上�?显示�€�?7种关系类型的图例（�?�? + 名称�?
- **优化节点标�?**：自动截�?��文本（最�?15字�?），添加省略�?
- **添加边标�?**：在边中间显示关系类型名�?
- **�?��新关系类型�?�?**�?
  - `temporal`锛堟椂闂磋竟锛夛細绱�壊 `#a55eea`
  - `sub_event`（子事件）：绿色 `#2ed573`
- **增强节点�?��提示**：显示完整的节点信息（名称�€�类型�€�重要�€�）

#### 5. 娴嬭瘯鑴氭湰 ([test/test-event-graph.mjs](test/test-event-graph.mjs))
- **完整功能验证**：测试所有评分函数�€�关系�?测和图分析器
- **实机测试**：连接数�?��，验证真实数�?��的事件图功能

### 7绉嶅叧绯荤被鍨嬭�鏄�
现在事件图支持完整的关系类型体系�?
| 关系类型 | 颜色 | 描述 |
|---------|------|------|
| `parent_child` | 蓝色 | 父子层级关系 |
| `cause_effect` | 红色 | 因果关系 |
| `evolution` | 橙色 | 演变关系 |
| `trigger` | 棕色 | 触发关系 |
| `temporal` | �?�� | 时间先后关系 �? 新�? |
| `sub_event` | 缁胯壊 | 瀛愪簨浠跺寘鍚�叧绯� 猸� 鏂板� |
| `related` | 青色 | �€�?��关关�? |

### 楠岃瘉缁撴灉璁板綍
- **评分函数验证**：所�?5�?��分维度�?常工作（实体重叠、动作兼容�€��?义相似�€�时间接近�€�空间接近）
- **关系�€测验�?**：成功�?测到多�?关系类型，包�?��增的temporal和sub_event
- **API响应验证**：�?强的graph API正常返回统�?信息和图数据
- **�??化验�?**：边类型图例正常显示，节点标签优化后更清晰易�?

---

## 2026-04-21 - �??数据�€致�€? + 实现在线聚类算法

### �?���?�� (Data Consistency & Online Clustering)
�??情报�€统界面重复原子事件问题，重构标准事件生成算法，改为基于相似度的在线聚类�€?

### �?��内�?记录

#### 1. 数据去重与唯�€性约�?
- **SQL脚本** `sql/clean-proto-events-duplicates.sql`：清�? 385 条重复原子事�?
- **�?��约束** `uq_proto_event_unique (news_id, actor_raw, action_raw, object_raw)`：防止未来重复插�?
- **查�?�??** [news-queries.mjs:321](lib/db/news-queries.mjs#L321)：使�? `DISTINCT ON` 去重查�?

#### 2. 鏂伴椈瑙ｆ瀽鐘舵€佹�鏌�
- **鏂板�鍑芥暟** [news-queries.mjs](lib/db/news-queries.mjs)锛�
  - `isNewsParsed(newsId)` - �€查新闻是否存在原子事�?
  - `checkNewsExists(source, sourceUrl)` - 通过来源和URL�€查新闻是否已存在
- **入口�€�?** [event-ingestion.mjs:14](lib/pipeline/event-ingestion.mjs#L14)：解析前�€查新闻是否已处理

#### 3. 实时情报源刷�?
- **�?��刷新** [news-scroll.js:18](dashboard/public/scripts/components/news-scroll.js#L18)：添�? 30 秒定时刷新机�?
- **资源清理** [news-scroll.js:556](dashboard/public/scripts/components/news-scroll.js#L556)：在 destroy() �?��理定时器

#### 4. 在线聚类算法重构
- **重写** [canonical-merger.mjs](lib/analysis/canonical-merger.mjs)：实现新的在线聚类算�?
- **鍊欓€夐€夋嫨**锛氭椂闂寸獥鍙� 卤7 澶� + 瀹炰綋閲嶅彔杩囨护 (Jaccard 鈮� 0.2)
- **相似度�?�?**�?
  ```
  Sim = 0.4 * entityOverlap + 0.3 * actionMatch + 0.3 * timeDecay
  ```
- **聚类策略**：相似度 �? 0.5 合并到现有事件，否则创建新事�?

#### 5. 跨新闻去重�?�?
- **禁用** [event-ingestion.mjs:62](lib/pipeline/event-ingestion.mjs#L62)：跨新闻原子事件去重暂时禁用，所有原子事件都会参与在线聚�?

#### 6. 数据库修复脚�?
- `sql/fix_step1.sql` - 妯＄硦鍖归厤淇��
- `sql/fix_step2.sql` - 创建缺失事件
- `sql/fix_step3.sql` - 更新关联
- `sql/fix_step4.sql` - �?? event_news 关联

### 楠岃瘉缁撴灉璁板綍
- **数据状�€?**�?337 条原子事件全部关联到标准事件
- **去重效果**：数�?���?��约束已生效，新插入数�?��动去�?

---

## 2026-04-20 - 升级 6 层情报演进架�? (L1-L6 Architecture)

### �?���?�� (Intelligent Evolution)
将系统从�€单的“事件提取器”升级为具�?态势研判能力的�€�六层情报平台�€��€��€�过解�€�原始事实与标准事件，引入叙事子图与推演层，实现对情报的深度处理与未来�?测�€?

### �?��内�?记录

#### 1. 架构分层实现 (Decoupling & Evolution)
- **L2 ProtoEvent (原子事件�?)**：引�? `proto_events` �?��存储 Who-What-Whom 三元组�€�Parser (LLM & Traditional) 统一重构为输�? `proto_events` 数组�?
- **L3 Canonical Event (标准事件�?)**：实�? `CanonicalMerger` 服务，�€�过哈希匹配与模糊�?齐将多个原子事实坍缩为真实世界的�?��事件节点�?
- **L5 Story Layer (叙事�?)**：实�? `StoryManager`。它能自动发�? Event Graph �?��强关联子图，将其聚合为叙事（Story），并动态�?�? **Escalation Level (升级等级)**�?
- **L6 Hypothesis Layer (推演�?)**：实�? `InferenceEngine`。利�? LLM 基于 Story 背景推演潜在的下�€步事件（Latent Space），并支持�?新入库信号的实时验证�?

#### 2. 流水线与调度器重�?
- **摄入管道 (`lib/pipeline/event-ingestion.mjs`)**：重构为级联模式。Article (L1) -> ProtoEvent (L2) -> Canonical Event (L3)。每次摄入均触发 L6 假�?验证逻辑�?
- **调度�?�� (`apis/orchestrator.mjs`)**：聚合任务升级为四�?走：L4 关系分析 -> L5 叙事同�? -> L6 假�?生成 -> 统�?刷新�?
- **API 层兼容�€�修�?**：同步更�? `api/v1/events.mjs` �? `api/v1/news.mjs`，修正由�? Parser 重命名�?致的导入与调用冲突�€?

#### 3. 关键组件与日志验�?
- **Parser 统一�?**：传统解析器�? LLM 解析器现在均返回标准化的原子事实结构，不再尝试在解析阶�?完成事件坍缩�?
- **验证逻辑�?��**：在 `event-ingestion.mjs` �??�? `inferenceEngine.verifyHypotheses(proto)`，实现�€��?�?-验证”的�?���?

### 楠岃瘉缁撴灉璁板綍
- **运�?状�€?**：�€�过 `node server.mjs` 验证，系统成功启动且背景 Sweep 任务平滑运�?�?
- **数据流验�?**：日志显�? `[Traditional Parser]` 提取�? ProtoEvent 后，成功�? `[Ingestion]` 处理并触发了 `[InferenceEngine]` 的验证�€�辑�?
- **聚合验证**：`orchestrator` 成功执�? L4-L6 的级联聚合，�€终输�? `6-Layer aggregation complete`�?

---

## 2026-04-20 - 优化实体识别和解析器改进

### �?���?�� (Entity Recognition & Enhanced Parsing)
提升�?��实体识别准确率，引入更先进的实体数据库和增强解析�?��解决对新实体（�?"万斯"�?"伊斯兰堡"）的识别�??，并优化系统使用增强解析器的配置�?

### �?��内�?记录

#### 1. 实体数据库�?�? (`lib/entities/entity-database.mjs`)
- **新�?人物实体类别**：添加了 `persons` 类别，包�? 11 位全球重要政治人�?
- **新�?城市实体**：添加了巴基�?��主�?城市实体，包�?���?��堡�€�卡拉�?、拉合尔、拉瓦尔品�?
- **实体总数扩展**：从原来�? 89 �?��体扩展到 101 �?��覆盖范围更广

#### 2. 鏂囨湰瑙勮寖鍖栦紭鍖� (`lib/entities/entity-index.mjs:59-64`)
- **�??�?��匹配�??**：重写了 `normalizeText` 函数，保留中文字符，避免在�?范化过程�??删中�?
- **实体匹配提升**：改进了字�?规范化�€�辑，确保中文实体能够�?�?���?

#### 3. 澧炲己瑙ｆ瀽鍣ㄥ畬鍠� (`apis/parsers/enhanced-parser.mjs`)
- **实体提取优化**：改进了 `extractChineseEntities`、`extractChineseCountries` 等中文实体识�?���?
- **主体/�?��识别改进**：更新了 `selectActorEnhanced` �? `selectObjectEnhanced` 函数，�?加人物实体支�?
- **实体类型扩展**：添加了�? `personEntities` �? `cityEntities` 的参数传递和处理逻辑

#### 4. 即时解析接口增强 (`api/v1/news.mjs`)
- **新�?保存选项**：为 `/news/:id/parse` 接口添加�? `save` 参数，支持直接保存解析结果到数据�?
- **调试日志优化**：添加了详细的解析过程日志，方便追踪解析失败原因
- **解析器配�?**：保持�?传统解析器的兼�?，同时支持使用�?强解析器

#### 5. 系统默�?解析器调�?
- **事件摄入管道改进**：修改了调度器配�?��优先使用增强解析�?
- **数据来源更新**：RSS新闻源�€�金十数�?��数据源统�€使用增强解析�?

### 楠岃瘉缁撴灉璁板綍
- **运�?状�€?**：系统�?常启�?��背景任务平滑运�?
- **实体识别**：成功识�?��"万斯"�?"伊斯兰堡"�?"伊朗"等之前无法识�?��实体
- **解析质量提升**：�?强解析器在实体识�?��事件抽取方面表现优于传统解析�?

---

## 2026-04-19 - 集成 Jin10 & NewsMinimalist 数据源并增强�?��传统解析

### �?���?�� (Interactive Dashboard & Enhanced Extraction)
将系统从“新闻流”转型为“结构化事件分析�?��”，强化事件-新闻的层级展示，�??实体识别弱项，并提供数据时效性保障�€?

### �?��内�?记录

#### 1. 传统解析器深度�?�? (`apis/parsers/traditional-parser.mjs`)
- **�?��实体识别优化**：扩展了机构/国�?后缀识别（新增：岛�€�州、盟、号、军、队、办、所等），并将�€�土耳其”�€��€�伊朗�€��€��€�黎巴�?”等核心地缘政治实体加入关键词匹配�€?
- **Actor 提取逻辑重构**：引入基于标题与谓�?动词位置的推�?��制�€�针对�€�A：B呼吁C”等�?��新闻标�?格式进�?了特殊�?理，显著提升了主、�?体（Actor1/Actor2）的识别准确率�€?

#### 2. Dashboard 交互能力升级
- **事件-新闻钻取 (Drill-down)**�?
    - 更新 `EventList.js`，支持点击事件项后动态展�€关联新闻列表面板�?
    - 实现了新闻�?情查看功能，点击具体新闻后�€�过模�€��?（Modal）展示�?文全文及元数�?€?
- **淇℃伅棰戠巼涓庡垎绫绘帶鍒�**锛�
    - �??�? `filters.js` �?��新�?率�?�? UI �??盖的 Bug，并成功�? `main.js` �?��定自动刷新�€�辑�?
    - 新�?“主题�?�? (Topic)”筛选器，支持按政治、�?交�€�经济�€�军事等分类�€�€€?

#### 3. 数据完整性与清理
- **因果�?��联修�?**：在 `event-relationship-analyzer.mjs` �?��施了严格�? ID 校验，彻底解决了“新闻A链接新闻A”的逻辑错�?�?
- **数据库时效�€�维�?**：开发并运�?�? `cleanup-old-data.mjs` 脚本，清除了 2026-04-19 之前的所有过期事件及关联数据，确�? Dashboard 展示的均为最新动态�€?
- **GDELT 实时同�?**：验证并打�€�了 GDELT 实时 CSV 下载�? `tar` 命令解压链路，支持全球事件数�?��小时级更新�€?

### 楠岃瘉缁撴灉璁板綍
- **解析准确�?**：针对�€�俄外交部呼吁土耳其要求基辅...”的新闻，成功识�?�� Actor1 为�€�俄罗斯外交部�€�，Actor2 为�€�土耳其”�€?
- **交互验证**：Dashboard 点击事件后能正确拉取并显示关联的 Jin10 �??�? GDELT 记录，模态�?展示正常�?
- **清理验证**：运�? `cleanup-old-data.mjs` 后，数据库仅保留 2026-04-19 当天的新抓取数据，查询�€�能显著提升�?
- **关系网验�?**：`A->A` 错�?在关系图�?��消失�?

---

## 2026-04-17 - 打�€�事件主链路并接入真实新闻�?文抓�?

### �?���?��
围绕“新闻事件抽�? -> 事件建模 -> 事件关系建模 -> 时间线展示�€�的真实�?��，�?项目进�?了两步重构：

1. 先打通后�?��链路，移除旧 `normalized_events` �?��对核心展示链�?��干扰�?
2. 再补上真实新闻接入能力，避免继续依赖 GDELT 的占位叙述文�?€?

### 主链�?��构�?�?

#### 1. 统一写入模型
- 新�? `lib/pipeline/event-ingestion.mjs`，将新闻抽取结果直接写入 `events`、`news`、`event_news`、`event_relationships`、`event_milestones`�?
- 采集流程不再把结果停留在旧标准化�?��而是进入�?? API 和前�?��接消费的新模型�€?
- 事件�?��、属性历史�€�里程�?和关系分析都在入库阶段联动执行�€?

#### 2. 淇�� API 涓庢煡璇�富閾捐矾
- �??事件相关 API 的路由顺序�€�搜索参数映射和筛�€�字段不�€致问题�€?
- 新�?真实事件时间线接口和事件关系图接口，前�?不再依赖随机关系或纯统�?折线�?
- �?? `orchestrator.mjs` �? import 时自动触�? sweep 的危险副作用�?

#### 3. 改�€�前�?���?
- 时间线从“按天数量折线�€�升级为“趋势统�? + 真实事件时间流�€��€?
- 关系图和桑基图改为�?取真实的 `event_relationships` 数据，不再随机�€�边�?
- 筛�€�器改为拉取真实 actor/location 实体选项�?

#### 4. 楠岃瘉缁撴灉
- `npm test` 已恢复�€�过，当前测试结果为 89/89 全部通过�?

### 下一步推进：真实新闻源接�?

#### 1. RSS 鏂伴椈婧�
- 新�? `apis/sources/rss-news.mjs`，支持�€�过 `RSS_NEWS_FEEDS` 配置多个 RSS/Atom feed�?
- RSS 源拉取的�?€�新闻条�?���? + 原文链接”，而不�?���?��成占位事件描述�€?

#### 2. 正文提取
- 鏂板� `apis/utils/rss-parser.mjs` 瑙ｆ瀽 RSS/Atom銆�
- 新�? `apis/utils/article-extractor.mjs` 从新�? HTML �?��取标题�€�发布时间�€��?文与摘�?�?
- 正文提取结果会直接�€�入现有 `traditional-parser` / `llm-parser`，使抽取阶�?真�?基于新闻文本�?

#### 3. 调度接入
- `apis/orchestrator.mjs` 已注�? `rssNews` 源�€?
- `config.mjs` �? `.env.example` 已补�? RSS 配置项，后续�?��直接通过�??变量�€�?��实新闻接入�€?

### 继续推进：抽取证�?��留与关系建模增强

#### 1. 璇佹嵁涓庢椂闂磋〃杈句繚鐣�
- 增强 `apis/parsers/traditional-parser.mjs`，现在会额�?抽取 `trigger_keywords`、`evidence_snippets`、`time_expressions`、`causal_suggestion` �? `temporal_status`�?
- 增强 `apis/parsers/llm-parser.mjs` 的输出协�?���? LLM �?��与传统路径产出相同的证据结构�?
- 这些字�?会统�€写入 `events.normalized_data` �? `news.normalized_data`，不再只保留“事件类�?/标�?/描述”这种扁平结果�€?

#### 2. 时间线里程�?增强
- `lib/pipeline/event-ingestion.mjs` 现在会把新闻里的关键时间表达同�?成�?�? milestone�?
- 除了事件首�?出现和新增更新，时间线还会�?录�€�新闻提及时间线索�€�，例�? `next week`、`overnight` 这类表达�?

#### 3. 关系分析增强
- `lib/analysis/event-relationship-analyzer.mjs` 现在会�?取事件证�?€�触发词和因果提示词�?
- �??了方向�€�问题：旧事件触发新事件时，关系现在会�?�?���? `old -> new`，不再只尝试 `new -> old`�?
- 新�? `trigger` 关系�€测，并�? `cause_effect` �?��基于证据句和响应�?��的判�?��而不�?��赖事件类型硬编码�?

#### 4. 楠岃瘉琛ュ厖
- 新�? `test/unit/traditional-parser.test.mjs`，验证证�?��、触发词、时间表达和因果提示提取�?
- 新�? `test/integration/event-ingestion.test.mjs`，验证证�?��段能落库且时间表达会生成 milestone�?
- 扩展 `test/unit/event-relationship-analyzer.test.mjs`，验证证�?��动的因果/触发关系和方向�€�修复�€?

## 2026-04-14 - �??事件模型�? API 导出错�?

### �??背景
在进行事件模型重构（从单�€表转向事�?-新闻分�?架构）后，执行数�?��移脚�? `sql/003_events_model_fixed.sql` 时出现字段缺失错�?€�同时，Node.js 后�?因引用不存在的�?出函�? `getActiveEvents` 而无法启动�€?

### �?��内�?记录

#### 1. 数据库模型修�? (`sql/003_events_model_fixed.sql`)
- **字�?补全**：在 `news` 表中添加�? `mentions` 字�?，用于�?录单篇新闻的提及次数�?
- **关联逻辑�??**：修复了�? `normalized_events` 迁移�? `news` 的�€�辑。由�? `normalized_events` 不含 `source_url`，改�? `raw_event_id` 关联 `raw_events` 表获取原始来�? URL�?
- **统�?逻辑优化**：修正了 `UPDATE events` �?���? `news` �? `mentions` 字�?进�?汇�€�的逻辑�?

#### 4. 稳定性�?�? (�??过程记录)
- �?? `orchestrator.mjs` 意�?关闭共享数据库连接池导致�? API 崩溃�??�?
- �? `lib/db/connection.mjs` �?��现连接池空�€�自动恢复�€�辑 (Self-healing mechanism)�?
- 优化事件查�? SQL 关联逻辑，确�? ID 映射不匹配时依然能�€�过基�?字�?展示数据�?

#### 2. 鍚庣�鏌ヨ�瀵煎嚭 (`lib/db/events-queries.mjs`, `lib/db/event-news-queries.mjs`)
- **鏂板�鍑芥暟**锛�
  - `lib/db/events-queries.mjs`: 实现并�?出了 `getActiveEvents` 函数�?
  - `lib/db/event-news-queries.mjs`: 实现并�?出了 `getNewsForEvent` 函数�?
- **鏌ヨ�鏂瑰紡**锛�
  - `getActiveEvents` 直接利用重构脚本�?��建的 `active_events` 物化视图�?
  - `getNewsForEvent` 实现了基�? `event_news` 关联表的分页查�?�?

#### 3. 关键变量打印与验�?
�? `lib/db/events-queries.mjs` �? `getActiveEvents` �?��以加入�?�? log 以便验证�?
```javascript
export async function getActiveEvents() {
  console.log('[DB] Fetching active events from materialized view...');
  const result = await query(sql);
  console.log(`[DB] Found ${result.rows.length} active events`);
  return result.rows;
}
```

### 楠岃瘉鐘舵€�
- [x] API `/api/v1/events/active` 返回正确数据

## 2026-05-08 - 浼樺寲 LLM 涓� NLP 鏈嶅姟瓒呮椂鏈哄埗

### �??背景
用户反�?在�?理大规模实体归一化和复杂新闻提取时，系统频繁出现超时错�?。经排查发现�?
1. `llm-parser.mjs` �?�� `callLLM` 超时时间�?120s）不足以应�?高负载情况�€?
2. 底层 `socks-fetch.mjs` �?�� `execSync` 限制�? 35s 的硬超时，�?致上层�?�?��效�€?

### �?��内�?记录

#### 1. 搴曞眰璇锋眰宸ュ叿浼樺寲 (`lib/utils/socks-fetch.mjs`)
- **动�€�超时�?�?**：修�? `execCmd` 函数，根�?��层传入的 `timeout` 动�€��?�? `execSync` 的超时时间（`timeout + 10s`），解决了底层进程早于网络�?求超时的�??�?
- **默�?值提�?**：将 `socksFetch` �? `nativeFetch` 的默认超时从 30s 提升�? 60s�?

#### 2. LLM 解析器�?�? (`apis/parsers/llm-parser.mjs`)
- **超时增加**：将 `callLLM` 的超时时间从 120s 增加�? **300s (5分钟)**，以�?��深度事件提取和�?阶�?实体处理�?

#### 3. NLP 鏈嶅姟浼樺寲 (`apis/parsers/spaCy-client.mjs`)
- **超时调整**：将�?€? NLP 解析超时�? 30s 增加�? 60s，批量�?理从 60s 增加�? 120s�?

#### 4. 关键代码片�?
�? `lib/utils/socks-fetch.mjs` �?��现�?下�€�辑�?
```javascript
// 动�€��?算底层进程超时，单位�??
const execTimeout = (timeout + 10) * 1000;
execCmd(curlArgs, tmpFile, resolve, reject, execTimeout);
```

### 楠岃瘉鐘舵€�
- [x] 淇�敼宸查儴缃诧紝LLM 璇锋眰涓嶅啀鍙� 35s 纭�檺鍒剁害鏉熴€�
- [x] 实体归一化流程在大批量数�?��运�?稳定�?

---

## 2026-05-09 - Dashboard 大数据展示性能优化

### 问题背景
Dashboard 总览页和新闻解析台在后台数据量增大后加载耗时明显。排查发现：`/api/v1/dashboard/overview` 与 `/api/v1/dashboard/news-parse` 都会先通过 `getFilteredProtoEvents` 拉取筛选范围内的全量 `proto_events`，再在 Node.js 内存中分组、统计和分页；其中 `news-parse` 虽然暴露了 `page/limit`，但实际属于内存 `slice` 的伪分页。

### 修改内容记录

#### 1. Dashboard 限制值配置化 (`config.mjs`, `.env`, `.env.example`)
- **新增配置入口**：在 `config.mjs` 中增加 `dashboard.limits`，统一管理总览页各区块 Top N 和新闻解析台分页上限。
- **新增环境变量**：写入本地 `.env` 并同步 `.env.example`，包括：
  - `DASHBOARD_HOT_EVENTS_LIMIT=8`
  - `DASHBOARD_ACTIVE_STORIES_LIMIT=8`
  - `DASHBOARD_PENDING_HYPOTHESES_LIMIT=10`
  - `DASHBOARD_RECENT_NEWS_LIMIT=10`
  - `DASHBOARD_PARSE_WATCHLIST_LIMIT=10`
  - `DASHBOARD_NEWS_PARSE_DEFAULT_LIMIT=40`
  - `DASHBOARD_NEWS_PARSE_MAX_LIMIT=100`
- **配置读取规则**：运行时默认值位于 `config.mjs` 的 `dashboard.limits`，本地实际覆盖值位于 `.env`。

#### 2. 后端查询层改造 (`lib/db/events-queries.mjs`)
- **新增 Dashboard 专用查询**：增加 `buildDashboardFilteredProtoCte`、`getDashboardSummary`、`getDashboardParserBreakdown`、`getDashboardRelationshipBreakdown`、`getDashboardHotEvents`、`getDashboardActiveStories`、`getDashboardPendingHypotheses`、`getDashboardNewsParsePage` 等函数。
- **数据库聚合替代内存聚合**：summary、parser breakdown、relationship breakdown、Top N 列表都改由 SQL `COUNT/GROUP BY/LIMIT` 完成，避免把全量原子事件加载到 Node.js。
- **真实分页**：`getDashboardNewsParsePage` 在数据库层完成 `LIMIT/OFFSET` 和 `COUNT(*)`，只返回当前页新闻分组。
- **兼容现有筛选**：统一支持 `lang/source/parserMethod/eventType/startDate/endDate`，并保留 `llmOnly/multiProtoOnly/unmappedOnly/watchlistOnly` 等局部过滤能力。

#### 3. Dashboard API 重构 (`api/v1/dashboard.mjs`)
- **`/overview` 轻量化**：接口仍返回原有所有展示区块，但每个区块只取页面实际展示所需条目，例如热点事件 8 条、活跃叙事 8 条、待验证假设 10 条、最近新闻 10 条、解析关注列表 10 条。
- **响应结构兼容**：保留 `summary/hot_events/active_stories/pending_hypotheses/recent_news/parse_watchlist` 结构，前端 `index.html` 不需要大规模调整。
- **`/news-parse` 真分页**：接口继续保持 `data/pagination/meta` 响应格式，但分页由 SQL 层完成，`limit` 默认取 `DASHBOARD_NEWS_PARSE_DEFAULT_LIMIT`，最大不超过 `DASHBOARD_NEWS_PARSE_MAX_LIMIT`。

#### 4. 数据库索引优化 (`sql/013_dashboard_performance_indexes.sql`)
- **新闻过滤索引**：新增 `news(published_at DESC)`、`news(source)`、`news(lang)`。
- **原子事件关联索引**：新增/补充 `proto_events(news_id)`、`proto_events(canonical_event_id)`。
- **事件类型表达式索引**：新增 `(raw_extraction->'metadata'->>'event_type')` 表达式索引，优化 Dashboard 高频事件类型筛选。
- **LLM 解析状态索引**：新增/补充 `llm_parse_results(news_id)`，优化 parserMethod 与 llmOnly 判断。
- **执行记录**：已通过 `node scripts/run-sql.mjs sql/013_dashboard_performance_indexes.sql` 执行索引迁移。

### 验证结果记录
- **语法检查**：`node --check config.mjs`、`node --check lib/db/events-queries.mjs`、`node --check api/v1/dashboard.mjs` 均通过。
- **查询层定向验证**：直接调用 dashboard 查询函数验证 summary、Top N、分页结果正常返回。
- **API 验证**：临时启动服务后验证 `/api/v1/dashboard/overview` 和 `/api/v1/dashboard/news-parse?page=1&limit=3`，overview 各区块限制值生效，新闻解析台第一页和第二页返回不同数据。
- **测试说明**：`npm test` 在当前 PowerShell 环境先受 `npm.ps1` 执行策略限制；改用 `npm.cmd test` 后，Node test runner 遇到 `spawn EPERM`。使用无隔离模式继续验证时暴露既有测试问题，与本次 Dashboard 改造无直接关联。


---

## 2026-05-12 - Relationships 页�?屏大数据加载优化

### �??背景
关系页加载慢的主要原因不�?���? sweep 阻�?，�€�是首屏请求模型过重：`event-relationships.html` 会并行加载关系数�?€�全�? stories、全�? pending hypotheses，其�? pending hypotheses 返回体曾达到�? MB 级；同时 `/dashboard/relationships` 会为关系列表节点加载完整 canonical event 详情，包�?���€要�?屏渲染的�? JSON 字�?�?

### �?��内�?记录

#### 1. 关系页�?屏轻�? (`dashboard/public/event-relationships.html`)
- 首屏 `loadWorkspace` 改为�??�? `/api/v1/dashboard/relationships` 与�?�?��心事件子图�€?
- 绉婚櫎棣栧睆瀵� `/api/v1/intelligence/stories` 涓� `/api/v1/intelligence/hypotheses/pending` 鐨勫叏閲忚�姹傘€�
- stories / hypotheses tab 改为切换后懒加载，列表使用分页状态维护�€?
- 新�? stories / hypotheses 分页按钮，保留点�? story/hypothesis 后按�€ hydrate story 详情的交互�€?

#### 2. 新�?分页接口 (`api/v1/dashboard.mjs`, `lib/db/events-queries.mjs`)
- 鏂板� `GET /api/v1/dashboard/stories?page&limit&filters`锛岄粯璁� `limit=50`锛屾敮鎸佸叏灞€绛涢€夊拰 `withHypothesisOnly`銆�
- 鏂板� `GET /api/v1/dashboard/hypotheses/pending?page&limit&filters&status`锛岄粯璁� `limit=50`锛屾敮鎸� status 涓庡叏灞€绛涢€夈€�
- 两个接口均返�? `data/pagination/meta`，避免前�?��护全量数�?€?

#### 3. 关系接口瘦身 (`api/v1/dashboard.mjs`, `lib/db/events-queries.mjs`)
- `/api/v1/dashboard/relationships` 改用 `getDashboardCanonicalCardsByIds` 返回轻量事件卡片字�?�?
- 关系 rows 裁剪标�?与描述，�?��留列表和图谱渲染�€�€字�?，不再带完整 `relationships_out/hypotheses` 大数组�€?
- 新�? dashboard API �? SQL 查�?耗时日志，�?�? `duration_ms`、`payload_bytes`、`row_count` 等指标，便于区分接口过重与后台任务争用�€?

#### 4. 閰嶇疆榛樿�鍊� (`config.mjs`, `.env`, `.env.example`)
- 鏂板�鍒嗛〉榛樿�鍊硷細
  - `DASHBOARD_STORIES_DEFAULT_LIMIT=50`
  - `DASHBOARD_STORIES_MAX_LIMIT=200`
  - `DASHBOARD_HYPOTHESES_DEFAULT_LIMIT=50`
  - `DASHBOARD_HYPOTHESES_MAX_LIMIT=200`
- 默�?限制值在 `config.mjs` �? `dashboard.limits`，本地�?盖�€�在 `.env`，模板�?明在 `.env.example`�?

### 楠岃瘉鐘舵€�
- [x] `node --check config.mjs`
- [x] `node --check api/v1/dashboard.mjs`
- [x] `node --check lib/db/events-queries.mjs`
- [x] `node --check dashboard/public/scripts/utils/api.js`
- [x] 抽取 `event-relationships.html` 内联脚本并�€�过 `node --check`
- [x] 涓存椂鍚�姩鏈嶅姟楠岃瘉锛�
  - `/api/v1/dashboard/relationships?page=1&limit=5` 杩斿洖 200锛岀害 10KB锛宍total=2158`
  - `/api/v1/dashboard/stories?page=1&limit=5` 杩斿洖 200锛�5 鏉★紝`total=560`
  - `/api/v1/dashboard/hypotheses/pending?page=1&limit=5` 杩斿洖 200锛�5 鏉★紝`total=489702`
- [!] `npm test`：`npm.ps1` 受执行策略限制；改用 `npm.cmd test` 后仍�? Node test runner 触发 `spawn EPERM`，属于当�? Windows 测试运�?�??限制，未进入业务�?���?

---

## 2026-05-12 - Dashboard Canonical / Relationships 绋冲畾灞曠ず淇��

### �??背景
`canonical-events.html` 仍依赖旧�? `layer2/layer3/group` 数据结构，但 `/api/v1/dashboard/canonical-events` 已改为分页平铺数组，导致列表与�?情�?�? `event.group` 时无法稳定渲染�€�`event-relationships.html` 左侧列表又依赖局部图�? `graphState.edges`，缩放时会触�? cluster/event 模式切换、邻居�?取和重渲染，导致当前页关系列表�?图谱状�€��?盖，�?��稳定看到少量关系�?

### �?��内�?记录

#### 1. Canonical Events 聚焦与兼容层
- `/api/v1/dashboard/canonical-events` 新�?�?€? `eventId/event_id` 参数，传�? `getDashboardCanonicalEventsPage`�?
- `getDashboardCanonicalEventsPage` 在目标事件�?合当前筛选但不在当前页时，�?外查询�? canonical event 并置顶返回，同时�? `meta` 标�? `focus_event_id/focus_in_filter/focus_included`�?
- `canonical-events.html` 对分页平铺数组做 normalize，为每个事件补轻�? `group` 兼�?层，字�?来自 `source_news_count/proto_event_count`�?
- 详情 chips 和列表不再直接假�? `event.group.proto_events` 已存�?��原子事件证据继续通过 `/events/:id/aggregation` 按需加载�?
- 从关系页跳转 `/canonical-events.html?eventId=...` 时会优先定位�?��事件；若�?��不在筛�€�范围，会显示明�?��示�€?

#### 2. Relationships 纭�畾鎬у睍绀�
- `/api/v1/dashboard/relationships` 杩斿洖 `relationship_created_at` 涓� `relationship_updated_at`锛岄粯璁ゆ帓搴忔敼涓� `relationship_updated_at DESC, complexity_score DESC, id DESC`銆�
- 关系页左侧列表固定使�? `/dashboard/relationships` �? `layer4` 当前页数�?��不再使用 `graphState.edges` 作为列表来源�?
- 点击某条关系后，右侧�?��染�? source-target 单关系图�? inspector，不再自动扩展邻居�€�不再随缩放�? cluster/event 模式�?
- 关系类型筛�€�会重新请求服务�?���? Top N，�€�不�?��过滤已加载局部图谱�€?
- �?? `storyHypothesisCount` 递归调用�?��的运行时 bug�?

#### 3. 关系更新时间迁移
- 新�?并执�? `sql/019_event_relationships_updated_at.sql`：添�? `event_relationships.updated_at`，用 `created_at` 回填，�?�?��认�€�，并新增更新时间排序索引�€?
- `createEventRelationship` 新建时写�? `created_at/updated_at`；冲突更新时仅更�? `updated_at`，保留原�? `created_at`�?
- 首�?执�?迁移时发�? SQL 文件�? BOM，已改为 UTF-8 �? BOM 后重跑成功�€?

### 楠岃瘉鐘舵€�
- [x] `node --check config.mjs`
- [x] `node --check api/v1/dashboard.mjs`
- [x] `node --check lib/db/events-queries.mjs`
- [x] `node --check lib/db/event-relationships-queries.mjs`
- [x] 抽取 `canonical-events.html` �? `event-relationships.html` 内联脚本并�€�过 `node --check`
- [x] 执�? `node scripts/run-sql.mjs sql/019_event_relationships_updated_at.sql` 成功
- [x] 涓存椂鍚�姩鏈嶅姟楠岃瘉 `/api/v1/dashboard/canonical-events?page=1&limit=3` 杩斿洖骞抽摵鍙�覆鏌撴暟缁�
- [x] 临时�?��服务验证 `/api/v1/dashboard/canonical-events?page=1&limit=3&eventId=18856` 返回 4 条，�?��事件�?���? `focus_included=true`
- [x] 涓存椂鍚�姩鏈嶅姟楠岃瘉 `/api/v1/dashboard/relationships?page=1&limit=3` 杩斿洖 3 鏉″叧绯伙紝鍖呭惈 `relationship_updated_at`锛屽苟鎸夋洿鏂版椂闂村€掑簭
- [!] `npm.cmd test` still fails before business assertions because Node test runner cannot spawn child test files in this Windows environment (`spawn EPERM`).

### 2026-05-14 知识图谱展示界面 (Hermes 方案)

- **任务内容**: 增加关系层知识图谱展示界面，支持节点展开显示内部关系簇。
- **技术实现**: 
    - 引入 **Sigma.js v2** 和 **Graphology** 实现 WebGL 高性能渲染。
    - 新建 knowledge-graph.html，实现基于 LOD 的层次化展示逻辑。
    - 初始状态加载 Story Clusters (L5)，点击展开显示 Events (L3) 及其关系 (L4)。
    - 复用现有的 /api/v1/dashboard/relationships/clusters 和 /subgraph 接口。
- **关键代码**: 
    (已在 knowledge-graph.html 中实现渲染与展开逻辑)
- **验证**: 确认 WebGL 渲染正常，节点展开逻辑平滑，Inspector 联动准确。

