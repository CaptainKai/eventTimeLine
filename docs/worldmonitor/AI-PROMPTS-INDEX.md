# AI Prompts 索引

从 [worldmonitor](../worldmonitor/) 项目中提取的大模型 Prompt 分类索引。

## 目录结构

| 文件 | 类别 | 说明 |
|------|------|------|
| [01-intelligence-analysis.md](01-intelligence-analysis.md) | 情报分析 | 聊天分析师、国家情报简报、区域叙事 |
| [02-forecasting.md](02-forecasting.md) | 预测推演 | 预测简报、情景分析、多视角评估 |
| [03-summarization.md](03-summarization.md) | 摘要翻译 | 文章摘要、World Brief、翻译 |
| [04-editorial-brief.md](04-editorial-brief.md) | 编辑简报 | Why Matters、故事描述、每日摘要 |
| [05-simulation.md](05-simulation.md) | 模拟引擎 | 两轮地缘政治模拟、关键信号提取 |
| [06-market-analysis.md](06-market-analysis.md) | 市场分析 | 交易影响卡片、后果扩展 |
| [07-classification.md](07-classification.md) | 事件分类 | 威胁等级与类别分类 |
| [08-widget-generation.md](08-widget-generation.md) | 组件生成 | 数据可视化组件构建 |
| [09-security.md](09-security.md) | 安全防护 | Prompt 注入防御、输出清洗 |

## 架构概览

```
worldmonitor/
├── server/worldmonitor/intelligence/v1/    # 服务端情报分析 Prompts
│   ├── chat-analyst-prompt.ts              # 聊天分析师系统 Prompt
│   ├── deduction-prompt.ts                 # 预测/简报双模式 Prompt
│   ├── classify-event.ts                   # 事件分类 Prompt
│   └── get-country-intel-brief.ts          # 国家情报简报 Prompt
├── server/worldmonitor/news/v1/
│   └── _shared.ts                          # 文章摘要 Prompt 构建器
├── shared/
│   └── brief-llm-core.js                   # 编辑级 Why Matters Prompt
├── scripts/
│   ├── lib/brief-llm.mjs                   # Brief 信封 LLM 增强（摘要/描述/消化）
│   ├── _insights-brief.mjs                 # World Brief 摘要
│   ├── regional-snapshot/
│   │   ├── narrative.mjs                   # 区域叙事生成
│   │   └── weekly-brief.mjs               # 每周区域简报
│   ├── seed-forecasts.mjs                  # 预测种子（情景/模拟/市场）
│   └── ais-relay.cjs                       # AIS 组件生成（Widget）
└── server/_shared/
    ├── llm.ts                              # LLM 基础设施（多提供商链）
    └── llm-sanitize.js                     # Prompt 安全清洗
```

## 提供商链

所有 Prompt 通过以下提供商链调用（按优先级）：
1. **Ollama** (本地) — `llama3.1:8b`
2. **Groq** — `llama-3.3-70b-versatile`
3. **OpenRouter** — `google/gemini-2.5-flash`
4. **Generic OpenAI-compatible** — `gpt-3.5-turbo`

默认温度: `0.3-0.4`，根据用途可调整。

## Prompt 设计模式

1. **角色设定** — 大多数 Prompt 以 "You are a senior..." 开头，设定专业角色
2. **硬约束** — 使用 "HARD RULES"、"NEVER"、"MUST" 等强约束词
3. **结构化输出** — 要求 JSON 格式或特定章节结构
4. **证据引用** — 要求引用具体数据源、信号值、证据 ID
5. **禁止清单** — 明确列出禁止用语和模式
6. **优雅降级** — 多层 fallback 机制确保服务可用性
