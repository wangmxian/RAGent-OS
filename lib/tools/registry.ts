import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { retrieve, hitsToContext } from "../retrieval";
import {
  buildEnabledMcpTools,
  buildMcpTools,
  listMcpToolDescriptors,
} from "../mcp/loader";

export interface ToolDescriptor {
  id: string;
  name: string;
  description: string;
  category: "rag" | "math" | "time" | "custom" | "rag-mcp";
}

const BUILTIN_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    id: "knowledge_search",
    name: "知识库检索",
    description: "在用户已上传的文件中按语义检索，返回最相关的片段。",
    category: "rag",
  },
  {
    id: "current_time",
    name: "当前时间",
    description: "获取服务器当前时间，包含 ISO 时间和本地时区。",
    category: "time",
  },
  {
    id: "calculator",
    name: "计算器",
    description: "执行四则运算与基础数学函数。",
    category: "math",
  },
];

export function listToolDescriptors(): ToolDescriptor[] {
  return [...BUILTIN_TOOL_DESCRIPTORS, ...listMcpToolDescriptors()];
}

export const TOOL_DESCRIPTORS = listToolDescriptors();

export interface ToolContext {
  fileIds?: string[];
}

export function buildTools(ids: string[], ctx?: ToolContext) {
  const out = [];
  if (ids.includes("knowledge_search")) out.push(makeKnowledgeSearch(ctx));
  if (ids.includes("current_time")) out.push(makeCurrentTime());
  if (ids.includes("calculator")) out.push(makeCalculator());
  out.push(...buildMcpTools(ids));
  return out;
}

export function buildDefaultMcpTools() {
  return buildEnabledMcpTools();
}

function makeKnowledgeSearch(ctx?: ToolContext) {
  return tool(
    async ({ query, k }) => {
      const r = await retrieve(query, {
        k: k ?? 5,
        fileIds:
          ctx?.fileIds && ctx.fileIds.length ? ctx.fileIds : undefined,
      });
      if (!r.hits.length) return "（未在知识库中找到相关片段）";
      return hitsToContext(r.hits);
    },
    {
      name: "knowledge_search",
      description:
        "在用户已上传的本地知识库中按语义搜索相关片段。问题需要参考用户文档时使用。",
      schema: z.object({
        query: z.string().describe("自然语言查询"),
        k: z.number().int().min(1).max(20).optional().describe("返回条数"),
      }),
    },
  );
}

function makeCurrentTime() {
  return tool(
    async () => {
      const now = new Date();
      return JSON.stringify({
        iso: now.toISOString(),
        local: now.toString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
    {
      name: "current_time",
      description: "获取当前服务器时间。问题涉及当前日期、时间、时区时使用。",
      schema: z.object({}),
    },
  );
}

function makeCalculator() {
  return tool(
    async ({ expression }) => {
      const safe = /^[\d+\-*/().,\s%^a-zA-Z_]+$/.test(expression);
      if (!safe) return "ERROR: 表达式包含不允许的字符";
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const fn = new Function("with(Math){ return (" + expression + ") }");
        const v = fn();
        if (typeof v !== "number" || !isFinite(v))
          return "ERROR: 结果不是有限数字";
        return String(v);
      } catch (e: any) {
        return "ERROR: " + (e?.message || String(e));
      }
    },
    {
      name: "calculator",
      description:
        "执行数学表达式计算，可使用 Math 命名空间，如 sqrt(2)、sin(0.5)。",
      schema: z.object({
        expression: z
          .string()
          .describe("JavaScript 数学表达式，例如 (1+2)*3 或 sqrt(2)"),
      }),
    },
  );
}
