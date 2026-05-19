# 浜嬩欢鏃堕棿绾垮紩鎿� - 寮€鍙戞棩璁� (Develop Diary)

## 2026-05-14 - 鍘熷瓙鍏崇郴鍥� Summary-First 鎵瑰�鐞嗗洖濉�笌闃舵�鍖栨墽琛屼慨澶�

### 鑳屾櫙涓庣洰鏍�
鏈�疆缁х画閲嶆瀯鍘熷瓙鍏崇郴鍥剧殑鏂板啓鍏ヤ笌鍥炲～閾捐矾锛氫笉鍐嶉€氳繃鏍囧噯浜嬩欢灞傝仛绫诲悗寤虹珛鍏崇郴锛岃€屾槸璁� `proto_events` 鍏堝綊灞炲埌 `relationship_summaries` 鍏崇郴灞傝妭鐐癸紝鍐嶇敱鍚庡彴浠诲姟鍦� summary 鍐呴儴鏋勫缓 `atomic_event_relationships` 鍘熷瓙浜嬩欢杈广€�

### 涓轰粈涔堟媶鎴愬�涓�樁娈�
鎷嗛樁娈典笉鏄�负浜嗗�鍔犳祦绋嬪�鏉傚害锛岃€屾槸涓轰簡鎶娾€滃揩閫熷綊灞炩€濃€滃叧绯诲眰鍚堝苟鈥濃€滅粏绮掑害鍘熷瓙杈硅�绠椻€濊В鑰︼紝閬垮厤鍏ㄥ簱涓や袱姣旇緝锛屼篃閬垮厤鍦� summary 灏氭湭绋冲畾鏃堕噸澶嶆瀯杈广€�

1. **Phase 1锛欱atch 鍐呰仛绫� + Summary 褰掑睘**
   - 鎸変簨浠舵椂闂存帓搴忥紝姣忔壒榛樿� `500` 鏉� proto銆�
   - batch 鍐呭彧鍋氬唴瀛樹复鏃惰仛绫伙紝鑱氱被缁撴灉涓嶈惤搴撱€佷笉鎴愪负鍥捐妭鐐广€�
   - 鑱氱被鍙�敤浜庡噺灏� summary 鍙�洖娆℃暟锛涙渶缁堜粛鐒舵槸姣忎釜 `proto_event` 浣滀负鍘熷瓙鑺傜偣鍔犲叆 summary銆�
   - 濡傛灉 cluster 鍛戒腑宸叉湁 active `kind:%` summary锛屽垯灏� proto 缁戝畾鍒板懡涓�殑 summary銆�
   - 濡傛灉 cluster 娌℃湁鍛戒腑 summary锛屽崟鎴愬憳鍒涘缓 `isolated` summary锛屽�鎴愬憳鍒涘缓涓€涓�湡瀹� relationship summary銆�
   - 鏈�樁娈电洰鏍囨槸蹇�細鍙�缓绔� summary/member 鍜屽繀瑕佺殑 merge job锛屼笉鍋氶噸鐨勫師瀛愯竟涓や袱璁＄畻銆�

2. **Phase 1.5锛歋ummary Merge**
   - 褰撳悓涓€涓� proto 鎴栧悓涓€涓� cluster 鍚屾椂鍛戒腑澶氫釜 summary锛岃�鏄庤繖浜� summary 涔嬮棿琚�柊璇佹嵁妗ユ帴璧锋潵浜嗐€�
   - 姝ゆ椂涓嶈兘闀挎湡璁╀竴涓� proto 澶氭寕澶氫釜鍏崇郴鑺傜偣锛屽惁鍒欏叧绯诲眰浼氳秺鏉ヨ秺纰庛€�
   - 閫氳繃 `summary_merge` job 閫夋嫨 canonical summary锛屽苟鎶婂叾瀹� summary 鐨� members/edges 鍘婚噸杩佺Щ杩囧幓銆�
   - 琚�悎骞剁殑 summary 浣跨敤杞�悎骞讹細`summary_status='merged'`銆乣merged_into_summary_id=<canonical>`锛屼笉鐗╃悊鍒犻櫎锛屼究浜庡�璁″拰璺宠浆銆�
   - 杩欎釜闃舵�蹇呴』鏃╀簬 full detail rebuild锛屽惁鍒欎細鍏堝湪鍗冲皢琚�悎骞剁殑 summary 鍐呴噸澶嶆瀯杈癸紝娴�垂澶ч噺璁＄畻銆�

3. **Phase 2锛欴etail Job 鍏ラ槦**
   - summary 褰掑睘鍜� merge 瀹屾垚鍚庯紝active summary 闆嗗悎宸茬粡鐩稿�绋冲畾銆�
   - 瀵规瘡涓� active v2 summary 鍏ラ槦涓€涓� full detail job銆�
   - 鍏ラ槦闃舵�鍙�垱寤轰换鍔★紝涓嶇洿鎺ラ樆濉炰富娴佺▼鍋氳竟璁＄畻銆�

4. **Phase 3锛欴rain Detail Jobs锛堝彲閫夛級**
   - 濡傛灉鑴氭湰甯� `--drain-details`锛屽垯鍚屾�娑堣垂 detail job銆�
   - detail job 鍙�湪 summary 鍐呴儴瀵规垚鍛� proto 鍋氳�缁嗗叧绯诲垎鏋愶紝upsert `atomic_event_relationships`锛屽苟鍒锋柊 summary 鐨� `member_count`銆乣edge_count`銆乣avg_confidence`銆佹椂闂磋寖鍥寸瓑缁熻�銆�
   - 瀹炴椂鐢熶骇閾捐矾涓嶇瓑寰呰繖涓�樁娈靛畬鎴愶紱鏂伴椈瑙ｆ瀽淇濆瓨 proto 鍚庡厛杩涘叆 batch assignment queue锛岀敱鍚庡彴 worker 寮傛�褰掑睘鍜屾瀯杈广€�

### 鏍稿績鍘熺悊
- **Summary-first**锛氬厛鍒ゆ柇鏂板師瀛愪簨浠舵槸鍚﹀睘浜庢煇涓�叧绯诲眰鑺傜偣锛屽啀鍦ㄥ懡涓�殑 summary 鍐呴儴缁嗙畻鍘熷瓙杈广€�
- **Batch 棰勭瓫閫�**锛歜atch 鍐呰仛绫诲彧鍋氬€欓€夊彫鍥炰紭鍖栵紝涓嶆浛浠ｅ師瀛愪簨浠惰妭鐐癸紝涔熶笉钀藉簱銆�
- **鍏崇郴灞傚悎骞�**锛氫竴涓� proto 鍚屾椂妗ユ帴澶氫釜 summary 鏃讹紝浼樺厛鍚堝苟 summary锛屽噺灏戝叧绯诲眰纰庣墖鍖栥€�
- **寮傛�缁嗙畻**锛氬師瀛愯竟鏋勫缓鏀惧叆 `relationship_summary_jobs`锛岄伩鍏嶅叆搴撹�姹傝�閲嶈�绠楅樆濉炪€�
- **鍙�仮澶嶅洖濉�**锛歅hase 1 瀹屾垚鍚庡�鏋� Phase 1.5/Phase 2 澶辫触锛屽彲浠ョ敤 resume 鍙傛暟缁х画锛屼笉蹇呴噸璺戝凡缁忚€楁椂瀹屾垚鐨� summary 褰掑睘銆�

### 鏈��淇�敼璁板綍
- **淇�� merge job 鍙傛暟绫诲瀷閿欒�**锛歚lib/db/relationship-summary-queries.mjs` 涓� summary job銆乵erge銆乻tats銆乬raph 鏌ヨ�鐩稿叧 SQL 鍙傛暟琛ュ厖鏄惧紡 cast锛屼緥濡� `$1::int`銆乣$2::text`銆乣$4::jsonb`锛岃В鍐� PostgreSQL 鎶ラ敊鈥滄棤娉曠‘瀹氬弬鏁� $1 鐨勬暟鎹�被鍨嬧€濄€�
- **琛ラ綈澶辫触浠诲姟鎭㈠�**锛氭柊澧�/淇濈暀 `resetFailedRelationshipSummaryJobs()`锛屾敮鎸佸皢 failed job 閲嶇疆涓� pending锛岄厤鍚堥噸寤鸿剼鏈�户缁�秷璐广€�
- **琛ラ綈 Phase 1 鍚庢仮澶嶅弬鏁�**锛歚scripts/rebuild-atomic-relationship-graph.mjs` 鏀�寔 `--resume-after-phase1` 璺宠繃宸插畬鎴愮殑 summary assignment锛屽苟鏀�寔 `--reset-failed-jobs` 閲嶇疆澶辫触鐨� summary jobs銆�
- **閬垮厤璇�搷浣�**锛歚--resume-after-phase1` 绂佹�涓� `--full` 鍚屾椂浣跨敤锛岄槻姝㈡仮澶嶆椂璇�竻绌哄凡瀹屾垚鐨� Phase 1 鏁版嵁銆�
- **缁熶竴 batch 榛樿�鍊�**锛歚rebuild-atomic-relationship-graph.mjs` 榛樿� batch size 璋冩暣涓� `500`锛屼笌瀹炴椂 batch assignment worker 鍜� backfill 鑴氭湰淇濇寔涓€鑷淬€�
- **楠岃瘉缁撴灉**锛氬凡閫氳繃 `node --check` 妫€鏌� `relationship-summary-queries`銆乣rebuild-atomic-relationship-graph`銆乣relationship-summary-manager`锛涘苟閫氳繃 `relationship-summary-manager.test.mjs` 涓� `batch-event-clusterer.test.mjs` 鍗曟祴銆�

### 褰撳墠鎺ㄨ崘鎭㈠�鍛戒护
Phase 1 宸插畬鎴愪絾 Phase 1.5 merge job 鍥� SQL 鍙傛暟绫诲瀷澶辫触鏃讹紝涓嶉渶瑕侀噸鏂� `--full`銆傛帹鑽愭墽琛岋細

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

濡傞渶瀹氫綅鍗曚釜澶辫触 job锛屽彲涓存椂闄嶄綆骞跺彂鎵归噺锛�

```powershell
npm.cmd run rebuild-atomic-graph -- --resume-after-phase1 --reset-failed-jobs --drain-details --job-batch-size 1
```

## 2026-05-06 - LLM 瑙ｆ瀽鍣ㄤ笁闃舵�閲嶆瀯锛氬疄浣�/鍔ㄤ綔褰掍竴鍖� + 灞傜骇鏀�寔

### 鏈�疆鐩�爣 (LLM Parser Three-Stage Refactor: Normalization + Hierarchy)
鏀硅繘 LLM 瑙ｆ瀽鍣�紝浣垮叾鑳藉�锛�
1. 鎻愬彇鎵€鏈変簨浠躲€佸疄浣撱€佸姩浣滐紝涓嶉仐婕�
2. 鍒╃敤 LLM 杩涜�瀹炰綋/鍔ㄤ綔褰掍竴鍖栧垽鏂�紝鑰岄潪纭�紪鐮佹槧灏�
3. 璇嗗埆瀹炰綋灞傜骇鍏崇郴锛堝�"缇庡浗鍥介槻閮�"鎸傚湪缇庡浗涓嬶級
4. 缁撴瀯鍖栬緭鍑猴紝鐩存帴鍙�敤浜庡悗缁�唬鐮佹墽琛岋紙浼� agent 妯″紡锛�
5. 淇濇寔 LLM 鍜屼紶缁熸柟娉曠殑闅旂�

### 闂��鍒嗘瀽璁板綍
1. **鎻愮ず璇嶄笉澶熸槑纭�**锛�"蹇界暐璇勮�銆侀�娴嬨€佽�鐐广€佽�鍒�"杩囦簬绮楁毚锛屽�"鐗规湕鏅�壒璇勬煇鏀跨瓥"鏈�韩鏄�簨浠讹紝"瀹ｅ竷涓€鍛ㄥ悗瀵硅瘽"涔熸槸浜嬩欢锛堝彧鏄�爣璁颁负 future锛�
2. **澶嶅悎鍔ㄤ綔婕忔彁鍙�**锛�"瀹ｅ竷鍑哄敭姝﹀櫒"鏄�竴涓�姩浣滆繕鏄�袱涓�紵锛堝�甯� + 鍑哄敭锛夊簲璇ユ媶鍒�
3. **澶氬�浣撴紡鎻愬彇**锛�"鍚戝彴婀惧拰鏃ユ湰鍑哄敭姝﹀櫒"搴旇�鎷嗘垚涓や釜浜嬩欢
4. **妯＄硦鎸囦唬鏈�В鏋�**锛�"鍙屾柟"搴旇�杩樺師涓哄叿浣撳浗瀹跺悕
5. **鍏抽敭鏁板€兼湭鎻愬彇**锛氶噾棰濓紙10浜跨編鍏冿級銆佸箙搴︼紙25涓�熀鐐癸級绛夋湭缁撴瀯鍖栨彁鍙�
6. **纭�紪鐮佹槧灏勮啫鑳€ prompt**锛氱粰 LLM 濉炲嚑鍗佹潯瀹炰綋鏄犲皠琛ㄤ細闄嶄綆鎬ц兘
7. **瀹炰綋鏃犲眰绾�**锛氭病鏈� parent_entity 姒傚康锛�"缇庡浗鍥介槻閮�"鍜岀編鍥芥槸鍒嗙�鐨�

### 瑙ｅ喅鏂规�锛氫笁闃舵� LLM Pipeline

```
鏂伴椈杈撳叆
  鈹�
  鈻�
