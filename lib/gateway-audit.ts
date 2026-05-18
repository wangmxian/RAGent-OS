import { nanoid } from "nanoid";
import { getDb, now } from "./db";
import type { PlannerIdentitySummary, UserContext } from "./identity-context";
import type { ToolGatewayErrorType } from "./tool-gateway";

const PREVIEW_LIMIT = 4000;

export interface CreateGatewayAuditLogInput {
  requestId: string;
  conversationId?: string | null;
  systemId: string;
  toolId: string;
  toolName: string;
  userContext?: UserContext;
  identity?: PlannerIdentitySummary;
  params?: unknown;
  result?: unknown;
  permissionChecked: boolean;
  permissionAllowed?: boolean;
  fallbackUsed: boolean;
  ok: boolean;
  errorType?: ToolGatewayErrorType | string | null;
  errorMessage?: string | null;
  durationMs: number;
}

export interface GatewayAuditLogRow {
  id: string;
  requestId: string;
  conversationId: string | null;
  systemId: string;
  toolId: string;
  toolName: string;
  userId: string | null;
  tenantId: string | null;
  sessionUserId: string | null;
  identity: unknown;
  paramsPreview: unknown;
  resultPreview: unknown;
  permissionChecked: boolean;
  permissionAllowed: boolean | null;
  fallbackUsed: boolean;
  ok: boolean;
  errorType: string | null;
  errorMessage: string | null;
  durationMs: number;
  createdAt: number;
}

interface GatewayAuditLogDb {
  id: string;
  request_id: string;
  conversation_id: string | null;
  system_id: string;
  tool_id: string;
  tool_name: string;
  user_id: string | null;
  tenant_id: string | null;
  session_user_id: string | null;
  identity: string;
  params_preview: string;
  result_preview: string;
  permission_checked: number;
  permission_allowed: number | null;
  fallback_used: number;
  ok: number;
  error_type: string | null;
  error_message: string | null;
  duration_ms: number;
  created_at: number;
}

export function createGatewayAuditLog(input: CreateGatewayAuditLogInput): string {
  const id = nanoid(14);
  getDb()
    .prepare(
      `INSERT INTO gateway_audit_logs (
         id, request_id, conversation_id, system_id, tool_id, tool_name,
         user_id, tenant_id, session_user_id, identity, params_preview,
         result_preview, permission_checked, permission_allowed, fallback_used,
         ok, error_type, error_message, duration_ms, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.requestId,
      input.conversationId ?? null,
      input.systemId,
      input.toolId,
      input.toolName,
      input.userContext?.userId ?? null,
      input.userContext?.tenantId ?? null,
      input.userContext?.sessionUserId ?? null,
      stringifyPreview(input.identity ?? null),
      stringifyPreview(input.params ?? null),
      stringifyPreview(input.ok ? input.result ?? null : null),
      input.permissionChecked ? 1 : 0,
      input.permissionAllowed === undefined ? null : input.permissionAllowed ? 1 : 0,
      input.fallbackUsed ? 1 : 0,
      input.ok ? 1 : 0,
      input.errorType ?? null,
      input.errorMessage ? redactText(input.errorMessage) : null,
      input.durationMs,
      now(),
    );
  return id;
}

export function listGatewayAuditLogs(limit = 100): GatewayAuditLogRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM gateway_audit_logs ORDER BY created_at DESC LIMIT ?`)
    .all(Math.min(Math.max(Math.trunc(limit), 1), 500)) as GatewayAuditLogDb[];
  return rows.map(parse);
}

export function redactForAudit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForAudit);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? "[REDACTED]" : redactForAudit(child);
  }
  return out;
}

export function stringifyPreview(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(redactForAudit(value ?? null));
  } catch {
    text = JSON.stringify(redactText(String(value)));
  }
  if (text.length <= PREVIEW_LIMIT) return text;
  return `${text.slice(0, PREVIEW_LIMIT)}...`;
}

function parse(row: GatewayAuditLogDb): GatewayAuditLogRow {
  return {
    id: row.id,
    requestId: row.request_id,
    conversationId: row.conversation_id,
    systemId: row.system_id,
    toolId: row.tool_id,
    toolName: row.tool_name,
    userId: row.user_id,
    tenantId: row.tenant_id,
    sessionUserId: row.session_user_id,
    identity: safeParse(row.identity),
    paramsPreview: safeParse(row.params_preview),
    resultPreview: safeParse(row.result_preview),
    permissionChecked: !!row.permission_checked,
    permissionAllowed:
      row.permission_allowed === null ? null : !!row.permission_allowed,
    fallbackUsed: !!row.fallback_used,
    ok: !!row.ok,
    errorType: row.error_type,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(token|accessToken|refreshToken|password|secret|apiKey)=([^&\s]+)/gi, "$1=[REDACTED]");
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_\s]/g, "").toLowerCase();
  return (
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "apikey" ||
    normalized.includes("token") ||
    normalized.includes("password") ||
    normalized.includes("secret")
  );
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
