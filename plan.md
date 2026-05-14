# 企业级 AI 调度引擎实现文档（MCP + Skill + Agent + RAG）

---

# 🎯 一、目标

实现一个统一的 AI 调度系统，具备以下能力：

1. MCP 工具动态配置（无需改代码）
2. Skill 编排多个 MCP 工具
3. Agent 只负责选择 Skill
4. 内置企业知识库问答（RAG，基于本地向量库）
5. 支持多步骤执行、参数传递、结果依赖
6. 所有能力统一通过 Skill 执行

---

# 🧱 二、系统架构（唯一实现）

```
用户输入
   ↓
Agent（vLLM，仅选择 Skill）
   ↓
Skill Executor（Node.js）
   ↓
按步骤执行 MCP（HTTP）
   ↓
返回结果
```

---

# 📦 三、MCP 工具系统

## 1. 数据结构

```ts id="mcp-struct"
type MCPTool = {
  name: string
  pathSuffix: string
  description: string
  schema: any
  enabled: boolean
}
```

---

## 2. 调用规范

所有 MCP 统一通过：

```ts id="mcp-call"
POST /mcp/rag/tools/{pathSuffix}
```

---

## 3. 示例

```json id="mcp-example"
{
  "name": "resolveQueryTime",
  "pathSuffix": "resolve-query-time",
  "description": "解析时间表达",
  "schema": {
    "timeExpression": "string"
  },
  "enabled": true
}
```

---

# 🧩 四、Skill 系统（核心）

## 1. 数据结构

```ts id="skill-struct"
type Skill = {
  name: string
  description: string
  version: string
  steps: SkillStep[]
}

type SkillStep = {
  tool: string
  params: Record<string, any>
}
```

---

## 2. 参数引用规则（必须支持）

| 表达式        | 含义    |
| ---------- | ----- |
| $input.xxx | 用户输入  |
| $step1.xxx | 第一步输出 |
| $step2.xxx | 第二步输出 |

---

## 3. 示例 Skill

```json id="skill-example"
{
  "name": "query_ngfai_by_time",
  "description": "查询 NGFAI 数据",
  "version": "v1",
  "steps": [
    {
      "tool": "resolveQueryTime",
      "params": {
        "timeExpression": "$input.time"
      }
    },
    {
      "tool": "cr241AfmtNgFaiPareto",
      "params": {
        "queryMode": "month",
        "month": "$step1.result"
      }
    }
  ]
}
```

---

# ⚙️ 五、Skill Executor（执行引擎）

## 1. 执行逻辑

```ts id="executor-core"
async function executeSkill(skill, userInput) {
  const context = {
    input: userInput,
    steps: {}
  }

  for (let i = 0; i < skill.steps.length; i++) {
    const step = skill.steps[i]

    const params = resolveParams(step.params, context)

    const result = await callMcp(step.tool, params)

    context.steps[`step${i + 1}`] = result
  }

  return context
}
```

---

## 2. 参数解析器

```ts id="resolver-core"
function resolveParams(params, context) {
  if (typeof params === "string") {
    return resolveValue(params, context)
  }

  if (Array.isArray(params)) {
    return params.map(p => resolveParams(p, context))
  }

  if (typeof params === "object") {
    const result = {}
    for (const key in params) {
      result[key] = resolveParams(params[key], context)
    }
    return result
  }

  return params
}
```

---

# 🧠 六、Agent（唯一职责：选择 Skill）

## Prompt

```text id="agent-prompt-final"
你是一个企业智能助手。

系统中存在多个 skill，每个 skill 是已经编排好的执行流程。

你的任务是：

从 skill 列表中选择最合适的一个来完成用户请求。

---

# Skill 列表：
{{skills}}

---

# 输出格式（必须严格 JSON）：

{
  "type": "skill_call",
  "skill": "skill_name",
  "args": {
    "query": "...",
    "time": "..."
  }
}

---

# 规则：

1. 不要调用工具
2. 只选择 skill
3. 提取用户输入中的 query 和 time
4. 如果没有匹配 skill：

{
  "type": "chat"
}
```

---

# 🧠 七、RAG 系统（固定实现）

## 1. 实现方式

RAG 必须使用：

👉 本地向量库（Vector Store）

---

## 2. 检索流程

```ts id="rag-flow"
query
  ↓
embedding
  ↓
vector search（topK=5）
  ↓
返回 chunks
```

---

## 3. MCP 封装

RAG 必须作为 MCP 工具存在：

```ts id="rag-mcp"
{
  name: "ragSearch",
  pathSuffix: "rag-search",
  description: "企业知识库检索",
  schema: {
    query: string,
    topK: number
  }
}
```

---

## 4. 返回结构

```json id="rag-result"
{
  "chunks": [
    { "content": "...", "score": 0.91 }
  ]
}
```

---

# 🧩 八、RAG Skill

```json id="rag-skill"
{
  "name": "kb_qa",
  "description": "知识库问答",
  "version": "v1",
  "steps": [
    {
      "tool": "ragSearch",
      "params": {
        "query": "$input.query",
        "topK": 5
      }
    },
    {
      "tool": "llmSummary",
      "params": {
        "context": "$step1.chunks",
        "question": "$input.query"
      }
    }
  ]
}
```

---

# 🔀 九、Hybrid Skill（数据 + 知识）

```json id="hybrid-skill"
{
  "name": "ngfai_analysis",
  "version": "v1",
  "steps": [
    {
      "tool": "resolveQueryTime",
      "params": {
        "timeExpression": "$input.time"
      }
    },
    {
      "tool": "cr241AfmtNgFaiPareto",
      "params": {
        "queryMode": "month",
        "month": "$step1.result"
      }
    },
    {
      "tool": "ragSearch",
      "params": {
        "query": "NGFAI 异常原因",
        "topK": 5
      }
    },
    {
      "tool": "llmSummary",
      "params": {
        "data": "$step2",
        "knowledge": "$step3.chunks",
        "question": "$input.query"
      }
    }
  ]
}
```

---

# ⚙️ 十、LangChain.js 集成

```ts id="langchain-run"
const decision = await agent.invoke({
  input: userInput
})

if (decision.type === "skill_call") {
  return await executeSkill(
    skillMap[decision.skill],
    decision.args
  )
}
```

---

# 📊 十一、日志系统（必须实现）

```ts id="log-struct"
{
  skill: "xxx",
  steps: [
    {
      step: 1,
      tool: "xxx",
      input: {...},
      output: {...}
    }
  ]
}
```

---

# 🚀 十二、系统最终形态

```id="final-form"
Agent（只做决策）
   ↓
Skill（定义流程）
   ↓
Executor（执行）
   ↓
MCP（能力层）
   ↓
RAG（知识层）
```

---

# ⚠️ 十三、强制约束

1. Agent 不允许直接调用 MCP
2. 所有能力必须通过 Skill 执行
3. RAG 必须通过 MCP 封装
4. 时间解析必须在 Skill 中完成
5. 所有 Skill 必须可重复执行

---

# 🧭 十四、最终目标

构建一个系统：

```id="goal"
可配置工具（MCP）
   ↓
可编排流程（Skill）
   ↓
可控决策（Agent）
   ↓
企业级 AI 调度引擎
```

---