Stage 1: 浜嬩欢鎻愬彇锛�1娆¤皟鐢�級鈫� 杈撳嚭鍘熷� actors/action/objects
        鈹�
        鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹�
        鈻�                                      鈻�
Stage 2a: 瀹炰綋褰掍竴鍖栵紙1娆¤皟鐢�級     Stage 2b: 鍔ㄤ綔褰掍竴鍖栵紙1娆¤皟鐢�級
        鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹�
                        鈹�
                        鈻�
                Stage 3: 缁撴灉鍚堝苟锛堢函浠ｇ爜锛�
```

### 淇�敼鍐呭�璁板綍

#### 1. 閰嶇疆鎵╁厖 ([lib/config/event-taxonomy.mjs](lib/config/event-taxonomy.mjs))
- 鏂板� `ENTITY_TYPES` 鏋氫妇锛�8 绉嶅疄浣撶被鍨嬶級
- 鎵╁睍 `ACTION_TAXONOMY`锛氭柊澧� MILITARY_DETAIL锛坰ell_weapons锛夈€乀RADE锛坕mport/export锛夈€丯EGOTIATE锛坣egotiate锛�
- 鏂板� `ACTION_SYNONYM_MAP`锛堝姩浣滃悓涔夎瘝鏄犲皠锛屽厹搴曠敤锛�
- 鏂板� `getEntityHierarchyRulesText()`锛堜緵 LLM prompt 浣跨敤锛�

#### 2. 鏁版嵁搴撹縼绉� ([sql/011_entity_hierarchy.sql](sql/011_entity_hierarchy.sql)) [NEW]
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
- 鏀�寔缂撳瓨閬垮厤鍚屼竴 raw_name 閲嶅�璋冪敤 LLM
- DB 鏉冨▉浼樺厛锛歟ntity_mapping 宸叉湁鏃剁敤 DB 鐨勶紝LLM 鐨勪綔涓哄弬鑰�

#### 5. LLM 瑙ｆ瀽鍣ㄩ噸鍐� ([apis/parsers/llm-parser.mjs](apis/parsers/llm-parser.mjs)) 鈥� 涓夐樁娈垫灦鏋�

**Stage 1 Prompt 鍏抽敭璁捐�**锛�
- 浜嬩欢瀹氫箟鏄庣‘锛氬０鏄�/鎵硅瘎/琛ㄦ€佹湰韬�槸浜嬩欢锛沠uture 浜嬩欢涔熸彁鍙栦絾鏍囪� temporal_status
- 澶嶅悎鍔ㄤ綔蹇呴』鎷嗗垎锛�"瀹ｅ竷鍑哄敭"鈫� "瀹ｅ竷" + "鍑哄敭"锛�
- 澶氬�浣撳繀椤诲睍寮€锛�"鍚慉鍜孊鍑哄敭"鈫� 涓や釜浜嬩欢锛�
- 妯＄硦鎸囦唬蹇呴』杩樺師锛�"鍙屾柟"鈫� 鍏蜂綋鍥藉�鍚嶏級
- 鍏抽敭鏁板€兼彁鍙栧埌 details 瀛楁�

**Stage 1 杈撳嚭**锛�
```json
{
  "events": [{
    "actors": ["缇庡浗鍥介槻閮�"],
    "action": "鍑哄敭",
    "objects": ["姝﹀櫒瑁呭�"],
    "details": {"閲戦�": "10浜跨編鍏�", "鐩�殑鍦�": "鍙版咕"},
    "temporal_status": "past",
    "evidence_snippet": "鍘熸枃涓�敮鎾戞�浜嬩欢鐨勫彞瀛�"
  }]
}
```

**Stage 2a Prompt**锛氬疄浣撳綊涓€鍖�
- 杈撳叆锛氬幓閲嶅悗鐨勫疄浣撳垪琛�
- 杈撳嚭锛歿 raw_name, canonical_name, entity_type, parent_entity, confidence }
- 灞傜骇瑙勫垯锛氬浗瀹朵笅灞炴満鏋� parent_entity 濉�浗瀹跺悕

**Stage 2b Prompt**锛氬姩浣滃綊涓€鍖�
- 杈撳叆锛氬幓閲嶅悗鐨勫姩浣滃垪琛�
- 杈撳嚭锛歿 raw_action, normalized_action, action_category, is_standard_match }

**骞惰�璋冪敤**锛歋tage 2a 鍜� 2b 鐢� `Promise.all()` 骞惰�鎵ц�

#### 6. 鍚庡�鐞嗘ā鍧楀�寮� ([lib/pipeline/post-processing.mjs](lib/pipeline/post-processing.mjs))
- 鏂板� `processLlmProtoEvents()` 鈥� LLM 涓撶敤鍚庡�鐞嗭紝淇′换 LLM 褰掍竴鍖栫粨鏋�
- 鐜版湁 `processProtoEvents()` 淇濇寔涓嶅彉锛屾湇鍔� enhanced/traditional 瑙ｆ瀽鍣�

#### 7. 瑙ｆ瀽鍣ㄩ€夋嫨鍣ㄦ洿鏂� ([lib/pipeline/parser-selector.mjs](lib/pipeline/parser-selector.mjs))
- LLM 璺�緞璋冪敤 `processLlmProtoEvents()`
- 浼犵粺璺�緞璋冪敤 `processProtoEvents()`

### 楠岃瘉缁撴灉璁板綍

#### 娴嬭瘯鐜��
- 鏂伴椈鏉ユ簮锛歫in10锛堥噸瑕佹€� >= 0.4 鎴栧唴瀹归暱搴� > 300 瀛楃�鐨勬柊闂伙級
- 娴嬭瘯鏂伴椈 3 鏉★細鍥藉彴鍔炲洖搴斻€佸搱濉炵壒閫忛湶鐧藉�AI瀹℃煡銆佸疂鍏夎偂浠藉叕鍛�

#### 涓夐樁娈� LLM 鎻愬彇鏁堟灉

**鏂伴椈 1锛氬浗鍙板姙鍥炲簲鍙颁紒涓庨�鏂囩兢"鍒囧壊"**
- Stage 1 鎻愬彇锛�14 涓�師濮嬩簨浠�
- Stage 2a 瀹炰綋褰掍竴鍖栵細15 涓�疄浣�
- Stage 2b 鍔ㄤ綔褰掍竴鍖栵細5 涓�姩浣�
- 鍘婚噸鍚庯紙processLlmProtoEvents锛夛細5 涓� proto-events

**鏂伴椈 2锛氬搱濉炵壒閫忛湶鐧藉�鎷熶负AI妯″瀷寤虹珛瀹℃煡鏈哄埗**
- Stage 1 鎻愬彇锛�14 涓�師濮嬩簨浠�
- Stage 2a 瀹炰綋褰掍竴鍖栵細16 涓�疄浣�
- Stage 2b 鍔ㄤ綔褰掍竴鍖栵細11 涓�姩浣�
- 鍘婚噸鍚庯紙processLlmProtoEvents锛夛細12 涓� proto-events

**鏂伴椈 3锛氬疂鍏夎偂浠芥唉姘斾笟鍔″叕鍛�**
- Stage 1 鎻愬彇锛�3 涓�師濮嬩簨浠�
- Stage 2a 瀹炰綋褰掍竴鍖栵細2 涓�疄浣�
- Stage 2b 鍔ㄤ綔褰掍竴鍖栵細3 涓�姩浣�
- 鍘婚噸鍚庯紙processLlmProtoEvents锛夛細3 涓� proto-events

#### 瀹炰綋褰掍竴鍖栫ず渚嬶紙from Stage 2a锛�
- "缇庡浗鍥藉�缁忔祹濮斿憳浼氫富浠诲搱濉炵壒" 鈫� Hassett (person)
- "瀹濆厜鑲′唤" 鈫� Baoguang Co., Ltd. (company)
- "Anthropic" 鈫� Anthropic (company)
- "鐧藉�" 鈫� The White House (organization)

#### 鍔ㄤ綔褰掍竴鍖栫ず渚嬶紙from Stage 2b锛�
- "姝ｅ湪鐮旂┒" 鈫� UNKNOWN (鏃犳爣鍑嗗尮閰�)
- "瀹ｅ竷" 鈫� announce (STATEMENT)
- "price_increase" 鈫� price_increase (PRICE)
- "鑷�煡" 鈫� UNKNOWN (鏃犳爣鍑嗗尮閰�)

#### 鍙戠幇鐨勯棶棰�
1. **浜嬩欢杩囧害鎷嗗垎**锛歀LM 灏嗗悓涓€鍙ヨ瘽鎷嗘垚浜嗗�涓�浉浼间簨浠讹紙濡傞檲鏂屽崕鐨� 8 娆� announce 閮芥槸鍏充簬"鍙扮嫭"琛ㄦ€侊級锛屽幓閲嶅悗浠嶆湁澶氫綑
2. **鍔ㄤ綔褰掍竴鍖栦笉瀹屾暣**锛氶儴鍒嗕腑鏂囧姩浣滐紙濡�"姝ｅ湪鐮旂┒"銆�"鎷熷缓绔�"锛夋湭鍖归厤鍒版爣鍑嗗姩浣�
3. **瀹炰綋灞傜骇鏈�寔涔呭寲**锛歋tage 2a 褰掍竴鍖栦簡瀹炰綋浣� entity-normalizer.mjs 灏氭湭琚�畬鏁磋皟鐢ㄦ潵鎸佷箙鍖栧眰绾у叧绯�

#### 浼犵粺瑙ｆ瀽鍣ㄨ矾寰勯獙璇�
- 浼犵粺瑙ｆ瀽鍣ㄨ矾寰勬�甯稿伐浣�
- 杈撳嚭涓� LLM 璺�緞闅旂�锛堜娇鐢� `processProtoEvents` 鑰岄潪 `processLlmProtoEvents`锛�

#### 涓嬩竴姝ユ敼杩涙柟鍚�
1. 浼樺寲 Stage 1 鐨勪簨浠跺悎骞堕€昏緫锛屽噺灏戣繃搴︽媶鍒�
2. 鎵╁ぇ `ACTION_SYNONYM_MAP` 瑕嗙洊鏇村�涓�枃鍔ㄤ綔
3. 瀹屽杽 `entity-normalizer.mjs` 鐨勬寔涔呭寲璋冪敤锛屼娇 entity_mapping 琛ㄧ殑 `parent_entity_id` 姝ｇ‘濉�厖
4. 鑰冭檻鍦� Stage 2b 瀵� UNKNOWN 鍔ㄤ綔杩涜�浜屾� LLM 璋冪敤锛屾彁鍗囧綊涓€鍖栫巼

---

## 2026-04-26 - 涓�嫳鏂� NER 鍒嗙�涓庤嚜閫傚簲璇�█閫夋嫨

### 鏈�疆鐩�爣 (Chinese/English NER Separation + Language-Auto-Selection)
灏嗗疄浣撴彁鍙栨媶鍒嗕负涓�嫳鏂囦袱涓�嫭绔� NER 閾捐矾锛屽苟鍦� pipeline/API 灞傚疄鐜版牴鎹��瑷€鑷�€傚簲閫夋嫨瀵瑰簲鐨勮В鏋愬嚱鏁般€傝В鍐充腑鏂囧瓙涓茶�鍖归厤锛堝�"瀵瑰�浜よ皥鍒�"璇�尮閰�"澶栦氦閮�"锛夊拰鑻辨枃 `\b` 璇嶈竟鐣屼笉閫傞厤涓�枃鐨勯棶棰樸€�

### 闂��鍒嗘瀽璁板綍
1. **`\b` 瀵逛腑鏂囨棤鏁�**锛歟ntity-index 鍘熸潵浣跨敤 `\b` 璇嶈竟鐣岋紝瀵逛腑鏂囦笉鐢熸晥锛沗(^|[^涓€-榭縘)WORD([^涓€-榭縘|$)` 鍦ㄨ繛缁�腑鏂囨枃鏈�腑涔熸棤娉曟垚绔嬶紙璇嶉棿鏃犲ぉ鐒跺垎闅旓級
2. **涓�枃 NER 闇€瑕佺嫭绔嬫柟妗�**锛氬弬鑰� FinceptTerminal 鐨勫唴缃�瓧鍏� + 璐�績鏈€闀垮尮閰嶆柟寮�
3. **鑻辨枃 NER 鍙傝€� worldmonitor**锛欸azetteer 鏈€闀跨煭璇�尮閰� + 鍒嗗眰缃�俊搴︼紙alias 0.95/0.85, keyword 0.70, substring 0.50锛�

### 淇�敼鍐呭�璁板綍

#### 1. 瀹炰綋鏁版嵁搴撳�寮� ([lib/entities/entity-database.mjs](lib/entities/entity-database.mjs))
- **鏂板� `keywords` 瀛楁�**锛氫负鍏抽敭瀹炰綋娣诲姞涓婁笅鏂囧叧閿�瘝锛堝� USA 鈫� Washington, White House, Pentagon, American锛�
- **鎵╁厖鍥藉�**锛欰ustralia, Brazil, Canada, Italy, Spain, Poland, Pakistan, South Africa
- **鎵╁厖鍩庡競**锛歅aris, Berlin, Rome, Brussels, Seoul, Taipei, Hong Kong
- **鎵╁厖缁勭粐**锛欰SEAN, G7, G20
- **鏂板� regions**锛氬崡娴枫€佸彴娴枫€佹尝鏂�咕銆佺孩娴枫€侀粦娴�
- **琛ュ厖涓�枃鍒�悕**锛氱編鍥� 鈫� "缇庢柟"/"鍗庣洓椤�"锛屼腑鍥� 鈫� "涓�柟"/"鍖椾含" 绛�

