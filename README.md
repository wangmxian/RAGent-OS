# LLM Chat (LangChain.js + Next.js)

## 企业级 AI 调度引擎

当前聊天链路已切换为严格 Skill 调度：

```text
用户输入
  -> Agent 只输出 JSON 决策
  -> Skill Executor 顺序执行 steps
  -> 统一 MCP dispatcher
  -> 本地 RAG / 外部 RuoYi MCP HTTP / LLM Summary
  -> SSE 返回答案
```

关键约束：

- Agent 不直接 bind 或调用 MCP 工具。
- 企业知识库问答通过内置 `kb_qa` Skill 执行。
- 本地知识库检索暴露为 MCP-style 工具 `ragSearch`。
- 最终回答汇总暴露为 MCP-style 工具 `llmSummary`。
- Skill 编排通过 Skills 面板的 Steps JSON 编辑。

内置 Skill：

- `kb_qa`: `ragSearch` -> `llmSummary`
- `query_ngfai_by_time`: `resolveQueryTime` -> `cr241AfmtNgFaiPareto`
- `ngfai_analysis`: `resolveQueryTime` -> `cr241AfmtNgFaiPareto` -> `ragSearch` -> `llmSummary`

验证：

```bash
npm run smoke:skill
npx tsc --noEmit
```

一个类 ChatGPT 的对话界面，通过 **LangChain.js** 经 **OpenAI 兼容协议** 连接本地 vLLM 部署的大模型（如 `Qwen3.6-27B-FP8`），支持流式输出与 **思考模式**（`chat_template_kwargs.enable_thinking`）一键切换。

## 功能特性

- 流式（SSE 风格 chunk）对话，支持中途停止
- 思考模式开关：透传 vLLM `chat_template_kwargs.enable_thinking`
- 自动识别 `<think>...</think>` 推理片段，独立可折叠展示
- System Prompt / Temperature 可调
- 暗色简洁 UI（Tailwind + lucide-react）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.local.example` 为 `.env.local`：

```bash
copy .env.local.example .env.local   # Windows
```

按需修改：

```ini
OPENAI_BASE_URL=http://10.1.101.65:8001/v1
OPENAI_API_KEY=EMPTY
OPENAI_MODEL=Qwen3.6-27B-FP8
```

> vLLM 默认无需 API Key，可填任意非空字符串（如 `EMPTY`）。
> 如使用阿里云 DashScope，将 `BASE_URL` / `API_KEY` / `MODEL` 改为对应值即可。

### 3. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

## 关键实现

### 思考模式透传

`@/app/api/chat/route.ts` 中通过 `modelKwargs` 把 vLLM 自定义参数注入请求体：

```ts
const llm = new ChatOpenAI({
  model,
  apiKey,
  configuration: { baseURL },
  streaming: true,
  modelKwargs: {
    chat_template_kwargs: { enable_thinking: enableThinking },
  },
});
```

`modelKwargs` 会与 `messages/temperature/...` 一起发到 `/v1/chat/completions`，vLLM 在应用 chat template 时即会读取 `enable_thinking`。

### 推理过程渲染

Qwen3 系列开启思考时会输出 `<think>...</think>` 包裹的推理段。前端 `@/components/Message.tsx` 解析该标签，将推理过程折叠展示，正文单独渲染。

## 目录结构

```
app/
  api/chat/route.ts   # 后端流式接口（LangChain.js）
  layout.tsx
  page.tsx
  globals.css
components/
  Chat.tsx            # 主对话界面
  Message.tsx         # 单条消息（含 think 折叠）
```

## 切换不同后端

只需改 `.env.local` 三个变量即可在以下后端切换：

| 场景 | BASE_URL | MODEL |
| --- | --- | --- |
| 本地 vLLM (Qwen3) | `http://10.1.101.65:8001/v1` | `Qwen3.6-27B-FP8` |
| 本地 vLLM (Qwen2.5-7B) | `http://10.1.101.65:8808/v1` | `Qwen2.5-7B RAG` |
| 阿里云 DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-flash-2025-07-28` |

> 注意：非 Qwen3 思考模型可关闭"思考模式"按钮（`enable_thinking=false` 不会有副作用，vLLM 仅在模板支持时才使用）。
