import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatVLLM } from "../chat-vllm";
import { retrieve } from "../retrieval";
import {
  getMcpServer,
  listEnabledMcpServers,
  type McpServerRow,
} from "../mcp";
import { callRagHttpPath } from "./http-client";
import { getMcpToolByName, listEnabledMcpTools } from "./tool-config";

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

export function listUnifiedMcpTools(): UnifiedMcpToolDescriptor[] {
  return listEnabledMcpTools().map((tool) => {
    const server = tool.serverId ? getMcpServer(tool.serverId) : null;
    return {
      name: tool.name,
      pathSuffix: tool.pathSuffix,
      description: tool.description,
      schema: tool.schema,
      enabled:
        tool.enabled &&
        (tool.handlerType !== "rag-http" || !server || server.enabled),
      handlerType: tool.handlerType,
      serverId: tool.serverId ?? undefined,
      serverName: server?.name,
    };
  });
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
  const tool = getMcpToolByName(name);
  if (!tool || !tool.enabled) {
    throw new Error(`Unknown MCP tool: ${name}`);
  }

  if (tool.handlerType === "local" && name === "ragSearch") {
    return ragSearch(params, runtime);
  }
  if (tool.handlerType === "llm" && name === "llmSummary") {
    return llmSummary(params, runtime);
  }

  if (tool.handlerType === "rag-http") {
    const server = findRagHttpServerForTool(tool.serverId);
    if (!server) {
      throw new Error(`No enabled MCP server configured for tool: ${name}`);
    }
    const result = await callRagHttpPath(server, name, tool.pathSuffix, params, {
      signal: runtime.signal,
    });
    return { result };
  }

  throw new Error(`Unsupported MCP tool handler: ${tool.handlerType}`);
}

function findRagHttpServerForTool(serverId: string | null): McpServerRow | null {
  if (serverId) {
    const server = getMcpServer(serverId);
    return server && server.enabled ? server : null;
  }
  return listEnabledMcpServers().find((server) => server.kind === "rag-http") ?? null;
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
        "You summarize enterprise knowledge-base and business data. Answer only from the provided material. If evidence is insufficient, say so. Use concise Chinese.",
      ),
      new HumanMessage(`Question: ${question}\n\nMaterial:\n${payload}`),
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