#### 2. 瀹炰綋绱㈠紩閲嶅啓 ([lib/entities/entity-index.mjs](lib/entities/entity-index.mjs)) 鈥� 鑻辨枃 NER 寮曟搸
- **杈圭晫鍖归厤**锛氳嫳鏂囦娇鐢� `\b` 璇嶈竟鐣岋紝涓�枃浣跨敤 `includes()`锛堣瘝鍏稿疄浣撳凡绮鹃€夛紝鏃犻渶棰濆�杈圭晫锛�
- **鍒嗗眰缃�俊搴�**锛歟xact 闀垮悕 0.95 / 鐭�悕 0.85 / keyword 0.70 / substring 0.50
- **璐�績鏈€闀跨煭璇�**锛氬埆鍚嶆寜闀垮害闄嶅簭鎺掑垪锛屼紭鍏堝尮閰嶉暱鐭��
- **鍏抽敭璇嶇储寮�**锛氭柊澧炲�瀹炰綋 `keywords` 瀛楁�鐨勭储寮曟敮鎸�
- **瀵煎嚭鍑芥暟淇濇寔涓嶅彉**锛歚extractEntities()`, `extractEntitiesByCategory()`, `groupEntitiesByType()` 绛惧悕鍜岃繑鍥炵被鍨嬩竴鑷�

#### 3. 瑙ｆ瀽鍣ㄦ媶鍒� ([apis/parsers/enhanced-parser.mjs](apis/parsers/enhanced-parser.mjs))
- **鏂板� `parseChineseNews(title, content)`**锛氬唴缃�腑鏂囧疄浣撹瘝鍏� + `includes` 鍖归厤 + 璐�績鏈€闀跨煭璇�尮閰嶏紙鍙傝€� FinceptTerminal 鍐呯疆瀛楀吀鏂瑰紡锛�
- **鏂板� `parseEnglishNews(title, content)`**锛氳皟鐢� entity-index + 杈圭晫鍖归厤 + 鍒嗗眰缃�俊搴︼紙鍙傝€� worldmonitor Gazetteer锛�
- **淇濈暀 `extractProtoEventsEnhanced()`**锛氬悜鍚庡吋瀹瑰埆鍚嶏紝榛樿�璋冪敤 `parseEnglishNews()`
- **鍒犻櫎鍐椾綑浠ｇ爜**锛氱Щ闄ょ‖缂栫爜涓�枃璇嶅吀鎻愬彇鍜屽悎骞堕€昏緫
- **杈撳嚭缁撴瀯涓嶅彉**锛氫繚鎸� `proto_events` 鏁扮粍鏍煎紡锛屼笉褰卞搷鏁版嵁搴撳瓨鍌�

#### 4. Pipeline 鑷�€傚簲璇�█閫夋嫨 ([lib/pipeline/parser-selector.mjs](lib/pipeline/parser-selector.mjs))
- **鏂板� `detectLanguage()`**锛氫紭鍏堜娇鐢� `options.lang` 瀛楁�锛屾湭鎻愪緵鍒欓€氳繃涓�枃瀛楃�鍗犳瘮鑷�姩妫€娴嬶紙>30% 涓�枃瀛楃�鍒ゅ畾涓轰腑鏂囷級
- **鑷�姩璺�敱**锛歚detectLanguage()` 鈫� `zh` 閫� `parseChineseNews()` / `en` 閫� `parseEnglishNews()`

#### 5. Pipeline 鍜� API 鏇存柊
- `lib/pipeline/news-pipeline.mjs`锛氬皢 `lang` 浼犻€掔粰 `extractWithSelectedParser()`
- `api/v1/news.mjs`锛氫袱澶勮皟鐢ㄦ牴鎹� `news.lang` 鎴栬�姹備綋 `lang` 閫夋嫨
- `api/v1/admin.mjs`锛氫袱澶勮皟鐢ㄦ牴鎹� `news.lang` 閫夋嫨

### 楠岃瘉缁撴灉璁板綍
- **entity-index**锛氭�纭�尮閰� "浼婃湕"锛�85%锛夈€�"澶栦氦閮ㄥ０鏄�"锛�85%锛夈€�"US sanctions Russia"锛�95%锛�
- **闃茶�鍖归厤**锛�"瀵瑰�浜よ皥鍒よ繘琛屼腑" 涓嶅尮閰�"澶栦氦閮�" 鉁咃紱"Jerome Powell speaks" 涓嶅尮閰�"rome" 鉁�
- **涓�枃鍘婚噸**锛�"鍟嗗姟閮ㄥ�甯冩柊鏀跨瓥" 浠呰繑鍥炰竴涓�"鍟嗗姟閮�"瀹炰綋锛屼笉閲嶅� 鉁�
- **pipeline**锛歚parser-selector.mjs` 璇�█妫€娴嬮€昏緫姝ｅ父宸ヤ綔锛屼腑鑻辨枃鑷�姩璺�敱
- **鐜版湁娴嬭瘯**锛歚test/test-entity-fix.mjs` 鍏ㄩ儴閫氳繃

## 2026-04-24 - 鏂伴椈鍘婚噸閾捐矾淇��涓� GDELT 澧為噺娴佸紡鏀归€�

### 鏈�疆鐩�爣 (Dedup + Incremental Streaming)
瑙ｅ喅鈥滈噸澶嶆姄鍙栧�鑷撮噸澶嶈В鏋愩€佸唴瀛樺崰鐢ㄥ亸楂樸€佷复鏃舵枃浠舵竻鐞嗘粸鍚庘€濈殑闂��銆傞噸鐐瑰皢鏂伴椈鍐欏叆閾捐矾鍗囩骇涓哄墠缃�煡閲� + 鍘熷瓙 upsert锛屽苟鎶� GDELT 閲囬泦鏀归€犳垚澧為噺鎰熺煡涓庢祦寮忓�鐞嗐€�

### 闂��鍒嗘瀽璁板綍
1. **閲嶅�瑙ｆ瀽闂��**锛氬師閾捐矾涓�悇 source 浼氬厛鎵ц�瑙ｆ瀽鍣�紝鍐嶅湪 `ingest` 闃舵�鍒ゆ柇鏂伴椈鏄�惁宸插瓨鍦�紝瀵艰嚧閲嶅�鏂伴椈浠嶄細瑙﹀彂瑙ｆ瀽涓庡悗缁��鐞嗐€�
2. **鍐欏叆骞跺彂绐楀彛**锛歚news` 鍘婚噸铏芥湁 `UNIQUE(source, source_url)`锛屼絾浠ｇ爜灞傛槸鈥滃厛鏌ュ悗鍐欌€濓紝瀛樺湪骞跺彂绔炴€佺獥鍙ｃ€�
3. **GDELT 闈炲�閲忎笌鍐呭瓨鏀惧ぇ**锛�
   - 鏃ч€昏緫浠� `masterfilelist` 鍙栭�鏉� export锛屽彲鑳借�鍙栧巻鍙叉枃浠躲€�
   - 瑙ｅ帇鍚庢暣浠� CSV `readFile` 杩涘唴瀛橈紝鍐� `slice(limit)`锛屽紑閿€鍋忛珮銆�
4. **鐘舵€佽�娴嬩笉瀹屾暣**锛歚source_status` 浠呰�褰� `events_fetched`锛岃烦杩囬噺涓庢枃浠剁骇骞傜瓑鐘舵€佷笉鐩磋�銆�

### 淇�敼鍐呭�璁板綍

#### 1. source 灞傗€滆В鏋愬墠鏌ラ噸鈥濈煭璺�
- 淇�敼锛�
  - `apis/sources/rss-news.mjs`
  - `apis/sources/jin10.mjs`
  - `apis/sources/newsminimalist.mjs`
  - `apis/sources/gdelt.mjs`
- 鍦ㄨ皟鐢ㄨВ鏋愬櫒鍓嶅�鍔� `checkNewsExists + isNewsParsed`锛屽懡涓�悗鐩存帴 `skip`锛岄伩鍏嶉噸澶嶆柊闂昏Е鍙戣В鏋愪笌鑱氱被銆�

#### 2. 鏂伴椈鍐欏叆鏀逛负鍘熷瓙 Upsert
- 淇�敼锛歚lib/db/news-queries.mjs`
- 灏� `upsertNews` 鏀逛负 `INSERT ... ON CONFLICT(source, source_url) DO UPDATE ... RETURNING`銆�
- 鏇存柊绛栫暐浼樺寲锛�
  - `reliability_score` 鍙栬緝楂樺€硷紙閬垮厤琚�綆璐ㄩ噺鏂版暟鎹��鐩栵級銆�
  - `normalized_data` 浣跨敤 JSONB merge銆�
  - 绌哄瓧绗︿覆涓嶈�鐩栧凡鏈夋湁鏁堝瓧娈点€�

#### 3. GDELT 涓存椂鏂囦欢娓呯悊涓庢祦寮忚�鍙�
- 淇�敼锛歚apis/utils/gdelt-helper.mjs`
- 娓呯悊绛栫暐鏀逛负 `try/finally` 绔嬪嵆鍥炴敹涓存椂鐩�綍锛堟浛浠� `setTimeout` 寤惰繜鍒犻櫎锛夈€�
- 鏂板�锛�
  - `getLatestGDELTExportInfo()`锛氫紭鍏堣�鍙� `lastupdate.txt`锛屽け璐ュ啀鍥為€€ `masterfilelist`銆�
  - `streamLatestGDELTLines(limit, onLine)`锛氳В鍘嬪悗鎸夎�娴佸紡璇诲彇 CSV锛屼粎澶勭悊鍓� `limit` 琛屻€�

#### 4. GDELT 鏂囦欢绾у箓绛変笌鐘舵€佽拷韪�
- 淇�敼锛歚apis/sources/gdelt.mjs`
- 鏂板�鈥滄枃浠剁骇 marker 骞傜瓑璺宠繃鈥濓細鍚屼竴 export 鏂囦欢宸插�鐞嗘椂鏁磋疆璺宠繃銆�
- `source_status` 澧炲姞骞朵娇鐢�細
  - `last_processed_marker`锛堟枃浠跺悕绾у箓绛夛級
  - `skipped_count`锛堣烦杩囪�鏁帮級
- 璺宠繃杞��淇濈暀涓婃� `events_fetched`锛屼笉鍐嶉噸缃�负 0銆�

#### 5. SQL 涓庤繍缁磋剼鏈�ˉ鍏�
- 鏂板�锛�
  - `scripts/audit-news-dedup.mjs`锛堥噸澶嶄笌澧為噺宸℃�锛�
  - `sql/cleanup-news-duplicates.sql`锛堝巻鍙查噸澶嶆竻鐞嗭級
  - `sql/006_source_status_marker.sql`
  - `sql/007_source_status_skipped_count.sql`
- 鏇存柊锛�
  - `sql/001_initial_schema.sql`锛歚source_status` 澧炲姞 `last_processed_marker`銆乣skipped_count`

### 楠岃瘉缁撴灉璁板綍
- **鍘婚噸鏁堟灉**锛氬悓绐楀彛涓よ疆閲囬泦锛岀�浜岃疆 `skip` 鏄捐憲涓婂崌锛岄噸澶嶈В鏋愭槑鏄惧噺灏戙€�
- **GDELT 姝ｇ‘鎬�**锛氬凡浠� `lastupdate.txt` 璇诲彇鏈€鏂� export锛堜緥濡� `20260424101500.export.CSV.zip`锛夛紝涓嶅啀璇�彇鍘嗗彶鏂囦欢銆�
- **娴佸紡鏈夋晥鎬�**锛欸DELT 宸叉寜琛屽�鐞嗭紝`linesRead` 涓� `limit` 瀵归綈锛屼笉鍐嶆暣浠� CSV 璇诲叆銆�
- **骞傜瓑楠岃瘉**锛氬悓涓€ export 鏂囦欢绗�簩娆℃墽琛岀洿鎺ュ懡涓� `already-processed-export` 璺宠繃銆�
- **鐘舵€佹寔涔呭寲**锛歚source_status.last_processed_marker` 涓� `skipped_count` 宸插彲鏌ヨ�銆�

---

## 2026-04-24 - 缃戠粶杩炴帴寮傚父鎺掓煡涓� GDELT 鍔╂墜鍋ュ．鎬т紭鍖�

### 鏈�疆鐩�爣 (Network Troubleshooting & GDELT Robustness)
鎺掓煡绯荤粺杩愯�杩囩▼涓�ぇ闈㈢Н鍑虹幇鐨� `ECONNRESET` 閿欒�锛屾秹鍙婇噾鍗佹暟鎹� API銆丟DELT 浠ュ強鏈�湴鏁版嵁搴撹繛鎺ャ€�

