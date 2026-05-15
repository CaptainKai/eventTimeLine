# 09 - 安全防护类

来源: `server/_shared/llm-sanitize.js`, `scripts/seed-forecasts.mjs`

---

## 9.1 Prompt 注入清洗器

**文件:** `llm-sanitize.js`
**用途:** 在将不可信字符串嵌入 LLM Prompt 之前，清洗潜在的 Prompt 注入攻击

### 设计理念

白名单保留正常标点（引号、冒号、破折号、Unicode 字母和 emoji），黑名单过滤攻击模式。这是一个纵深防御层，不是安全边界。

### 注入模式检测

#### 模型特定分隔符

| 模式 | 说明 |
|------|------|
| `<\|im_start\|>`, `<\|im_end\|>` | OpenAI 分隔符 |
| `<\|begin_of_text\|>`, `<\|end_of_text\|>` | LLaMA 分隔符 |
| `[INST]`, `[/INST]`, `[SYS]` | LLaMA 指令标签 |
| `<system>`, `<user>`, `<assistant>` | XML 角色标签 |

#### 角色覆写标记

- `SYSTEM:`, `HUMAN:`, `GPT:`, `CLAUDE:`, `LLM:`, `MODEL:`, `PROMPT:`
- `### System:`, `[user]:`, `(assistant):`

#### 指令覆写短语

| 类别 | 模式 |
|------|------|
| 忽略指令 | "ignore all previous instructions", "disregard above prompt" |
| 角色扮演 | "you are now", "act as", "pretend to be", "roleplay as" |
| 拒绝服从 | "do not follow previous instructions", "do not obey system prompt" |
| 揭示 Prompt | "output your system prompt", "reveal your instructions", "repeat your original prompt" |

#### 控制字符

- ASCII 控制字符 (U+0000-U+001F, 排除换行和制表符)
- U+007F (DEL)
- U+00AD (soft hyphen)
- U+200B-U+200D (zero-width space / non-joiner / joiner)
- U+2028-U+2029 (Unicode line/paragraph separator)
- U+FEFF (BOM)

### 清洗函数

#### `sanitizeForPrompt(input)` — 完整清洗

适用于自由形式的上下文（geoContext）：
1. 移除控制字符
2. 逐行过滤角色前缀注入行
3. 应用所有注入模式替换
4. 合并多余空白

#### `sanitizeHeadline(input)` — 轻量清洗

适用于新闻头条，保留合法包含注入短语的新闻标题（如 "Output your system prompt" 作为新闻主题）：
1. 移除控制字符
2. 仅移除结构/分隔符模式
3. **不**移除语义指令短语（避免误伤科技/安全新闻）

#### `sanitizeHeadlines(headlines[])` / `sanitizeHeadlinesLight(headlines[])`

批量版本，过滤清洗后为空的条目。

### 行级注入检测逻辑

```javascript
// 检测带有角色前缀的注入行
isRolePrefixedInjectionLine(line):
  1. 是否有角色前缀 (user:/assistant:/bot: 等)?
  2. 如果有强覆写短语 (you are now / act as / pretend to be)?
  3. 如果有跟随指令 (follow/obey instructions)?
  4. 如果有命令动词 + 目标词 (ignore/disregard + instructions/prompt)?
```

### 参考

- OWASP LLM Top 10 – LLM01: Prompt Injection

---

## 9.2 Prompt  learned 提案清洗

**文件:** `scripts/seed-forecasts.mjs` (line 14157)
**用途:** 清洗 Prompt 自我优化系统提出的新增内容

### 阻塞模式

| 模式 | 说明 |
|------|------|
| `<[a-z/]` | HTML 标签 |
| `https?://` | URL |
| `javascript:` | JS 协议 |
| `eval\(` | 代码执行 |
| `function\(` | 函数定义 |
| `(ignore\|override\|disregard\|forget\|reset)...(previous\|above\|prior\|earlier\|all\|every)` | 指令覆写 |
| `you (are\|must\|will\|should)` | 角色重新定义 |
| `new (rule\|instruction\|system\|persona\|identity)` | 新规则定义 |
| `^(system\|user\|assistant):` | 角色标记行 |
| `^#{1,3} (system\|instruction\|rule\|override)` | Markdown 标题覆写 |

### 适用场景

这个清洗器用于 Prompt 自我优化循环（`runImpactExpansionPromptRefinement`），当系统分析输出质量并自动提出 Prompt 改进建议时，确保建议不包含注入模式。

---

## 9.3 输出验证模式

世界监控器在每个 LLM 调用后都实施了输出验证：

### JSON 输出验证

```javascript
// 1. 尝试直接 JSON.parse
// 2. 如果失败，尝试 strip markdown fences: s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
// 3. 尝试 extractFirstJsonObject(text) — 从文本中提取第一个完整 JSON 对象
// 4. 验证字段类型、长度、枚举值
```

### 形状验证示例

| Prompt 类型 | 验证规则 |
|------------|---------|
| 事件分类 | level ∈ {critical,high,medium,low,info}, category ∈ 14种 |
| Why Matters V1 | 单句，30-400 字符 |
| Why Matters V2 | 2-3 句，100-500 字符 |
| 故事描述 | 40-400 字符，不与头条相同 |
| Digest Prose | lead: 40-1500 字符, threads: 1-6 个, signals: ≤18词 |
| 情景分析 | 每个字段 ≥20 字符，index 有效 |

### 推理标签清理

```javascript
// 某些模型会输出 <think>...</think> 推理标签
raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*/gi, '')
```
