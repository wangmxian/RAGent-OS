/**
 * MCP 服务器配置层。
 *
 * 当前已实装：
 *   - kind = "rag-http"：RuoYi AjaxResult 风格 HTTP 工具网关（lib/mcp/http-client.ts 实际调用）
 *
 * 占位（未实装）：
 *   - kind = "generic" + transport=stdio/sse：等待官方 MCP SDK 接入
 *
 * 字段约定：
 *   - rag-http：使用 base_url（必填，可只填 host:port，自动补 /mcp/rag/tools）+ auth_token（Bearer）
 *   - 其它：保留旧 transport/url/command/args/env 字段
 */

import { nanoid } from "nanoid";
import { getDb, now } from "./db";

export type McpTransport = "stdio" | "http" | "sse";
export type McpKind = "generic" | "rag-http";

export interface McpServerRow {
  id: string;
  name: string;
  kind: McpKind;
  transport: McpTransport;
  command: string | null;
  args: string[];
  url: string | null;
  base_url: string | null;
  auth_token: string | null;
  env: Record<string, string>;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

interface McpServerRowDb {
  id: string;
  name: string;
  kind: McpKind | null;
  transport: McpTransport;
  command: string | null;
  args: string | null;
  url: string | null;
  base_url: string | null;
  auth_token: string | null;
  env: string | null;
  enabled: number;
  created_at: number;
  updated_at: number;
}

function parse(r: McpServerRowDb): McpServerRow {
  return {
    id: r.id,
    name: r.name,
    kind: (r.kind as McpKind) || "generic",
    transport: r.transport,
    command: r.command,
    args: safeJson(r.args, []) as string[],
    url: r.url,
    base_url: r.base_url,
    auth_token: r.auth_token,
    env: safeJson(r.env, {}) as Record<string, string>,
    enabled: !!r.enabled,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function safeJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function listMcpServers(): McpServerRow[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM mcp_servers ORDER BY created_at ASC`)
    .all() as McpServerRowDb[];
  return rows.map(parse);
}

export function listEnabledMcpServers(): McpServerRow[] {
  return listMcpServers().filter((s) => s.enabled);
}

export interface CreateMcpInput {
  name: string;
  kind?: McpKind;
  transport?: McpTransport;
  command?: string | null;
  args?: string[];
  url?: string | null;
  baseUrl?: string | null;
  authToken?: string | null;
  env?: Record<string, string>;
  enabled?: boolean;
}

export function createMcpServer(input: CreateMcpInput): McpServerRow {
  const db = getDb();
  const id = nanoid(10);
  const t = now();
  const kind: McpKind = input.kind ?? (input.baseUrl ? "rag-http" : "generic");
  const transport: McpTransport =
    input.transport ?? (kind === "rag-http" ? "http" : "stdio");
  db.prepare(
    `INSERT INTO mcp_servers (
       id, name, kind, transport, command, args, url, base_url, auth_token, env,
       enabled, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    kind,
    transport,
    input.command ?? null,
    JSON.stringify(input.args ?? []),
    input.url ?? null,
    input.baseUrl ?? null,
    input.authToken ?? null,
    JSON.stringify(input.env ?? {}),
    input.enabled ? 1 : 0,
    t,
    t,
  );
  return getMcpServer(id)!;
}

export interface UpdateMcpInput {
  name?: string;
  kind?: McpKind;
  transport?: McpTransport;
  command?: string | null;
  args?: string[];
  url?: string | null;
  baseUrl?: string | null;
  authToken?: string | null;
  env?: Record<string, string>;
  enabled?: boolean;
}

export function updateMcpServer(
  id: string,
  patch: UpdateMcpInput,
): McpServerRow | null {
  const cur = getMcpServer(id);
  if (!cur) return null;
  const db = getDb();
  const next: McpServerRow = {
    ...cur,
    name: patch.name ?? cur.name,
    kind: patch.kind ?? cur.kind,
    transport: patch.transport ?? cur.transport,
    command: patch.command !== undefined ? patch.command : cur.command,
    args: patch.args ?? cur.args,
    url: patch.url !== undefined ? patch.url : cur.url,
    base_url: patch.baseUrl !== undefined ? patch.baseUrl : cur.base_url,
    auth_token:
      patch.authToken !== undefined ? patch.authToken : cur.auth_token,
    env: patch.env ?? cur.env,
    enabled: patch.enabled ?? cur.enabled,
    updated_at: now(),
  };
  db.prepare(
    `UPDATE mcp_servers SET
       name=?, kind=?, transport=?, command=?, args=?, url=?, base_url=?, auth_token=?, env=?, enabled=?, updated_at=?
     WHERE id=?`,
  ).run(
    next.name,
    next.kind,
    next.transport,
    next.command,
    JSON.stringify(next.args),
    next.url,
    next.base_url,
    next.auth_token,
    JSON.stringify(next.env),
    next.enabled ? 1 : 0,
    next.updated_at,
    id,
  );
  return getMcpServer(id);
}

export function getMcpServer(id: string): McpServerRow | null {
  const db = getDb();
  const r = db
    .prepare(`SELECT * FROM mcp_servers WHERE id = ?`)
    .get(id) as McpServerRowDb | undefined;
  return r ? parse(r) : null;
}

export function deleteMcpServer(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM mcp_servers WHERE id = ?`).run(id);
}

/** 在响应里安全展示——隐藏 token */
export function sanitizeForClient(s: McpServerRow): McpServerRow & {
  has_token: boolean;
} {
  return {
    ...s,
    auth_token: s.auth_token ? "********" : null,
    has_token: !!s.auth_token,
  };
}