### 闂��鍒嗘瀽璁板綍
1. **鐜拌薄**锛歚npm start` 鍚�姩鍚庯紝鎵€鏈夊�閮� API 璇锋眰锛圝in10, NewsMinimalist, GDELT锛夊潎鍦ㄩ噸璇曞悗澶辫触锛屾姤閿� `TypeError: fetch failed` 涓� cause 涓� `read ECONNRESET`銆傚悓鏃舵湰鍦� PostgreSQL 鏁版嵁搴撲篃鍑虹幇鐩稿悓閿欒�銆�
2. **璇婃柇杩囩▼**锛�
   - 缂栧啓 `scratch/diagnose-network.mjs` 娴嬭瘯鑴氭湰銆�
   - 鍙戠幇涓嶄粎鏄� API 鍦板潃锛岃繛 `www.baidu.com` 鍜� `localhost:5432` 鍦� Node.js 鐜��涓嬩篃鍏ㄩ儴瓒呮椂銆�
   - 缁撹�锛氳繖鏄�吀鍨嬬殑**鐜��缃戠粶鏁呴殰**銆傛瀬澶у彲鑳芥槸鐢变簬鏈�湴浠ｇ悊宸ュ叿锛堝� Clash/V2Ray锛夊紑鍚�簡绯荤粺浠ｇ悊浣嗘棤娉曟�甯稿伐浣滐紝瀵艰嚧 Socket 杩炴帴琚�郴缁熷眰绾ч噸缃�€�
3. **浠ｇ爜闅愭偅**锛氬彂鐜� `gdelt-helper.mjs` 缁曡繃浜� `safeFetch` 灏佽�鐩存帴浣跨敤浜嗗叏灞€ `fetch`锛岀己涔忛噸璇曟満鍒躲€�

### 淇�敼鍐呭�璁板綍

#### 1. 浼樺寲 GDELT 鍔╂墜 ([apis/utils/gdelt-helper.mjs](apis/utils/gdelt-helper.mjs))
- **缁熶竴宸ュ叿璋冪敤**锛氬皢鎵€鏈夌洿鎺ヤ娇鐢� `fetch` 鐨勫湴鏂规浛鎹�负 `safeFetch`銆�
- **澧炲己椴佹�鎬�**锛氬埄鐢� `safeFetch` 鑷�甫鐨� 3 娆￠噸璇曟満鍒讹紝搴斿�鐬�椂缃戠粶鎶栧姩銆�

#### 2. 缃戠粶璇婃柇鑴氭湰 ([scratch/diagnose-network.mjs](scratch/diagnose-network.mjs)) [NEW]
- 鎻愪緵浜嗙幆澧冩�娴嬪姛鑳斤紝鍙�墦鍗颁唬鐞嗙幆澧冨彉閲忋€佹祴璇曞�缃戣繛閫氭€у強鏌ヨ� Windows 娉ㄥ唽琛ㄤ腑鐨勭郴缁熶唬鐞嗚�缃�€�

### 楠岃瘉缁撴灉璁板綍
- **浠ｇ爜楠岃瘉**锛歚gdelt-helper.mjs` 宸叉垚鍔熷垏鎹㈣嚦 `safeFetch`銆�
- **鐜��寤鸿�**锛�**纭��鏄�綉缁滅幆澧冮棶棰�**銆傚缓璁�敤鎴锋�鏌ヤ唬鐞嗚蒋浠剁姸鎬佹垨灏濊瘯鍏抽棴绯荤粺浠ｇ悊鍚庨噸鏂拌繍琛屻€�

---

## 2026-04-22 - 淇�� Dashboard 浜嬩欢鍥炬樉绀哄紓甯镐笌鍚嶇О缂哄け闂��

### 鏈�疆鐩�爣 (Fixing Event Graph Display & Missing Names)
瑙ｅ喅 Dashboard 浜嬩欢鍏崇郴鍥句腑鑺傜偣鍚嶇О鏄剧ず涓虹┖銆佸叧绯昏繛绾夸笉鏄剧ず浠ュ強鍚庣� API 鎶� 500 閿欒�鐨勯棶棰樸€傜‘淇濇爣鍑嗕簨浠跺湪鍚勭�鎯呭喌涓嬮兘鑳芥嫢鏈夊叿鏈夋弿杩版€х殑鍚嶇О銆�

### 淇�敼鍐呭�璁板綍

#### 1. 淇��鍚庣� API 閫昏緫 ([api/v1/events.mjs](api/v1/events.mjs))
- **绉婚櫎鍐椾綑浠ｇ爜**锛氬垹闄や簡 `/graph` 鎺ュ彛涓�笉瀹屾暣涓旈敊璇�殑鍐呰仈瀹炵幇閫昏緫銆�
- **璋冪敤灏佽�鍑芥暟**锛氭敼涓虹洿鎺ヨ皟鐢� `getRelationshipGraph` 鏁版嵁搴撹緟鍔╁嚱鏁帮紝纭�繚 `nodes` 鍜� `links` 鏁版嵁瀹屾暣銆�
- **淇��杩愯�鏃堕敊璇�**锛氫慨澶嶄簡鍥� `graph.links` 鏈�畾涔夊�鑷寸殑 `forEach` 宕╂簝锛�500 閿欒�锛夈€�
- **澧炲己鏃ュ織**锛氬湪 API 灞傛坊鍔犱簡鍏抽敭鍙橀噺鎵撳嵃锛屽疄鏃剁洃鎺ц妭鐐瑰悕绉扮殑鍚堟垚缁撴灉銆�

#### 2. 浼樺寲鑺傜偣鍚嶇О鍚堟垚绠楁硶 ([lib/db/event-relationships-queries.mjs](lib/db/event-relationships-queries.mjs))
- **寮曞叆鍏宠仈鏌ヨ�**锛氬湪鑾峰彇鍏崇郴鍥炬暟鎹�椂锛岄€氳繃 `LEFT JOIN` 鍏宠仈 `entity_mapping` 琛�紝鑾峰彇 `actor1_name` 鍜� `location_name`銆�
- **閲嶆瀯涓�枃鍛藉悕閫昏緫**锛氶拡瀵规爣鍑嗕簨浠跺眰绾э紝瀹炵幇浜嗘洿绗﹀悎涓�枃璇�簭鐨勬櫤鑳藉悎鎴愰€昏緫銆�
  - **涓夊厓缁勫悎鎴愪紭鍏�**锛氫紭鍏堟彁鍙� `[涓讳綋][鍔ㄤ綔][瀹�綋]`锛堝�鈥滀紛鏈楄�鍑讳互鑹插垪鈥濓級浣滀负鑺傜偣鍚嶇О銆�
  - **浜嬩欢绫诲瀷璇�箟鍖�**锛氬缓绔嬩簡 `eventTypeMap`锛屽皢 `Fight`, `Protest` 绛夎嫳鏂囨爣绛炬槧灏勪负鈥滃啗浜嬪啿绐佲€濄€佲€滄姉璁�椿鍔ㄢ€濈瓑涓�枃鎻忚堪銆�
  - **缁撴瀯鍖栧厹搴�**锛氳嫢涓夊厓缁勪笉鍏�紝鍒欏悎鎴� `[涓讳綋][鍦扮偣][绫诲瀷]` 鏍煎紡銆�
  - **闀垮害涓庤川閲忚繃婊�**锛氳嚜鍔ㄨ繃婊よ繃鐭�垨鏃犳剰涔夌殑鍚嶇О锛岀‘淇� Dashboard 涓婄殑淇℃伅瀵嗗害銆�
- **鏃ュ織楠岃瘉**锛氬湪鏁版嵁搴撳眰澧炲姞鑺傜偣鍚嶇О鍚堟垚杩囩▼鐨勮�缁� log銆�


### 楠岃瘉缁撴灉璁板綍
- **鍚庣�楠岃瘉**锛氭帶鍒跺彴 log 鏄剧ず鑺傜偣鍚嶇О宸叉�纭�悎鎴愶紝渚嬪� `"Israel Fight @ Gaza Strip"` 鎴� `"Iran Protest"`銆�
- **鍓嶇�楠岃瘉**锛欴ashboard 鍏崇郴鍥捐妭鐐规爣绛句笉鍐嶄负绌猴紝杩炵嚎鍏崇郴姝ｅ父灞曠ず锛屼氦浜掓ā鎬佹�鍔犺浇姝ｅ父銆�

---

## 2026-04-22 - 瀹炵幇L4浜嬩欢鍥� + 浼樺寲鎬佸娍鍒嗘瀽涓�績

### 鏈�疆鐩�爣 (Event Graph & Dashboard Enhancement)
瀹炵幇L4浜嬩欢鍥惧姛鑳斤紝瀹屾垚6灞傛儏鎶ユ灦鏋勭殑鏍稿績涓€鐜�€備紭鍖杁ashboard涓�殑鎬佸娍鍒嗘瀽涓�績锛屽�寮轰簨浠跺叧绯诲彲瑙嗗寲灞曠ず锛岃�鐢ㄦ埛鑳界洿瑙傚湴鐪嬪埌涓嶅悓鏍囧噯浜嬩欢涔嬮棿鐨勫叧鑱斿叧绯汇€�

### 淇�敼鍐呭�璁板綍

#### 1. L4浜嬩欢鍥炬牳蹇冪畻娉曞疄鐜� ([lib/analysis/event-relationship-analyzer.mjs](lib/analysis/event-relationship-analyzer.mjs))
- **缁熶竴澶氱壒寰佽瘎鍒嗗嚱鏁�**锛�
  ```javascript
  score(i,j) =
    0.3 * entity_overlap(i,j)     // 瀹炰綋閲嶅彔锛圝accard鐩镐技搴︼級
  + 0.15 * action_compat(i,j)    // 鍔ㄤ綔鍏煎�鎬ц瘎鍒�
  + 0.25 * semantic_sim(i,j)     // 璇�箟鐩镐技搴︼紙棰勭暀鎺ュ彛锛�
  + 0.2 * temporal_prox(i,j)     // 鏃堕棿鎺ヨ繎搴︼紙鎸囨暟琛板噺锛�
  + 0.1 * spatial_prox(i,j)      // 绌洪棿鎺ヨ繎搴�
  ```
- **鏂板�鍏崇郴绫诲瀷**锛歚temporal`锛堟椂闂磋竟锛夊拰 `sub_event`锛堝瓙浜嬩欢锛夛紝鐜板湪鏀�寔7绉嶅叧绯荤被鍨�
- **浼樺寲鍊欓€夐泦妫€绱�**锛�7澶╂椂闂寸獥 + 瀹炰綋閲嶅彔鍙岄噸杩囨护锛屾彁楂樻�绱㈡晥鐜�
- **澧為噺鍥炬瀯寤�**锛歚updateGraphForNewEvent()` 鍑芥暟锛屾敮鎸佸�閲忔洿鏂帮紝閬垮厤鍏ㄩ噺閲嶇畻
- **鍥惧啀骞宠　**锛歚rebalanceGraph()` 鍑芥暟锛屽畾鏈熸竻鐞嗗急杈癸紙weight < 0.3锛�

#### 2. 澧炲己浜嬩欢鍏崇郴鏌ヨ� ([lib/db/event-relationships-queries.mjs](lib/db/event-relationships-queries.mjs))
- **浼樺寲鑺傜偣鏄剧ず**锛氭爣鍑嗕簨浠剁幇鍦ㄤ娇鐢ㄥ�搴旂殑鍘熷瓙浜嬩欢鏍囬�鏄剧ず锛堜紭鍏堢敤鏂伴椈鏍囬�锛屽惁鍒欑敤actor-action-object缁勫悎锛�
- **娣诲姞鍘熷瓙浜嬩欢鏌ヨ�**锛氬湪 `getRelationshipGraph()` 涓�煡璇㈡瘡涓�爣鍑嗕簨浠跺�搴旂殑鍘熷瓙浜嬩欢锛岀敤浜庣敓鎴愭洿鍙嬪ソ鐨勮妭鐐规爣绛�

#### 3. 澧炲己鐨別vents API ([api/v1/events.mjs](api/v1/events.mjs))
- **鏂板� `/api/v1/events/:id/update-graph`**锛氬�閲忔洿鏂板崟涓�簨浠剁殑浜嬩欢鍥惧叧绯�
- **鏂板� `/api/v1/events/rebalance-graph`**锛氭竻鐞嗗急杈癸紝鎵ц�鍥惧啀骞宠　
- **澧炲己 `/api/v1/events/graph`**锛�
  - 娣诲姞缁熻�鍔熻兘锛堝叧绯荤被鍨嬬粺璁°€佸钩鍧囨潈閲嶃€佺疆淇″害绛夛級
  - 杩斿洖瀹屾暣鐨勫浘缁熻�淇℃伅

#### 4. Dashboard浜嬩欢鍥惧彲瑙嗗寲浼樺寲 ([dashboard/public/scripts/components/graph.js](dashboard/public/scripts/components/graph.js))
- **娣诲姞杈圭被鍨嬪浘渚�**锛氬湪鍥惧乏涓婅�鏄剧ず鎵€鏈�7绉嶅叧绯荤被鍨嬬殑鍥句緥锛堥�鑹� + 鍚嶇О锛�
- **浼樺寲鑺傜偣鏍囩�**锛氳嚜鍔ㄦ埅鏂�暱鏂囨湰锛堟渶澶�15瀛楃�锛夛紝娣诲姞鐪佺暐鍙�
- **娣诲姞杈规爣绛�**锛氬湪杈逛腑闂存樉绀哄叧绯荤被鍨嬪悕绉�
- **鏀�寔鏂板叧绯荤被鍨嬮�鑹�**锛�
  - `temporal`锛堟椂闂磋竟锛夛細绱�壊 `#a55eea`
  - `sub_event`锛堝瓙浜嬩欢锛夛細缁胯壊 `#2ed573`
