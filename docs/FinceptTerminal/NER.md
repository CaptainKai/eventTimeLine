项目地址 : D:\code\FinceptTerminal

FinceptTerminal 实体提取与新闻关系构建
一、实体提取（Entity Extraction）
项目采用字典/模式匹配方式实现 NER，而非依赖 spaCy/NLTK 等 NLP 库。

核心文件：news_nlp.py

国家提取（第 18-73 行）：内置 50+ 国家/城市字典，映射到 ISO 代码（US、CN、RU 等）
组织提取（第 77-102 行）：40+ 组织模式（NATO、IMF、Fed、SEC、Apple、Google 等）
人物提取（第 106-126 行）：25+ 知名人物 + 基于职务头衔的正则匹配（如 "Biden", "Trump", "Putin", "Dimon"）
Ticker 提取（第 187-196 行）：正则 \b[A-Z]{2,5}\b 匹配股票代码
边界匹配（第 153-165 行）：处理子串误匹配（如避免 "rome" 误匹配 "Jerome"）
C++ 侧通过 NewsNlpService.cpp 调用 Python 脚本，结果缓存在 ner_cache_ 中。

地理位置增强：news_geolocation.py

内置 48 个主要城市的精确经纬度
通过 OpenStreetMap Overpass API 查询附近基础设施（机场、军事基地、港口等）
二、新闻关系构建
项目使用多层策略构建新闻之间的关系：

1. Jaccard 相似度聚类
NewsClusterService.cpp

对标题做分词后计算 Jaccard 相似度
24 小时时间窗口约束
同类别阈值 0.2，不同类别 0.25
2. TF-IDF 语义聚类
news_nlp.py（第 222-346 行）

手动实现 TF-IDF + 余弦相似度（不依赖 sklearn）
内置同义词归一化（fed → federal_reserve 等）
金融领域停用词过滤
3. 关联信号检测
news_correlation.py

velocity_spike：1 小时内报道量较前一时段增长 3x+
triangulation：同一故事被 3+ 来源报道
keyword_spike：威胁关键词出现 5+ 次
geo_convergence：同一地区跨类别 5+ 事件
hotspot_escalation：冲突关键词激增
4. 国家不稳定指数（CII）
同一文件（第 188-255 行）：加权多类别评分（冲突×25、网络×10、自然灾害×15 等），分 CRITICAL/HIGH/ELEVATED/STABLE 四级。

5. 企业关系图谱
relationship_map.py

通过 yfinance 获取公司数据（高管、机构持仓、同行、分析师评级）
基于行业分类做同行公司映射
发布到 Redis geopolitics:relationship_graph:<ticker>
总结
能力	实现方式	核心文件
实体提取	字典/正则匹配	news_nlp.py
地理位置	预定义坐标 + OSM API	news_geolocation.py
标题聚类	Jaccard 相似度 + 时间窗	NewsClusterService.cpp
语义聚类	手写 TF-IDF 余弦	news_nlp.py
关联信号	多维度异常检测	news_correlation.py
企业关系	yfinance + 同行映射	relationship_map.py
整体特点是轻量级、不依赖重型 NLP 框架，用字典匹配 + 统计相似度 + 规则检测实现完整的实体提取和新闻关联链路。