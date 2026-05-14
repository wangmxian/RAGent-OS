import { nanoid } from "nanoid";
import { getDb, now } from "../db";
import type { ToolHandlerType } from "./dispatcher";

export interface McpToolRow {
  id: string;
  name: string;
  pathSuffix: string;
  description: string;
  schema: Record<string, unknown>;
  enabled: boolean;
  handlerType: ToolHandlerType;
  systemId: string;
  serverId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface McpToolRowDb {
  id: string;
  name: string;
  path_suffix: string;
  description: string;
  schema: string;
  enabled: number;
  handler_type: ToolHandlerType;
  system_id: string | null;
  server_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface UpsertMcpToolInput {
  name: string;
  pathSuffix: string;
  description?: string;
  schema?: Record<string, unknown>;
  enabled?: boolean;
  handlerType?: ToolHandlerType;
  systemId?: string;
  serverId?: string | null;
}

function parse(row: McpToolRowDb): McpToolRow {
  return {
    id: row.id,
    name: row.name,
    pathSuffix: row.path_suffix,
    description: row.description,
    schema: safeJson(row.schema, {}),
    enabled: !!row.enabled,
    handlerType: row.handler_type,
    systemId: row.system_id || "default",
    serverId: row.server_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listMcpTools(): McpToolRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM mcp_tools ORDER BY updated_at DESC, created_at DESC`)
    .all() as McpToolRowDb[];
  return rows.map(parse);
}

export function listEnabledMcpTools(): McpToolRow[] {
  return listMcpTools().filter((tool) => tool.enabled);
}

export function getMcpToolByName(name: string): McpToolRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM mcp_tools WHERE name = ?`)
    .get(name) as McpToolRowDb | undefined;
  return row ? parse(row) : null;
}

export function getMcpToolByPathSuffix(pathSuffix: string): McpToolRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM mcp_tools WHERE path_suffix = ?`)
    .get(pathSuffix) as McpToolRowDb | undefined;
  return row ? parse(row) : null;
}

export function createMcpTool(input: UpsertMcpToolInput): McpToolRow {
  const db = getDb();
  const id = nanoid(10);
  const t = now();
  db.prepare(
    `INSERT INTO mcp_tools (
       id, name, path_suffix, description, schema, enabled, handler_type,
       system_id, server_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    cleanRequired(input.name, "name"),
    cleanRequired(input.pathSuffix, "pathSuffix"),
    input.description ?? "",
    JSON.stringify(input.schema ?? {}),
    input.enabled === false ? 0 : 1,
    input.handlerType ?? "rag-http",
    cleanSystemId(input.systemId),
    input.serverId ?? null,
    t,
    t,
  );
  return getMcpTool(id)!;
}

export function updateMcpTool(
  id: string,
  patch: Partial<UpsertMcpToolInput>,
): McpToolRow | null {
  const current = getMcpTool(id);
  if (!current) return null;

  const next = {
    name: patch.name === undefined ? current.name : cleanRequired(patch.name, "name"),
    pathSuffix:
      patch.pathSuffix === undefined
        ? current.pathSuffix
        : cleanRequired(patch.pathSuffix, "pathSuffix"),
    description: patch.description ?? current.description,
    schema: patch.schema ?? current.schema,
    enabled: patch.enabled ?? current.enabled,
    handlerType: patch.handlerType ?? current.handlerType,
    systemId:
      patch.systemId === undefined ? current.systemId : cleanSystemId(patch.systemId),
    serverId: patch.serverId === undefined ? current.serverId : patch.serverId,
    updatedAt: now(),
  };

  getDb()
    .prepare(
      `UPDATE mcp_tools SET
         name=?, path_suffix=?, description=?, schema=?, enabled=?,
         handler_type=?, system_id=?, server_id=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      next.name,
      next.pathSuffix,
      next.description,
      JSON.stringify(next.schema),
      next.enabled ? 1 : 0,
      next.handlerType,
      next.systemId,
      next.serverId,
      next.updatedAt,
      id,
    );
  return getMcpTool(id);
}

export function getMcpTool(id: string): McpToolRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM mcp_tools WHERE id = ?`)
    .get(id) as McpToolRowDb | undefined;
  return row ? parse(row) : null;
}

export function deleteMcpTool(id: string): void {
  getDb().prepare(`DELETE FROM mcp_tools WHERE id = ?`).run(id);
}

function cleanRequired(value: string, name: string): string {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`${name} is required`);
  return cleaned;
}

function cleanSystemId(value: string | undefined): string {
  const cleaned = (value ?? "default").trim();
  if (!cleaned) throw new Error("systemId is required");
  return cleaned;
}

function safeJson(
  value: string | null,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}