- **澧炲己鑺傜偣鎮�仠鎻愮ず**锛氭樉绀哄畬鏁寸殑鑺傜偣淇℃伅锛堝悕绉般€佺被鍨嬨€侀噸瑕佹€э級

#### 5. 娴嬭瘯鑴氭湰 ([test/test-event-graph.mjs](test/test-event-graph.mjs))
- **瀹屾暣鍔熻兘楠岃瘉**锛氭祴璇曟墍鏈夎瘎鍒嗗嚱鏁般€佸叧绯绘�娴嬪拰鍥惧垎鏋愬櫒
- **瀹炴満娴嬭瘯**锛氳繛鎺ユ暟鎹�簱锛岄獙璇佺湡瀹炴暟鎹�笅鐨勪簨浠跺浘鍔熻兘

### 7绉嶅叧绯荤被鍨嬭�鏄�
鐜板湪浜嬩欢鍥炬敮鎸佸畬鏁寸殑鍏崇郴绫诲瀷浣撶郴锛�
| 鍏崇郴绫诲瀷 | 棰滆壊 | 鎻忚堪 |
|---------|------|------|
| `parent_child` | 钃濊壊 | 鐖跺瓙灞傜骇鍏崇郴 |
| `cause_effect` | 绾㈣壊 | 鍥犳灉鍏崇郴 |
| `evolution` | 姗欒壊 | 婕斿彉鍏崇郴 |
| `trigger` | 妫曡壊 | 瑙﹀彂鍏崇郴 |
| `temporal` | 绱�壊 | 鏃堕棿鍏堝悗鍏崇郴 猸� 鏂板� |
| `sub_event` | 缁胯壊 | 瀛愪簨浠跺寘鍚�叧绯� 猸� 鏂板� |
| `related` | 闈掕壊 | 涓€鑸�浉鍏冲叧绯� |

### 楠岃瘉缁撴灉璁板綍
- **璇勫垎鍑芥暟楠岃瘉**锛氭墍鏈�5涓�瘎鍒嗙淮搴︽�甯稿伐浣滐紙瀹炰綋閲嶅彔銆佸姩浣滃吋瀹广€佽�涔夌浉浼笺€佹椂闂存帴杩戙€佺┖闂存帴杩戯級
- **鍏崇郴妫€娴嬮獙璇�**锛氭垚鍔熸�娴嬪埌澶氱�鍏崇郴绫诲瀷锛屽寘鎷�柊澧炵殑temporal鍜宻ub_event
- **API鍝嶅簲楠岃瘉**锛氬�寮虹殑graph API姝ｅ父杩斿洖缁熻�淇℃伅鍜屽浘鏁版嵁
- **鍙��鍖栭獙璇�**锛氳竟绫诲瀷鍥句緥姝ｅ父鏄剧ず锛岃妭鐐规爣绛句紭鍖栧悗鏇存竻鏅版槗璇�

---

## 2026-04-21 - 淇��鏁版嵁涓€鑷存€� + 瀹炵幇鍦ㄧ嚎鑱氱被绠楁硶

### 鏈�疆鐩�爣 (Data Consistency & Online Clustering)
淇��鎯呮姤琛€缁熺晫闈㈤噸澶嶅師瀛愪簨浠堕棶棰橈紝閲嶆瀯鏍囧噯浜嬩欢鐢熸垚绠楁硶锛屾敼涓哄熀浜庣浉浼煎害鐨勫湪绾胯仛绫汇€�

### 淇�敼鍐呭�璁板綍

