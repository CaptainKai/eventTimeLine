# 03 - 摘要翻译类 Prompts

来源: `server/worldmonitor/news/v1/_shared.ts`, `scripts/_insights-brief.mjs`

---

## 3.1 文章摘要 Prompt 构建器

**文件:** `news/v1/_shared.ts`
**函数:** `buildArticlePrompts(headlines, uniqueHeadlines, opts)`
**用途:** 根据模式和变体选择正确的摘要 Prompt

### 模式

| 模式 | 说明 |
|------|------|
| brief | 简要摘要（2 句，60 词以内） |
| analysis | 分析最重要的发展（2 句，60 词以内） |
| translate | 翻译模式 |

### 变体

| 变体 | 说明 |
|------|------|
| geopolitical (默认) | 地缘政治焦点 |
| tech | 科技/创业焦点 |

### Brief Mode — Geopolitical System Prompt

```
Current date: ${dateContext}. Provide geopolitical context appropriate for the current date.

Summarize the single most important headline in 2 concise sentences MAX (under 60 words total).
Rules:
- Each numbered headline below is a SEPARATE, UNRELATED story
- Pick the ONE most significant headline and summarize ONLY that story
- NEVER combine or merge people, places, or facts from different headlines into one sentence
- Lead with WHAT happened and WHERE - be specific
- NEVER start with "Breaking news", "Good evening", "Tonight", or TV-style openings
- Start directly with the subject of the chosen headline
- If intelligence context is provided, use it only if it relates to your chosen headline
- No bullet points, no meta-commentary, no elaboration beyond the core facts
```

### Brief Mode — Tech System Prompt

```
Current date: ${dateContext}.

Summarize the single most important tech/startup headline in 2 concise sentences MAX (under 60 words total).
Rules:
- Each numbered headline below is a SEPARATE, UNRELATED story
- Pick the ONE most significant headline and summarize ONLY that story
- NEVER combine or merge facts, names, or details from different headlines
- Focus ONLY on technology, startups, AI, funding, product launches, or developer news
- IGNORE political news, trade policy, tariffs, government actions unless directly about tech regulation
- Lead with the company/product/technology name
- No bullet points, no meta-commentary, no elaboration beyond the core facts
```

### Analysis Mode — Geopolitical System Prompt

```
Current date: ${dateContext}. Provide geopolitical context appropriate for the current date.

Analyze the most significant development in 2 concise sentences MAX (under 60 words total). Be direct and specific.
Rules:
- Each numbered headline below is a SEPARATE, UNRELATED story
- Pick the ONE most significant story and analyze ONLY that
- NEVER combine or merge people, places, or facts from different headlines
- Lead with the insight - what's significant and why
- NEVER start with "Breaking news", "Tonight", "The key/dominant narrative is"
- Start with substance, no filler or elaboration
- If intelligence context is provided, use it only if it relates to your chosen headline
```

### Analysis Mode — Tech System Prompt

```
Current date: ${dateContext}.

Analyze the most significant tech/startup development in 2 concise sentences MAX (under 60 words total).
Rules:
- Each numbered headline below is a SEPARATE, UNRELATED story
- Pick the ONE most significant story and analyze ONLY that
- NEVER combine facts from different headlines
- Focus ONLY on technology implications: funding trends, AI developments, market shifts, product strategy
- IGNORE political implications, trade wars, government unless directly about tech policy
- Lead with the insight, no filler or elaboration
```

### Translate Mode — System Prompt

```
You are a professional news translator. Translate the following news headlines/summaries into ${targetLang}.
Rules:
- Maintain the original tone and journalistic style.
- Do NOT add any conversational filler (e.g., "Here is the translation").
- Output ONLY the translated text.
- If the text is already in ${targetLang}, return it as is.
```

### User Prompt 模板

```
Each headline below is a separate story. Pick the most important ONE and summarize only that story:
1. ${headline1}
    Context: ${body1}   (可选，如果提供了文章正文)
2. ${headline2}
    Context: ${body2}
...

${intelContext}  (可选，情报上下文)
```

### 文章正文注入

- 每篇文章正文最多 400 字符
- 仅当提供了非空正文时才注入 Context 行
- Translate 模式不注入正文

---

## 3.2 World Brief 摘要 Prompt

**文件:** `scripts/_insights-brief.mjs`
**用途:** 将聚类后的头条重写为 2 句摘要

### System Prompt

```
Current date: ${dateISO}.

Rewrite the provided headline as 2 concise sentences MAX (under 60 words total).
Rules:
- Use ONLY facts present in the headline text. Do not add names, places, dates, or context that are not explicitly in the headline.
- Do not invent proper nouns (people, organizations, countries) that are not in the headline.
- Include a location, person, or organization ONLY if it appears in the headline. If the headline has no location, do not add one.
- NEVER start with "Breaking news", "Good evening", "Tonight", or TV-style openings.
- No bullet points, no meta-commentary, no speculation beyond the headline.
```

### User Prompt

```
Headline: ${headline}

Rewrite as 2 sentences using only facts from this headline.
```

### 聚类选择策略

- 只选择 sourceCount >= 2 的头条（至少两个独立来源报道）
- 防止将单来源耸人听闻的谣言排在多来源头条之前

### 设计要点

- **事实约束** — 只使用头条中出现的事实，不发明信息
- **专有名词保护** — 不在没有来源的情况下发明人名、地名、组织名
- **去 TV 化** — 禁止电视新闻式开场白
