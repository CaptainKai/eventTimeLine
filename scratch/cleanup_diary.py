# -*- coding: utf-8 -*-
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# The ultimate non-overlapping precision-guided cleanup dictionary
cleanup_dict = {
    # Phase 1 and Title
    "# 事件时间线引 - 开发日": "# 事件时间线引擎 - 开发日记",
    "## 2026-05-14 - 原子关系 Summary-First 批理回塸阶化执行修": "## 2026-05-14 - 原子关系图 Summary-First 批处理回填与阶段化执行修复",
    "### 背景与目\n": "### 背景与目标\n",
    "朽继续重构": "本轮继续重构",
    "朸继续重构": "本轮继续重构",
    "原子事件边\n": "原子事件边。\n",
    "为什么拆成丘": "为什么拆成多个阶段",
    "拆阶段不昸了加流程杂度": "拆阶段不仅是为了增加流程复杂度",
    "原子边算": "原子边计算",
    "重复构边\n": "重复构边。\n",
    "每批默 `500`  proto\n": "每批默认 `500` 条 proto。",
    "成为图节点\n": "成为图节点。\n",
    "聚类叔于减 summary 叛次数": "聚类仅用于减少 summary 召回次数",
    "加入 summary\n": "加入 summary。\n",
    "绑定到命业 summary": "绑定到命中 summary。",
    "单成员创建 `isolated` summary，成员创建一东 relationship summary\n": "单成员创建 `isolated` summary，多成员创建一个真实的 relationship summary。\n",
    "朘段目标是忼叻": "本阶段目标是快速归属并建立",
    "不做重的原子边两两计算\n": "不做重的原子边两两计算。\n",
    
    # Phase 1.5 and Phase 2
    "1.5锛歋ummary": "1.5：Summary",
    "明这 summary 之间袖证据": "表明这些 summary 之间可以通过证据",
    "桥接起来了\n": "桥接起来了。\n",
    "一 proto": "一个 proto",
    "关系层会越来越碎\n": "关系层会越来越碎。\n",
    "并把其 summary": "并把其它 summary",
    "去重迁移过去\n": "去重迁移过去。\n",
    "袐并": "被合并",
    "使用轐并": "使用软合并",
    "不物理删除，便于计和跳转\n": "不物理删除，便于统计和跳转。\n",
    "这个阶必须早于": "这个阶段必须早于",
    "重复构边，浴大量计算\n": "重复构边，产生大量计算。\n",
    "已经相稳定\n": "已经相对稳定。\n",
    "对每 active": "对每个 active",
    "入队一 full": "入队一个 full",
    "full detail job\n": "full detail job。\n",
    "建任务，不直接阻塞": "建任务，不直接阻塞",
    "做边计算\n": "做边计算。\n",
    
    # Phase 3
    "如果脚本 `--drain-details`，则同消费": "如果脚本带 `--drain-details`，则同步消费",
    "detail job\n": "detail job。\n",
    "detail job 叜 summary": "detail job 会在 summary",
    "对成 proto": "对成员 proto",
    "做细关系分析": "做详细关系分析",
    "时间范围等统\n": "时间范围等统计。\n",
    "实时生产链路不等待这丘段完成": "实时生产链路不等待这一阶段完成",
    "异归属和构边\n": "异步归属和构边。\n",
    "属于某丅系层节点": "属于某个关系层节点",
    "在命业 summary": "在命中 summary",
    "细算原子边\n": "细算原子边。\n",
    "预筛\n": "预筛选\n",
    "也不落库\n": "也不落库。\n",
    "一 proto 同时桥接": "一个 proto 同时桥接",
    "优先合并 summary，减少关系层碎片化\n": "优先合并 summary，减少关系层碎片化。\n",
    "relationship_summary_jobs，避免入库求重算阻塞\n": "relationship_summary_jobs，避免入库请求与重复计算阻塞。\n",
    "叁复回": "支持断点恢复",
    "Phase 1 完成后 Phase 1.5/Phase 2 失败": "Phase 1 完成后如果 Phase 1.5/Phase 2 失败",
    "不必重跑已经耗时完成 summary 归属\n": "不必重跑已经耗时完成的 summary 归属。\n",
    
    # Modifications and Queries
    "### 俔记录\n": "### 最近修改记录\n",
    "### 俔内记录\n": "### 本期内记录\n",
    "- ** merge job 参数类型错**：": "- **解决 merge job 参数类型错误**：",
    "解决 PostgreSQL 报错“无法确定参 $1 的数捱型”": "解决 PostgreSQL 报错“无法确定参数 $1 的数据类型”",
    "新/保留 `resetFailedRelationshipSummaryJobs()`": "新增/保留 `resetFailedRelationshipSummaryJobs()`",
    "重置 pending": "重置为 pending",
    "继续消费。\n": "继续消费。\n",
    "重建脚朻": "重建脚本",
    "支持将 failed job 重置为 pending，配合重建脚本继续消费。\n": "支持将 failed job 重置为 pending，配合重建脚本继续消费。\n",
    "攌 `--resume-after-phase1`": "支持 `--resume-after-phase1`",
    "并攌 `--reset-failed-jobs`": "并支持 `--reset-failed-jobs`",
    "失败 summary jobs\n": "失败的 summary jobs。\n",
    "避免诓": "避免误操作",
    "禁 `--full`": "禁止与 `--full`",
    "诸空已完成": "清空已完成",
    "Phase 1 数据\n": "Phase 1 数据。\n",
    "统一 batch 默\n": "统一 batch 默认值\n",
    "默 batch size": "默认 batch size",
    "调整 `500`": "调整为 `500`",
    "backfill 脚本保持一致\n": "backfill 脚本保持一致。\n",
    "已通过 `node --check` 检": "已通过 `node --check` 检查",
    "单测\n": "单测。\n",
    "重跑 `--full`": "重跑 `--full`",
    "并发批量\n": "并发批量。\n",
    "### 当前推荐恢命令\n": "### 当前推荐恢复命令\n",
    
    # 2026-05-06 LLM Refactor Section
    "### 朽盠 (LLM Parser Three-Stage": "### 任务分析 (LLM Parser Three-Stage",
    "实/动作归一 + 层级攌": "实体/动作归一化 + 层级构建",
    "改进 LLM 解析器使其能够": "改进 LLM 解析器使其能够",
    "改进 LLM 解析噼使其能": "改进 LLM 解析器使其能够",
    "1. 提取所有事件、实体、动作，不遗\n": "1. 提取所有事件、实体、动作，不遗漏\n",
    "2. 利用 LLM 进实体/动作归一化判於而非硼码映": "2. 利用 LLM 进行实体/动作归一化判定而非硬编码映射",
    "3. 识别实体层级关系（\"美国国防\"挂在美国下）": "3. 识别实体层级关系（\"美国国防部\"挂在美国下）",
    "4. 结构化输出，直接叔于后绻码执行（ agent 模式": "4. 结构化输出，直接服务于后续代码执行（如 agent 模式）",
    "5. 保持 LLM 和传统方法的隔\n": "5. 保持 LLM 和传统方法的隔离\n",
    "### 闂鍒嗘瀽璁板綍\n": "### 问题分析记录\n",
    "\"忽略评、测、点、\"过于粗暴": "\"忽略评论、预测、观点、谣言\"过于粗暴",
    "\"特朗晉评某政策\"机昺件": "\"特朗普点评某政策\"本质上是事件",
    "宣布一周后对话\"也是事件（只映记为 future": "宣布一周后对话\"也是事件（只标记为 future）",
    "昸上作还昸丼（ + 出售）": "本质上是动作还是事件（声明 + 出售）",
    "模糊指代朧": "模糊指代还原",
    "幅度（25丟点）": "幅度（25个基点）",
    "硼码映射": "硬编码映射",
    "实体无层\n": "实体无层级\n",
    "解决方：三阶 LLM Pipeline": "解决方案：三阶段 LLM Pipeline",
    "1.配置扩充": "1. 配置扩充",
    "2.数据库迁": "2. 数据库迁移",
    "3.实体查模块增强": "3. 实体查询模块增强",
    "4.实体归一化模": "4. 实体归一化模块",
    "5.LLM 解析器重": "5. LLM 解析器重构",
    "1次调甼": "1次调用",
    "结果合并（纯代码\n": "结果合并（纯代码）\n",
    "俔内记录\n": "本期内记录\n",
    "新 `ENTITY_TYPES` 枚举8 种实体类型）": "新 `ENTITY_TYPES` 枚举（8 种实体类型）",
    "鏂板 `ACTION_SYNONYM_MAP`锛堝姩浣滃悓涔夎瘝鏄犲皠锛屽厹搴曠敤锛": "新 `ACTION_SYNONYM_MAP`（动作同义词映射，兜底用）",
    "鏂板 `getEntityHierarchyRulesText()（供 LLM prompt 使用）`": "新 `getEntityHierarchyRulesText()`（供 LLM prompt 使用）",
    "实体归一化模\n": "实体归一化模块\n",
    "攌缓存避免": "缓存避免",
    "作为参\n": "作为参考\n",
    "LLM 解析器重\n": "LLM 解析器重构\n",
    "三阶段架\n": "三阶段架构\n",
    "标 temporal_status": "标记 temporal_status",
    "宣布出售\" \"宣布\" + \"出售\"": "宣布出售\" 拆为 \"宣布\" + \"出售\"",
    "多体必须展开": "多实体必须展开",
    "具体国名）": "具体国名）",
    "details 字\n": "details 字段\n",
    "getEntityHierarchyRulesText()（供 LLM prompt 使用）（供 LLM prompt 使用": "getEntityHierarchyRulesText()（供 LLM prompt 使用）"
}

with open('DEVELOP_DIARY.md', 'r', encoding='utf-8') as f:
    content = f.read()

for k, v in cleanup_dict.items():
    content = content.replace(k, v)

with open('DEVELOP_DIARY.md', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully cleaned up residual mojibake artifacts from DEVELOP_DIARY.md!")
