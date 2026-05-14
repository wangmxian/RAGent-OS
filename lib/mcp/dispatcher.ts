import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatVLLM } from "../chat-vllm";
import { retrieve } from "../retrieval";
import { listEnabledMcpServers, type McpServerRow } from "../mcp";
import { callRagHttpTool } from "./http-client";
import { RAG_TOOLS } from "./rag-tools";

export type ToolHandlerType = "local" | "rag-http" | "llm";

export interface UnifiedMcpToolDescriptor {
  name: string;
  pathSuffix: string;
  description: string;
  schema: Record<string, unknown>;
  enabled: boolean;
  handlerType: ToolHandlerType;
  serverId?: string;
  serverName?: string;
}

export interface ToolRuntimeContext {
  fileIds?: string[];
  knowledgeEnabled?: boolean;
  signal?: AbortSignal;
  llm?: {
    baseURL: string;
    apiKey: string;
    model: string;
    temperature?: number;
    enableThinking?: boolean;
  };
}

const LOCAL_TOOLS: UnifiedMcpToolDescriptor[] = [
  {
    name: "ragSearch",
    pathSuffix: "rag-search",
    description: "企业知识库检索，基于当前 Next.js 本地 sqlite-vec 向量库。",
    schema: {
      query: "string",
      topK: "number",
      fileIds: "string[]",
    },
    enabled: true,
    handlerType: "local",
  },
  {
    name: "llmSummary",
    pathSuffix: "llm-summary",
    description: "基于上游工具结果、知识库片段和用户问题生成最终回答。",
    schema: {
      question: "string",
      context: "unknown",
      data: "unknown",
      knowledge: "unknown",
    },
    enabled: true,
    handlerType: "llm",
  },
];

export function listUnifiedMcpTools(): UnifiedMcpToolDescriptor[] {
  const out = [...LOCAL_TOOLS];
  for (const server of listEnabledMcpServers()) {
    if (server.kind !== "rag-http") continue;
    for (const tool of RAG_TOOLS) {
      out.push({
        name: tool.name,
        pathSuffix: tool.pathSuffix,
        description: `[MCP·${server.name}] ${tool.description}`,
        schema: { type: "zod" },
        enabled: server.enabled,
        handlerType: "rag-http",
        serverId: server.id,
        serverName: server.name,
      });
    }
  }
  return out;
}

export function findUnifiedMcpTool(
  name: string,
): UnifiedMcpToolDescriptor | null {
  return listUnifiedMcpTools().find((tool) => tool.name === name) ?? null;
}

export async function callUnifiedMcpTool(
  name: string,
  params: Record<string, unknown>,
  runtime: ToolRuntimeContext = {},
): Promise<unknown> {
  if (name === "ragSearch") return ragSearch(params, runtime);
  if (name === "llmSummary") return llmSummary(params, runtime);

  const server = findRagHttpServerForTool(name);
  if (server) {
    const result = await callRagHttpTool(server, name, params, {
      signal: runtime.signal,
    });
    return { result };
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

function findRagHttpServerForTool(toolName: string): McpServerRow | null {
  if (!RAG_TOOLS.find((tool) => tool.name === toolName)) return null;
  return (
    listEnabledMcpServers().find((server) => server.kind === "rag-http") ??
    null
  );
}

async function ragSearch(
  params: Record<string, unknown>,
  runtime: ToolRuntimeContext,
) {
  if (runtime.knowledgeEnabled === false) {
    return { chunks: [] };
  }
  const query = stringParam(params.query, "query");
  const topK =
    typeof params.topK === "number" && Number.isFinite(params.topK)
      ? Math.min(Math.max(Math.trunc(params.topK), 1), 20)
      : 5;
  const fileIds = stringArrayParam(params.fileIds) ?? runtime.fileIds;
  const { hits } = await retrieve(query, {
    k: topK,
    fileIds: fileIds && fileIds.length ? fileIds : undefined,
  });
  return {
    chunks: hits.map((hit) => ({
      content: hit.text ?? "",
      score: 1 - hit.distance,
      distance: hit.distance,
      fileId: hit.file_id,
      fileName: hit.file_name,
      chunkId: hit.chunk_id,
      ord: hit.ord,
      modality: hit.modality,
    })),
  };
}

async function llmSummary(
  params: Record<string, unknown>,
  runtime: ToolRuntimeContext,
) {
  const question = stringParam(params.question, "question");
  const llmCfg = runtime.llm ?? {
    baseURL: process.env.OPENAI_BASE_URL || "http://10.1.101.65:8001/v1",
    apiKey: process.env.OPENAI_API_KEY || "EMPTY",
    model: process.env.OPENAI_MODEL || "Qwen3.6-27B-FP8",
    temperature: 0.2,
    enableThinking: false,
  };
  const llm = new ChatVLLM({
    model: llmCfg.model,
    apiKey: llmCfg.apiKey,
    temperature: llmCfg.temperature ?? 0.2,
    streaming: false,
    configuration: { baseURL: llmCfg.baseURL },
    modelKwargs: {
      chat_template_kwargs: { enable_thinking: llmCfg.enableThinking ?? false },
    },
  });
  const payload = JSON.stringify(
    {
      context: params.context,
      data: params.data,
      knowledge: params.knowledge,
    },
    null,
    2,
  );
  const res = await llm.invoke(
    [
      new SystemMessage(
        "你是企业知识库和业务数据总结助手。只能依据给定材料回答；如果材料不足，直接说明缺少依据。用简洁中文回答。",
      ),
      new HumanMessage(`问题：${question}\n\n材料：\n${payload}`),
    ],
    { signal: runtime.signal },
  );
  return { answer: messageText(res.content) };
}

function stringParam(value: unknown, name: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${name} is required`);
}

function stringArrayParam(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const arr = value.filter((item): item is string => typeof item === "string");
  return arr.length ? arr : undefined;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item: any) => (typeof item === "string" ? item : item?.text ?? ""))
      .join("");
  }
  return "";
}