#### 1. 鏁版嵁鍘婚噸涓庡敮涓€鎬х害鏉�
- **SQL鑴氭湰** `sql/clean-proto-events-duplicates.sql`锛氭竻鐞� 385 鏉￠噸澶嶅師瀛愪簨浠�
- **鍞�竴绾︽潫** `uq_proto_event_unique (news_id, actor_raw, action_raw, object_raw)`锛氶槻姝㈡湭鏉ラ噸澶嶆彃鍏�
- **鏌ヨ�淇��** [news-queries.mjs:321](lib/db/news-queries.mjs#L321)锛氫娇鐢� `DISTINCT ON` 鍘婚噸鏌ヨ�

#### 2. 鏂伴椈瑙ｆ瀽鐘舵€佹�鏌�
- **鏂板�鍑芥暟** [news-queries.mjs](lib/db/news-queries.mjs)锛�
  - `isNewsParsed(newsId)` - 妫€鏌ユ柊闂绘槸鍚﹀瓨鍦ㄥ師瀛愪簨浠�
  - `checkNewsExists(source, sourceUrl)` - 閫氳繃鏉ユ簮鍜孶RL妫€鏌ユ柊闂绘槸鍚﹀凡瀛樺湪
- **鍏ュ彛妫€鏌�** [event-ingestion.mjs:14](lib/pipeline/event-ingestion.mjs#L14)锛氳В鏋愬墠妫€鏌ユ柊闂绘槸鍚﹀凡澶勭悊

#### 3. 瀹炴椂鎯呮姤婧愬埛鏂�
- **鑷�姩鍒锋柊** [news-scroll.js:18](dashboard/public/scripts/components/news-scroll.js#L18)锛氭坊鍔� 30 绉掑畾鏃跺埛鏂版満鍒�
- **璧勬簮娓呯悊** [news-scroll.js:556](dashboard/public/scripts/components/news-scroll.js#L556)锛氬湪 destroy() 涓�竻鐞嗗畾鏃跺櫒

#### 4. 鍦ㄧ嚎鑱氱被绠楁硶閲嶆瀯
- **閲嶅啓** [canonical-merger.mjs](lib/analysis/canonical-merger.mjs)锛氬疄鐜版柊鐨勫湪绾胯仛绫荤畻娉�
- **鍊欓€夐€夋嫨**锛氭椂闂寸獥鍙� 卤7 澶� + 瀹炰綋閲嶅彔杩囨护 (Jaccard 鈮� 0.2)
- **鐩镐技搴﹁�绠�**锛�
  ```
  Sim = 0.4 * entityOverlap + 0.3 * actionMatch + 0.3 * timeDecay
  ```
- **鑱氱被绛栫暐**锛氱浉浼煎害 鈮� 0.5 鍚堝苟鍒扮幇鏈変簨浠讹紝鍚﹀垯鍒涘缓鏂颁簨浠�

#### 5. 璺ㄦ柊闂诲幓閲嶇�鐢�
- **绂佺敤** [event-ingestion.mjs:62](lib/pipeline/event-ingestion.mjs#L62)锛氳法鏂伴椈鍘熷瓙浜嬩欢鍘婚噸鏆傛椂绂佺敤锛屾墍鏈夊師瀛愪簨浠堕兘浼氬弬涓庡湪绾胯仛绫�

#### 6. 鏁版嵁搴撲慨澶嶈剼鏈�
- `sql/fix_step1.sql` - 妯＄硦鍖归厤淇��
- `sql/fix_step2.sql` - 鍒涘缓缂哄け浜嬩欢
- `sql/fix_step3.sql` - 鏇存柊鍏宠仈
- `sql/fix_step4.sql` - 淇�� event_news 鍏宠仈

### 楠岃瘉缁撴灉璁板綍
- **鏁版嵁鐘舵€�**锛�337 鏉″師瀛愪簨浠跺叏閮ㄥ叧鑱斿埌鏍囧噯浜嬩欢
- **鍘婚噸鏁堟灉**锛氭暟鎹�簱鍞�竴绾︽潫宸茬敓鏁堬紝鏂版彃鍏ユ暟鎹�嚜鍔ㄥ幓閲�

---

## 2026-04-20 - 鍗囩骇 6 灞傛儏鎶ユ紨杩涙灦鏋� (L1-L6 Architecture)

### 鏈�疆鐩�爣 (Intelligent Evolution)
灏嗙郴缁熶粠绠€鍗曠殑鈥滀簨浠舵彁鍙栧櫒鈥濆崌绾т负鍏峰�鎬佸娍鐮斿垽鑳藉姏鐨勨€滃叚灞傛儏鎶ュ钩鍙扳€濄€傞€氳繃瑙ｈ€﹀師濮嬩簨瀹炰笌鏍囧噯浜嬩欢锛屽紩鍏ュ彊浜嬪瓙鍥句笌鎺ㄦ紨灞傦紝瀹炵幇瀵规儏鎶ョ殑娣卞害澶勭悊涓庢湭鏉ラ�娴嬨€�

### 淇�敼鍐呭�璁板綍

#### 1. 鏋舵瀯鍒嗗眰瀹炵幇 (Decoupling & Evolution)
- **L2 ProtoEvent (鍘熷瓙浜嬩欢灞�)**锛氬紩鍏� `proto_events` 琛�紝瀛樺偍 Who-What-Whom 涓夊厓缁勩€侾arser (LLM & Traditional) 缁熶竴閲嶆瀯涓鸿緭鍑� `proto_events` 鏁扮粍銆�
- **L3 Canonical Event (鏍囧噯浜嬩欢灞�)**锛氬疄鐜� `CanonicalMerger` 鏈嶅姟锛岄€氳繃鍝堝笇鍖归厤涓庢ā绯婂�榻愬皢澶氫釜鍘熷瓙浜嬪疄鍧嶇缉涓虹湡瀹炰笘鐣岀殑鍞�竴浜嬩欢鑺傜偣銆�
- **L5 Story Layer (鍙欎簨灞�)**锛氬疄鐜� `StoryManager`銆傚畠鑳借嚜鍔ㄥ彂鐜� Event Graph 涓�殑寮哄叧鑱斿瓙鍥撅紝灏嗗叾鑱氬悎涓哄彊浜嬶紙Story锛夛紝骞跺姩鎬佽�绠� **Escalation Level (鍗囩骇绛夌骇)**銆�
- **L6 Hypothesis Layer (鎺ㄦ紨灞�)**锛氬疄鐜� `InferenceEngine`銆傚埄鐢� LLM 鍩轰簬 Story 鑳屾櫙鎺ㄦ紨娼滃湪鐨勪笅涓€姝ヤ簨浠讹紙Latent Space锛夛紝骞舵敮鎸佸�鏂板叆搴撲俊鍙风殑瀹炴椂楠岃瘉銆�

#### 2. 娴佹按绾夸笌璋冨害鍣ㄩ噸鏋�
- **鎽勫叆绠￠亾 (`lib/pipeline/event-ingestion.mjs`)**锛氶噸鏋勪负绾ц仈妯″紡銆侫rticle (L1) -> ProtoEvent (L2) -> Canonical Event (L3)銆傛瘡娆℃憚鍏ュ潎瑙﹀彂 L6 鍋囪�楠岃瘉閫昏緫銆�
- **璋冨害涓�灑 (`apis/orchestrator.mjs`)**锛氳仛鍚堜换鍔″崌绾т负鍥涙�璧帮細L4 鍏崇郴鍒嗘瀽 -> L5 鍙欎簨鍚屾� -> L6 鍋囪�鐢熸垚 -> 缁熻�鍒锋柊銆�
- **API 灞傚吋瀹规€т慨澶�**锛氬悓姝ユ洿鏂� `api/v1/events.mjs` 涓� `api/v1/news.mjs`锛屼慨姝ｇ敱浜� Parser 閲嶅懡鍚嶅�鑷寸殑瀵煎叆涓庤皟鐢ㄥ啿绐併€�

#### 3. 鍏抽敭缁勪欢涓庢棩蹇楅獙璇�
- **Parser 缁熶竴鍖�**锛氫紶缁熻В鏋愬櫒涓� LLM 瑙ｆ瀽鍣ㄧ幇鍦ㄥ潎杩斿洖鏍囧噯鍖栫殑鍘熷瓙浜嬪疄缁撴瀯锛屼笉鍐嶅皾璇曞湪瑙ｆ瀽闃舵�瀹屾垚浜嬩欢鍧嶇缉銆�
- **楠岃瘉閫昏緫闂�幆**锛氬湪 `event-ingestion.mjs` 涓��鍏� `inferenceEngine.verifyHypotheses(proto)`锛屽疄鐜扳€滈�娴�-楠岃瘉鈥濈殑闂�幆銆�

### 楠岃瘉缁撴灉璁板綍
- **杩愯�鐘舵€�**锛氶€氳繃 `node server.mjs` 楠岃瘉锛岀郴缁熸垚鍔熷惎鍔ㄤ笖鑳屾櫙 Sweep 浠诲姟骞虫粦杩愯�銆�
- **鏁版嵁娴侀獙璇�**锛氭棩蹇楁樉绀� `[Traditional Parser]` 鎻愬彇鍑� ProtoEvent 鍚庯紝鎴愬姛鐢� `[Ingestion]` 澶勭悊骞惰Е鍙戜簡 `[InferenceEngine]` 鐨勯獙璇侀€昏緫銆�
- **鑱氬悎楠岃瘉**锛歚orchestrator` 鎴愬姛鎵ц� L4-L6 鐨勭骇鑱旇仛鍚堬紝鏈€缁堣緭鍑� `6-Layer aggregation complete`銆�

---

## 2026-04-20 - 浼樺寲瀹炰綋璇嗗埆鍜岃В鏋愬櫒鏀硅繘

### 鏈�疆鐩�爣 (Entity Recognition & Enhanced Parsing)
鎻愬崌涓�枃瀹炰綋璇嗗埆鍑嗙‘鐜囷紝寮曞叆鏇村厛杩涚殑瀹炰綋鏁版嵁搴撳拰澧炲己瑙ｆ瀽鍣�紝瑙ｅ喅瀵规柊瀹炰綋锛堝�"涓囨柉"銆�"浼婃柉鍏板牎"锛夌殑璇嗗埆闂��锛屽苟浼樺寲绯荤粺浣跨敤澧炲己瑙ｆ瀽鍣ㄧ殑閰嶇疆銆�

### 淇�敼鍐呭�璁板綍

#### 1. 瀹炰綋鏁版嵁搴撳�寮� (`lib/entities/entity-database.mjs`)
- **鏂板�浜虹墿瀹炰綋绫诲埆**锛氭坊鍔犱簡 `persons` 绫诲埆锛屽寘鍚� 11 浣嶅叏鐞冮噸瑕佹斂娌讳汉鐗�
- **鏂板�鍩庡競瀹炰綋**锛氭坊鍔犱簡宸村熀鏂�潶涓昏�鍩庡競瀹炰綋锛屽寘鎷�紛鏂�叞鍫°€佸崱鎷夊�銆佹媺鍚堝皵銆佹媺鐡﹀皵鍝佺�
- **瀹炰綋鎬绘暟鎵╁睍**锛氫粠鍘熸潵鐨� 89 涓�疄浣撴墿灞曞埌 101 涓�紝瑕嗙洊鑼冨洿鏇村箍

#### 2. 鏂囨湰瑙勮寖鍖栦紭鍖� (`lib/entities/entity-index.mjs:59-64`)
- **淇��涓�枃鍖归厤闂��**锛氶噸鍐欎簡 `normalizeText` 鍑芥暟锛屼繚鐣欎腑鏂囧瓧绗︼紝閬垮厤鍦ㄨ�鑼冨寲杩囩▼涓��鍒犱腑鏂�
- **瀹炰綋鍖归厤鎻愬崌**锛氭敼杩涗簡瀛楃�瑙勮寖鍖栭€昏緫锛岀‘淇濅腑鏂囧疄浣撹兘澶熸�纭�尮閰�

#### 3. 澧炲己瑙ｆ瀽鍣ㄥ畬鍠� (`apis/parsers/enhanced-parser.mjs`)
- **瀹炰綋鎻愬彇浼樺寲**锛氭敼杩涗簡 `extractChineseEntities`銆乣extractChineseCountries` 绛変腑鏂囧疄浣撹瘑鍒�嚱鏁�
- **涓讳綋/瀹�綋璇嗗埆鏀硅繘**锛氭洿鏂颁簡 `selectActorEnhanced` 鍜� `selectObjectEnhanced` 鍑芥暟锛屽�鍔犱汉鐗╁疄浣撴敮鎸�
- **瀹炰綋绫诲瀷鎵╁睍**锛氭坊鍔犱簡瀵� `personEntities` 鍜� `cityEntities` 鐨勫弬鏁颁紶閫掑拰澶勭悊閫昏緫

#### 4. 鍗虫椂瑙ｆ瀽鎺ュ彛澧炲己 (`api/v1/news.mjs`)
- **鏂板�淇濆瓨閫夐」**锛氫负 `/news/:id/parse` 鎺ュ彛娣诲姞浜� `save` 鍙傛暟锛屾敮鎸佺洿鎺ヤ繚瀛樿В鏋愮粨鏋滃埌鏁版嵁搴�
- **璋冭瘯鏃ュ織浼樺寲**锛氭坊鍔犱簡璇︾粏鐨勮В鏋愯繃绋嬫棩蹇楋紝鏂逛究杩借釜瑙ｆ瀽澶辫触鍘熷洜
- **瑙ｆ瀽鍣ㄩ厤缃�**锛氫繚鎸佸�浼犵粺瑙ｆ瀽鍣ㄧ殑鍏煎�锛屽悓鏃舵敮鎸佷娇鐢ㄥ�寮鸿В鏋愬櫒

#### 5. 绯荤粺榛樿�瑙ｆ瀽鍣ㄨ皟鏁�
- **浜嬩欢鎽勫叆绠￠亾鏀硅繘**锛氫慨鏀逛簡璋冨害鍣ㄩ厤缃�紝浼樺厛浣跨敤澧炲己瑙ｆ瀽鍣�
- **鏁版嵁鏉ユ簮鏇存柊**锛歊SS鏂伴椈婧愩€侀噾鍗佹暟鎹�瓑鏁版嵁婧愮粺涓€浣跨敤澧炲己瑙ｆ瀽鍣�

### 楠岃瘉缁撴灉璁板綍
- **杩愯�鐘舵€�**锛氱郴缁熸�甯稿惎鍔�紝鑳屾櫙浠诲姟骞虫粦杩愯�
- **瀹炰綋璇嗗埆**锛氭垚鍔熻瘑鍒�簡"涓囨柉"銆�"浼婃柉鍏板牎"銆�"浼婃湕"绛変箣鍓嶆棤娉曡瘑鍒�殑瀹炰綋
- **瑙ｆ瀽璐ㄩ噺鎻愬崌**锛氬�寮鸿В鏋愬櫒鍦ㄥ疄浣撹瘑鍒�拰浜嬩欢鎶藉彇鏂归潰琛ㄧ幇浼樹簬浼犵粺瑙ｆ瀽鍣�

---

## 2026-04-19 - 闆嗘垚 Jin10 & NewsMinimalist 鏁版嵁婧愬苟澧炲己涓�枃浼犵粺瑙ｆ瀽

### 鏈�疆鐩�爣 (Interactive Dashboard & Enhanced Extraction)
灏嗙郴缁熶粠鈥滄柊闂绘祦鈥濊浆鍨嬩负鈥滅粨鏋勫寲浜嬩欢鍒嗘瀽涓�績鈥濓紝寮哄寲浜嬩欢-鏂伴椈鐨勫眰绾у睍绀猴紝淇��瀹炰綋璇嗗埆寮遍」锛屽苟鎻愪緵鏁版嵁鏃舵晥鎬т繚闅溿€�

### 淇�敼鍐呭�璁板綍

#### 1. 浼犵粺瑙ｆ瀽鍣ㄦ繁搴﹀�寮� (`apis/parsers/traditional-parser.mjs`)
- **涓�枃瀹炰綋璇嗗埆浼樺寲**锛氭墿灞曚簡鏈烘瀯/鍥藉�鍚庣紑璇嗗埆锛堟柊澧烇細宀涖€佸窞銆佺洘銆佸彿銆佸啗銆侀槦銆佸姙銆佹墍绛夛級锛屽苟灏嗏€滃湡鑰冲叾鈥濄€佲€滀紛鏈椻€濄€佲€滈粠宸村�鈥濈瓑鏍稿績鍦扮紭鏀挎不瀹炰綋鍔犲叆鍏抽敭璇嶅尮閰嶃€�
- **Actor 鎻愬彇閫昏緫閲嶆瀯**锛氬紩鍏ュ熀浜庢爣棰樹笌璋撹�鍔ㄨ瘝浣嶇疆鐨勬帹鏂�満鍒躲€傞拡瀵光€淎锛欱鍛煎悂C鈥濈瓑涓�枃鏂伴椈鏍囬�鏍煎紡杩涜�浜嗙壒娈婂�鐞嗭紝鏄捐憲鎻愬崌浜嗕富銆佸�浣擄紙Actor1/Actor2锛夌殑璇嗗埆鍑嗙‘鐜囥€�

#### 2. Dashboard 浜や簰鑳藉姏鍗囩骇
- **浜嬩欢-鏂伴椈閽诲彇 (Drill-down)**锛�
    - 鏇存柊 `EventList.js`锛屾敮鎸佺偣鍑讳簨浠堕」鍚庡姩鎬佸睍寮€鍏宠仈鏂伴椈鍒楄〃闈㈡澘銆�
    - 瀹炵幇浜嗘柊闂昏�鎯呮煡鐪嬪姛鑳斤紝鐐瑰嚮鍏蜂綋鏂伴椈鍚庨€氳繃妯℃€佹�锛圡odal锛夊睍绀烘�鏂囧叏鏂囧強鍏冩暟鎹�€�
- **淇℃伅棰戠巼涓庡垎绫绘帶鍒�**锛�
    - 淇��浜� `filters.js` 涓�埛鏂伴�鐜囪�缃� UI 琚��鐩栫殑 Bug锛屽苟鎴愬姛鍦� `main.js` 涓�粦瀹氳嚜鍔ㄥ埛鏂伴€昏緫銆�
    - 鏂板�鈥滀富棰橀�鍩� (Topic)鈥濈瓫閫夊櫒锛屾敮鎸佹寜鏀挎不銆佸�浜ゃ€佺粡娴庛€佸啗浜嬬瓑鍒嗙被妫€绱€€�

#### 3. 鏁版嵁瀹屾暣鎬т笌娓呯悊
- **鍥犳灉鑷�叧鑱斾慨澶�**锛氬湪 `event-relationship-analyzer.mjs` 涓�疄鏂戒簡涓ユ牸鐨� ID 鏍￠獙锛屽交搴曡В鍐充簡鈥滄柊闂籄閾炬帴鏂伴椈A鈥濈殑閫昏緫閿欒�銆�
- **鏁版嵁搴撴椂鏁堟€х淮鎶�**锛氬紑鍙戝苟杩愯�浜� `cleanup-old-data.mjs` 鑴氭湰锛屾竻闄や簡 2026-04-19 涔嬪墠鐨勬墍鏈夎繃鏈熶簨浠跺強鍏宠仈鏁版嵁锛岀‘淇� Dashboard 灞曠ず鐨勫潎涓烘渶鏂板姩鎬併€�
- **GDELT 瀹炴椂鍚屾�**锛氶獙璇佸苟鎵撻€氫簡 GDELT 瀹炴椂 CSV 涓嬭浇涓� `tar` 鍛戒护瑙ｅ帇閾捐矾锛屾敮鎸佸叏鐞冧簨浠舵暟鎹�殑灏忔椂绾ф洿鏂般€�

### 楠岃瘉缁撴灉璁板綍
- **瑙ｆ瀽鍑嗙‘鎬�**锛氶拡瀵光€滀縿澶栦氦閮ㄥ懠鍚佸湡鑰冲叾瑕佹眰鍩鸿緟...鈥濈殑鏂伴椈锛屾垚鍔熻瘑鍒�嚭 Actor1 涓衡€滀縿缃楁柉澶栦氦閮ㄢ€濓紝Actor2 涓衡€滃湡鑰冲叾鈥濄€�
- **浜や簰楠岃瘉**锛欴ashboard 鐐瑰嚮浜嬩欢鍚庤兘姝ｇ‘鎷夊彇骞舵樉绀哄叧鑱旂殑 Jin10 蹇��鎴� GDELT 璁板綍锛屾ā鎬佹�灞曠ず姝ｅ父銆�
- **娓呯悊楠岃瘉**锛氳繍琛� `cleanup-old-data.mjs` 鍚庯紝鏁版嵁搴撲粎淇濈暀 2026-04-19 褰撳ぉ鐨勬柊鎶撳彇鏁版嵁锛屾煡璇㈡€ц兘鏄捐憲鎻愬崌銆�
- **鍏崇郴缃戦獙璇�**锛歚A->A` 閿欒�鍦ㄥ叧绯诲浘涓�凡娑堝け銆�

---

## 2026-04-17 - 鎵撻€氫簨浠朵富閾捐矾骞舵帴鍏ョ湡瀹炴柊闂绘�鏂囨姄鍙�

### 鏈�疆鐩�爣
鍥寸粫鈥滄柊闂讳簨浠舵娊鍙� -> 浜嬩欢寤烘ā -> 浜嬩欢鍏崇郴寤烘ā -> 鏃堕棿绾垮睍绀衡€濈殑鐪熷疄鐩�爣锛屽�椤圭洰杩涜�浜嗕袱姝ラ噸鏋勶細

1. 鍏堟墦閫氬悗绔�富閾捐矾锛岀Щ闄ゆ棫 `normalized_events` 璺�緞瀵规牳蹇冨睍绀洪摼璺�殑骞叉壈銆�
2. 鍐嶈ˉ涓婄湡瀹炴柊闂绘帴鍏ヨ兘鍔涳紝閬垮厤缁х画渚濊禆 GDELT 鐨勫崰浣嶅彊杩版枃鏈�€�

### 涓婚摼璺�噸鏋勮�褰�

#### 1. 缁熶竴鍐欏叆妯″瀷
- 鏂板� `lib/pipeline/event-ingestion.mjs`锛屽皢鏂伴椈鎶藉彇缁撴灉鐩存帴鍐欏叆 `events`銆乣news`銆乣event_news`銆乣event_relationships`銆乣event_milestones`銆�
- 閲囬泦娴佺▼涓嶅啀鎶婄粨鏋滃仠鐣欏湪鏃ф爣鍑嗗寲琛�紝鑰屾槸杩涘叆鍙�� API 鍜屽墠绔�洿鎺ユ秷璐圭殑鏂版ā鍨嬨€�
- 浜嬩欢蹇�収銆佸睘鎬у巻鍙层€侀噷绋嬬�鍜屽叧绯诲垎鏋愰兘鍦ㄥ叆搴撻樁娈佃仈鍔ㄦ墽琛屻€�

#### 2. 淇�� API 涓庢煡璇�富閾捐矾
- 淇��浜嬩欢鐩稿叧 API 鐨勮矾鐢遍『搴忋€佹悳绱㈠弬鏁版槧灏勫拰绛涢€夊瓧娈典笉涓€鑷撮棶棰樸€�
- 鏂板�鐪熷疄浜嬩欢鏃堕棿绾挎帴鍙ｅ拰浜嬩欢鍏崇郴鍥炬帴鍙ｏ紝鍓嶇�涓嶅啀渚濊禆闅忔満鍏崇郴鎴栫函缁熻�鎶樼嚎銆�
- 淇�� `orchestrator.mjs` 琚� import 鏃惰嚜鍔ㄨЕ鍙� sweep 鐨勫嵄闄╁壇浣滅敤銆�

#### 3. 鏀归€犲墠绔�睍绀�
- 鏃堕棿绾夸粠鈥滄寜澶╂暟閲忔姌绾库€濆崌绾т负鈥滆秼鍔跨粺璁� + 鐪熷疄浜嬩欢鏃堕棿娴佲€濄€�
- 鍏崇郴鍥惧拰妗戝熀鍥炬敼涓鸿�鍙栫湡瀹炵殑 `event_relationships` 鏁版嵁锛屼笉鍐嶉殢鏈洪€犺竟銆�
- 绛涢€夊櫒鏀逛负鎷夊彇鐪熷疄 actor/location 瀹炰綋閫夐」銆�

#### 4. 楠岃瘉缁撴灉
- `npm test` 宸叉仮澶嶉€氳繃锛屽綋鍓嶆祴璇曠粨鏋滀负 89/89 鍏ㄩ儴閫氳繃銆�

### 涓嬩竴姝ユ帹杩涳細鐪熷疄鏂伴椈婧愭帴鍏�

#### 1. RSS 鏂伴椈婧�
- 鏂板� `apis/sources/rss-news.mjs`锛屾敮鎸侀€氳繃 `RSS_NEWS_FEEDS` 閰嶇疆澶氫釜 RSS/Atom feed銆�
- RSS 婧愭媺鍙栫殑鏄�€滄柊闂绘潯鐩�垪琛� + 鍘熸枃閾炬帴鈥濓紝鑰屼笉鏄�户缁�敓鎴愬崰浣嶄簨浠舵弿杩般€�

#### 2. 姝ｆ枃鎻愬彇
- 鏂板� `apis/utils/rss-parser.mjs` 瑙ｆ瀽 RSS/Atom銆�
- 鏂板� `apis/utils/article-extractor.mjs` 浠庢柊闂� HTML 涓�彁鍙栨爣棰樸€佸彂甯冩椂闂淬€佹�鏂囦笌鎽樿�銆�
- 姝ｆ枃鎻愬彇缁撴灉浼氱洿鎺ラ€佸叆鐜版湁 `traditional-parser` / `llm-parser`锛屼娇鎶藉彇闃舵�鐪熸�鍩轰簬鏂伴椈鏂囨湰銆�

#### 3. 璋冨害鎺ュ叆
- `apis/orchestrator.mjs` 宸叉敞鍐� `rssNews` 婧愩€�
- `config.mjs` 涓� `.env.example` 宸茶ˉ鍏� RSS 閰嶇疆椤癸紝鍚庣画鍙�互鐩存帴閫氳繃鐜��鍙橀噺寮€鍚�湡瀹炴柊闂绘帴鍏ャ€�

### 缁х画鎺ㄨ繘锛氭娊鍙栬瘉鎹�繚鐣欎笌鍏崇郴寤烘ā澧炲己

#### 1. 璇佹嵁涓庢椂闂磋〃杈句繚鐣�
- 澧炲己 `apis/parsers/traditional-parser.mjs`锛岀幇鍦ㄤ細棰濆�鎶藉彇 `trigger_keywords`銆乣evidence_snippets`銆乣time_expressions`銆乣causal_suggestion` 涓� `temporal_status`銆�
- 澧炲己 `apis/parsers/llm-parser.mjs` 鐨勮緭鍑哄崗璁�紝浣� LLM 璺�緞涓庝紶缁熻矾寰勪骇鍑虹浉鍚岀殑璇佹嵁缁撴瀯銆�
- 杩欎簺瀛楁�浼氱粺涓€鍐欏叆 `events.normalized_data` 涓� `news.normalized_data`锛屼笉鍐嶅彧淇濈暀鈥滀簨浠剁被鍨�/鏍囬�/鎻忚堪鈥濊繖绉嶆墎骞崇粨鏋溿€�

#### 2. 鏃堕棿绾块噷绋嬬�澧炲己
- `lib/pipeline/event-ingestion.mjs` 鐜板湪浼氭妸鏂伴椈閲岀殑鍏抽敭鏃堕棿琛ㄨ揪鍚屾�鎴愰�澶� milestone銆�
- 闄や簡浜嬩欢棣栨�鍑虹幇鍜屾柊澧炴洿鏂帮紝鏃堕棿绾胯繕浼氳�褰曗€滄柊闂绘彁鍙婃椂闂寸嚎绱⑩€濓紝渚嬪� `next week`銆乣overnight` 杩欑被琛ㄨ揪銆�

#### 3. 鍏崇郴鍒嗘瀽澧炲己
- `lib/analysis/event-relationship-analyzer.mjs` 鐜板湪浼氳�鍙栦簨浠惰瘉鎹�€佽Е鍙戣瘝鍜屽洜鏋滄彁绀鸿瘝銆�
- 淇��浜嗘柟鍚戞€ч棶棰橈細鏃т簨浠惰Е鍙戞柊浜嬩欢鏃讹紝鍏崇郴鐜板湪浼氭�纭�啓鎴� `old -> new`锛屼笉鍐嶅彧灏濊瘯 `new -> old`銆�
- 鏂板� `trigger` 鍏崇郴妫€娴嬶紝骞惰� `cause_effect` 鏀�寔鍩轰簬璇佹嵁鍙ュ拰鍝嶅簲璇�█鐨勫垽鏂�紝鑰屼笉鍙�緷璧栦簨浠剁被鍨嬬‖缂栫爜銆�

#### 4. 楠岃瘉琛ュ厖
- 鏂板� `test/unit/traditional-parser.test.mjs`锛岄獙璇佽瘉鎹�彞銆佽Е鍙戣瘝銆佹椂闂磋〃杈惧拰鍥犳灉鎻愮ず鎻愬彇銆�
- 鏂板� `test/integration/event-ingestion.test.mjs`锛岄獙璇佽瘉鎹�瓧娈佃兘钀藉簱涓旀椂闂磋〃杈句細鐢熸垚 milestone銆�
- 鎵╁睍 `test/unit/event-relationship-analyzer.test.mjs`锛岄獙璇佽瘉鎹�┍鍔ㄧ殑鍥犳灉/瑙﹀彂鍏崇郴鍜屾柟鍚戞€т慨澶嶃€�

## 2026-04-14 - 淇��浜嬩欢妯″瀷涓� API 瀵煎嚭閿欒�

### 闂��鑳屾櫙
鍦ㄨ繘琛屼簨浠舵ā鍨嬮噸鏋勶紙浠庡崟涓€琛ㄨ浆鍚戜簨浠�-鏂伴椈鍒嗙�鏋舵瀯锛夊悗锛屾墽琛屾暟鎹�縼绉昏剼鏈� `sql/003_events_model_fixed.sql` 鏃跺嚭鐜板瓧娈电己澶遍敊璇�€傚悓鏃讹紝Node.js 鍚庣�鍥犲紩鐢ㄤ笉瀛樺湪鐨勫�鍑哄嚱鏁� `getActiveEvents` 鑰屾棤娉曞惎鍔ㄣ€�

### 淇�敼鍐呭�璁板綍

#### 1. 鏁版嵁搴撴ā鍨嬩慨澶� (`sql/003_events_model_fixed.sql`)
- **瀛楁�琛ュ叏**锛氬湪 `news` 琛ㄤ腑娣诲姞浜� `mentions` 瀛楁�锛岀敤浜庤�褰曞崟绡囨柊闂荤殑鎻愬強娆℃暟銆�
- **鍏宠仈閫昏緫淇��**锛氫慨澶嶄簡浠� `normalized_events` 杩佺Щ鍒� `news` 鐨勯€昏緫銆傜敱浜� `normalized_events` 涓嶅惈 `source_url`锛屾敼鐢� `raw_event_id` 鍏宠仈 `raw_events` 琛ㄨ幏鍙栧師濮嬫潵婧� URL銆�
- **缁熻�閫昏緫浼樺寲**锛氫慨姝ｄ簡 `UPDATE events` 涓�熀浜� `news` 琛� `mentions` 瀛楁�杩涜�姹囨€荤殑閫昏緫銆�

#### 4. 绋冲畾鎬у�寮� (淇��杩囩▼璁板綍)
- 淇�� `orchestrator.mjs` 鎰忓�鍏抽棴鍏变韩鏁版嵁搴撹繛鎺ユ睜瀵艰嚧鐨� API 宕╂簝闂��銆�
- 鍦� `lib/db/connection.mjs` 涓�疄鐜拌繛鎺ユ睜绌哄€艰嚜鍔ㄦ仮澶嶉€昏緫 (Self-healing mechanism)銆�
- 浼樺寲浜嬩欢鏌ヨ� SQL 鍏宠仈閫昏緫锛岀‘淇� ID 鏄犲皠涓嶅尮閰嶆椂渚濈劧鑳介€氳繃鍩虹�瀛楁�灞曠ず鏁版嵁銆�

#### 2. 鍚庣�鏌ヨ�瀵煎嚭 (`lib/db/events-queries.mjs`, `lib/db/event-news-queries.mjs`)
- **鏂板�鍑芥暟**锛�
  - `lib/db/events-queries.mjs`: 瀹炵幇骞跺�鍑轰簡 `getActiveEvents` 鍑芥暟銆�
  - `lib/db/event-news-queries.mjs`: 瀹炵幇骞跺�鍑轰簡 `getNewsForEvent` 鍑芥暟銆�
- **鏌ヨ�鏂瑰紡**锛�
  - `getActiveEvents` 鐩存帴鍒╃敤閲嶆瀯鑴氭湰涓�垱寤虹殑 `active_events` 鐗╁寲瑙嗗浘銆�
  - `getNewsForEvent` 瀹炵幇浜嗗熀浜� `event_news` 鍏宠仈琛ㄧ殑鍒嗛〉鏌ヨ�銆�

#### 3. 鍏抽敭鍙橀噺鎵撳嵃涓庨獙璇�
鍦� `lib/db/events-queries.mjs` 鐨� `getActiveEvents` 涓�彲浠ュ姞鍏ュ�涓� log 浠ヤ究楠岃瘉锛�
```javascript
export async function getActiveEvents() {
  console.log('[DB] Fetching active events from materialized view...');
  const result = await query(sql);
  console.log(`[DB] Found ${result.rows.length} active events`);
  return result.rows;
}
```

### 楠岃瘉鐘舵€�
- [x] API `/api/v1/events/active` 杩斿洖姝ｇ‘鏁版嵁

## 2026-05-08 - 浼樺寲 LLM 涓� NLP 鏈嶅姟瓒呮椂鏈哄埗

### 闂��鑳屾櫙
鐢ㄦ埛鍙嶉�鍦ㄥ�鐞嗗ぇ瑙勬ā瀹炰綋褰掍竴鍖栧拰澶嶆潅鏂伴椈鎻愬彇鏃讹紝绯荤粺棰戠箒鍑虹幇瓒呮椂閿欒�銆傜粡鎺掓煡鍙戠幇锛�
1. `llm-parser.mjs` 涓�殑 `callLLM` 瓒呮椂鏃堕棿锛�120s锛変笉瓒充互搴斿�楂樿礋杞芥儏鍐点€�
2. 搴曞眰 `socks-fetch.mjs` 涓�殑 `execSync` 闄愬埗浜� 35s 鐨勭‖瓒呮椂锛屽�鑷翠笂灞傝�缃�け鏁堛€�

### 淇�敼鍐呭�璁板綍

#### 1. 搴曞眰璇锋眰宸ュ叿浼樺寲 (`lib/utils/socks-fetch.mjs`)
- **鍔ㄦ€佽秴鏃惰�绠�**锛氫慨鏀� `execCmd` 鍑芥暟锛屾牴鎹�笂灞備紶鍏ョ殑 `timeout` 鍔ㄦ€佽�绠� `execSync` 鐨勮秴鏃舵椂闂达紙`timeout + 10s`锛夛紝瑙ｅ喅浜嗗簳灞傝繘绋嬫棭浜庣綉缁滆�姹傝秴鏃剁殑闂��銆�
- **榛樿�鍊兼彁鍗�**锛氬皢 `socksFetch` 鍜� `nativeFetch` 鐨勯粯璁よ秴鏃朵粠 30s 鎻愬崌鑷� 60s銆�

#### 2. LLM 瑙ｆ瀽鍣ㄥ�寮� (`apis/parsers/llm-parser.mjs`)
- **瓒呮椂澧炲姞**锛氬皢 `callLLM` 鐨勮秴鏃舵椂闂翠粠 120s 澧炲姞鍒� **300s (5鍒嗛挓)**锛屼互鏀�寔娣卞害浜嬩欢鎻愬彇鍜屽�闃舵�瀹炰綋澶勭悊銆�

#### 3. NLP 鏈嶅姟浼樺寲 (`apis/parsers/spaCy-client.mjs`)
- **瓒呮椂璋冩暣**锛氬皢鏅�€� NLP 瑙ｆ瀽瓒呮椂浠� 30s 澧炲姞鍒� 60s锛屾壒閲忓�鐞嗕粠 60s 澧炲姞鍒� 120s銆�

#### 4. 鍏抽敭浠ｇ爜鐗囨�
鍦� `lib/utils/socks-fetch.mjs` 涓�疄鐜板�涓嬮€昏緫锛�
```javascript
// 鍔ㄦ€佽�绠楀簳灞傝繘绋嬭秴鏃讹紝鍗曚綅姣��
const execTimeout = (timeout + 10) * 1000;
execCmd(curlArgs, tmpFile, resolve, reject, execTimeout);
```

### 楠岃瘉鐘舵€�
- [x] 淇�敼宸查儴缃诧紝LLM 璇锋眰涓嶅啀鍙� 35s 纭�檺鍒剁害鏉熴€�
- [x] 瀹炰綋褰掍竴鍖栨祦绋嬪湪澶ф壒閲忔暟鎹�笅杩愯�绋冲畾銆�

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

## 2026-05-12 - Relationships 椤甸�灞忓ぇ鏁版嵁鍔犺浇浼樺寲

### 闂��鑳屾櫙
鍏崇郴椤靛姞杞芥參鐨勪富瑕佸師鍥犱笉鏄�悗鍙� sweep 闃诲�锛岃€屾槸棣栧睆璇锋眰妯″瀷杩囬噸锛歚event-relationships.html` 浼氬苟琛屽姞杞藉叧绯绘暟鎹�€佸叏閲� stories銆佸叏閲� pending hypotheses锛屽叾涓� pending hypotheses 杩斿洖浣撴浘杈惧埌鐧� MB 绾э紱鍚屾椂 `/dashboard/relationships` 浼氫负鍏崇郴鍒楄〃鑺傜偣鍔犺浇瀹屾暣 canonical event 璇︽儏锛屽寘鍚�笉闇€瑕侀�灞忔覆鏌撶殑澶� JSON 瀛楁�銆�

### 淇�敼鍐呭�璁板綍

#### 1. 鍏崇郴椤甸�灞忚交杞� (`dashboard/public/event-relationships.html`)
- 棣栧睆 `loadWorkspace` 鏀逛负鍙��姹� `/api/v1/dashboard/relationships` 涓庨�涓�腑蹇冧簨浠跺瓙鍥俱€�
- 绉婚櫎棣栧睆瀵� `/api/v1/intelligence/stories` 涓� `/api/v1/intelligence/hypotheses/pending` 鐨勫叏閲忚�姹傘€�
- stories / hypotheses tab 鏀逛负鍒囨崲鍚庢噿鍔犺浇锛屽垪琛ㄤ娇鐢ㄥ垎椤电姸鎬佺淮鎶ゃ€�
- 鏂板� stories / hypotheses 鍒嗛〉鎸夐挳锛屼繚鐣欑偣鍑� story/hypothesis 鍚庢寜闇€ hydrate story 璇︽儏鐨勪氦浜掋€�

#### 2. 鏂板�鍒嗛〉鎺ュ彛 (`api/v1/dashboard.mjs`, `lib/db/events-queries.mjs`)
- 鏂板� `GET /api/v1/dashboard/stories?page&limit&filters`锛岄粯璁� `limit=50`锛屾敮鎸佸叏灞€绛涢€夊拰 `withHypothesisOnly`銆�
- 鏂板� `GET /api/v1/dashboard/hypotheses/pending?page&limit&filters&status`锛岄粯璁� `limit=50`锛屾敮鎸� status 涓庡叏灞€绛涢€夈€�
- 涓や釜鎺ュ彛鍧囪繑鍥� `data/pagination/meta`锛岄伩鍏嶅墠绔�淮鎶ゅ叏閲忔暟鎹�€�

#### 3. 鍏崇郴鎺ュ彛鐦﹁韩 (`api/v1/dashboard.mjs`, `lib/db/events-queries.mjs`)
- `/api/v1/dashboard/relationships` 鏀圭敤 `getDashboardCanonicalCardsByIds` 杩斿洖杞婚噺浜嬩欢鍗＄墖瀛楁�銆�
- 鍏崇郴 rows 瑁佸壀鏍囬�涓庢弿杩帮紝鍙�繚鐣欏垪琛ㄥ拰鍥捐氨娓叉煋鎵€闇€瀛楁�锛屼笉鍐嶅甫瀹屾暣 `relationships_out/hypotheses` 澶ф暟缁勩€�
- 鏂板� dashboard API 涓� SQL 鏌ヨ�鑰楁椂鏃ュ織锛岃�褰� `duration_ms`銆乣payload_bytes`銆乣row_count` 绛夋寚鏍囷紝渚夸簬鍖哄垎鎺ュ彛杩囬噸涓庡悗鍙颁换鍔′簤鐢ㄣ€�

#### 4. 閰嶇疆榛樿�鍊� (`config.mjs`, `.env`, `.env.example`)
- 鏂板�鍒嗛〉榛樿�鍊硷細
  - `DASHBOARD_STORIES_DEFAULT_LIMIT=50`
  - `DASHBOARD_STORIES_MAX_LIMIT=200`
  - `DASHBOARD_HYPOTHESES_DEFAULT_LIMIT=50`
  - `DASHBOARD_HYPOTHESES_MAX_LIMIT=200`
- 榛樿�闄愬埗鍊煎湪 `config.mjs` 鐨� `dashboard.limits`锛屾湰鍦拌�鐩栧€煎湪 `.env`锛屾ā鏉胯�鏄庡湪 `.env.example`銆�

### 楠岃瘉鐘舵€�
- [x] `node --check config.mjs`
- [x] `node --check api/v1/dashboard.mjs`
- [x] `node --check lib/db/events-queries.mjs`
- [x] `node --check dashboard/public/scripts/utils/api.js`
- [x] 鎶藉彇 `event-relationships.html` 鍐呰仈鑴氭湰骞堕€氳繃 `node --check`
- [x] 涓存椂鍚�姩鏈嶅姟楠岃瘉锛�
  - `/api/v1/dashboard/relationships?page=1&limit=5` 杩斿洖 200锛岀害 10KB锛宍total=2158`
  - `/api/v1/dashboard/stories?page=1&limit=5` 杩斿洖 200锛�5 鏉★紝`total=560`
  - `/api/v1/dashboard/hypotheses/pending?page=1&limit=5` 杩斿洖 200锛�5 鏉★紝`total=489702`
- [!] `npm test`锛歚npm.ps1` 鍙楁墽琛岀瓥鐣ラ檺鍒讹紱鏀圭敤 `npm.cmd test` 鍚庝粛鐢� Node test runner 瑙﹀彂 `spawn EPERM`锛屽睘浜庡綋鍓� Windows 娴嬭瘯杩愯�鐜��闄愬埗锛屾湭杩涘叆涓氬姟鏂�█銆�

---

## 2026-05-12 - Dashboard Canonical / Relationships 绋冲畾灞曠ず淇��

### 闂��鑳屾櫙
`canonical-events.html` 浠嶄緷璧栨棫鐗� `layer2/layer3/group` 鏁版嵁缁撴瀯锛屼絾 `/api/v1/dashboard/canonical-events` 宸叉敼涓哄垎椤靛钩閾烘暟缁勶紝瀵艰嚧鍒楄〃涓庤�鎯呰�闂� `event.group` 鏃舵棤娉曠ǔ瀹氭覆鏌撱€俙event-relationships.html` 宸︿晶鍒楄〃鍙堜緷璧栧眬閮ㄥ浘璋� `graphState.edges`锛岀缉鏀炬椂浼氳Е鍙� cluster/event 妯″紡鍒囨崲銆侀偦灞呴�鍙栧拰閲嶆覆鏌擄紝瀵艰嚧褰撳墠椤靛叧绯诲垪琛ㄨ�鍥捐氨鐘舵€佽�鐩栵紝鍙�兘绋冲畾鐪嬪埌灏戦噺鍏崇郴銆�

### 淇�敼鍐呭�璁板綍

#### 1. Canonical Events 鑱氱劍涓庡吋瀹瑰眰
- `/api/v1/dashboard/canonical-events` 鏂板�鍙�€� `eventId/event_id` 鍙傛暟锛屼紶鍏� `getDashboardCanonicalEventsPage`銆�
- `getDashboardCanonicalEventsPage` 鍦ㄧ洰鏍囦簨浠剁�鍚堝綋鍓嶇瓫閫変絾涓嶅湪褰撳墠椤垫椂锛岄�澶栨煡璇㈣� canonical event 骞剁疆椤惰繑鍥烇紝鍚屾椂鍦� `meta` 鏍囪� `focus_event_id/focus_in_filter/focus_included`銆�
- `canonical-events.html` 瀵瑰垎椤靛钩閾烘暟缁勫仛 normalize锛屼负姣忎釜浜嬩欢琛ヨ交閲� `group` 鍏煎�灞傦紝瀛楁�鏉ヨ嚜 `source_news_count/proto_event_count`銆�
- 璇︽儏 chips 鍜屽垪琛ㄤ笉鍐嶇洿鎺ュ亣璁� `event.group.proto_events` 宸插瓨鍦�紱鍘熷瓙浜嬩欢璇佹嵁缁х画閫氳繃 `/events/:id/aggregation` 鎸夐渶鍔犺浇銆�
- 浠庡叧绯婚〉璺宠浆 `/canonical-events.html?eventId=...` 鏃朵細浼樺厛瀹氫綅鐩�爣浜嬩欢锛涜嫢鐩�爣涓嶅湪绛涢€夎寖鍥达紝浼氭樉绀烘槑纭�彁绀恒€�

#### 2. Relationships 纭�畾鎬у睍绀�
- `/api/v1/dashboard/relationships` 杩斿洖 `relationship_created_at` 涓� `relationship_updated_at`锛岄粯璁ゆ帓搴忔敼涓� `relationship_updated_at DESC, complexity_score DESC, id DESC`銆�
- 鍏崇郴椤靛乏渚у垪琛ㄥ浐瀹氫娇鐢� `/dashboard/relationships` 鐨� `layer4` 褰撳墠椤垫暟鎹�紝涓嶅啀浣跨敤 `graphState.edges` 浣滀负鍒楄〃鏉ユ簮銆�
- 鐐瑰嚮鏌愭潯鍏崇郴鍚庯紝鍙充晶鍙�覆鏌撹� source-target 鍗曞叧绯诲浘鍜� inspector锛屼笉鍐嶈嚜鍔ㄦ墿灞曢偦灞呫€佷笉鍐嶉殢缂╂斁鍒� cluster/event 妯″紡銆�
- 鍏崇郴绫诲瀷绛涢€変細閲嶆柊璇锋眰鏈嶅姟绔�垎椤� Top N锛岃€屼笉鏄�彧杩囨护宸插姞杞藉眬閮ㄥ浘璋便€�
- 淇�� `storyHypothesisCount` 閫掑綊璋冪敤鑷�韩鐨勮繍琛屾椂 bug銆�

#### 3. 鍏崇郴鏇存柊鏃堕棿杩佺Щ
- 鏂板�骞舵墽琛� `sql/019_event_relationships_updated_at.sql`锛氭坊鍔� `event_relationships.updated_at`锛岀敤 `created_at` 鍥炲～锛岃�缃�粯璁ゅ€硷紝骞舵柊澧炴洿鏂版椂闂存帓搴忕储寮曘€�
- `createEventRelationship` 鏂板缓鏃跺啓鍏� `created_at/updated_at`锛涘啿绐佹洿鏂版椂浠呮洿鏂� `updated_at`锛屼繚鐣欏師濮� `created_at`銆�
- 棣栨�鎵ц�杩佺Щ鏃跺彂鐜� SQL 鏂囦欢甯� BOM锛屽凡鏀逛负 UTF-8 鏃� BOM 鍚庨噸璺戞垚鍔熴€�

### 楠岃瘉鐘舵€�
- [x] `node --check config.mjs`
- [x] `node --check api/v1/dashboard.mjs`
- [x] `node --check lib/db/events-queries.mjs`
- [x] `node --check lib/db/event-relationships-queries.mjs`
- [x] 鎶藉彇 `canonical-events.html` 涓� `event-relationships.html` 鍐呰仈鑴氭湰骞堕€氳繃 `node --check`
- [x] 鎵ц� `node scripts/run-sql.mjs sql/019_event_relationships_updated_at.sql` 鎴愬姛
- [x] 涓存椂鍚�姩鏈嶅姟楠岃瘉 `/api/v1/dashboard/canonical-events?page=1&limit=3` 杩斿洖骞抽摵鍙�覆鏌撴暟缁�
- [x] 涓存椂鍚�姩鏈嶅姟楠岃瘉 `/api/v1/dashboard/canonical-events?page=1&limit=3&eventId=18856` 杩斿洖 4 鏉★紝鐩�爣浜嬩欢缃�《涓� `focus_included=true`
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

