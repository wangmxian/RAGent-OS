import type { McpServerRow } from "../mcp";
import { findRagTool } from "./rag-tools";

const DEFAULT_BASE_PATH = "/mcp/rag/tools";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface AjaxResult<T = unknown> {
  code: number;
  msg?: string;
  data?: T;
}

export class RagMcpHttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "RagMcpHttpError";
  }
}

function buildToolUrl(server: McpServerRow, pathSuffix: string): string {
  const baseRaw = (server.base_url || server.url || "").trim();
  if (!baseRaw) {
    throw new RagMcpHttpError(`MCP server ${server.name} is missing base_url`);
  }

  const base = baseRaw.replace(/\/+$/, "");
  const hasFullPrefix = /\/mcp\/rag\/tools\/?$/i.test(base);
  const root = hasFullPrefix ? base : `${base}${DEFAULT_BASE_PATH}`;
  return `${root}/${pathSuffix.replace(/^\/+/, "")}`;
}

export async function callRagHttpTool(
  server: McpServerRow,
  toolName: string,
  args: Record<string, unknown>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  const def = findRagTool(toolName);
  if (!def) {
    throw new RagMcpHttpError(`Unknown RAG MCP tool: ${toolName}`);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (server.auth_token) {
    headers.Authorization = `Bearer ${server.auth_token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("MCP HTTP timeout")),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  if (options.signal) {
    if (options.signal.aborted) controller.abort(options.signal.reason);
    else {
      options.signal.addEventListener(
        "abort",
        () => controller.abort(options.signal!.reason),
        { once: true },
      );
    }
  }

  let res: Response;
  try {
    res = await fetch(buildToolUrl(server, def.pathSuffix), {
      method: "POST",
      headers,
      body: JSON.stringify(args ?? {}),
      signal: controller.signal,
    });
  } catch (e: any) {
    throw new RagMcpHttpError(
      `MCP tool ${toolName} network error: ${e?.message || String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new RagMcpHttpError(
      `MCP HTTP ${res.status}: ${text.slice(0, 500)}`,
      res.status,
    );
  }

  let payload: AjaxResult<string>;
  try {
    payload = JSON.parse(text) as AjaxResult<string>;
  } catch {
    return text;
  }

  if (typeof payload.code === "number" && payload.code !== 200) {
    throw new RagMcpHttpError(
      `MCP tool ${toolName} failed: code=${payload.code} msg=${payload.msg ?? ""}`,
      undefined,
      payload.code,
    );
  }

  if (payload.data == null) return payload.msg ?? "";
  if (typeof payload.data === "string") return payload.data;
  return JSON.stringify(payload.data);
}

export async function pingRagMcp(server: McpServerRow): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const out = await callRagHttpTool(
      server,
      "resolveQueryTime",
      { timeExpression: "today" },
      { timeoutMs: 8_000 },
    );
    return { ok: true, message: out.slice(0, 200) || "ok" };
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) };
  }
}
