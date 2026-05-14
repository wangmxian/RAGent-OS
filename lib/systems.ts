import { nanoid } from "nanoid";
import { getDb, now } from "./db";

export type SystemMode = "enterprise" | "personal";
export type SystemAuthMode = "none" | "bearer" | "forwarded";
export type SystemPermissionMode = "none" | "preflight" | "inline";

export interface SystemRateLimit {
  enabled: boolean;
  perMinute?: number;
  perHour?: number;
}

export interface SystemRow {
  id: string;
  name: string;
  description: string;
  mode: SystemMode;
  enabled: boolean;
  baseUrl: string | null;
  authMode: SystemAuthMode;
  prompt: string;
  permissionMode: SystemPermissionMode;
  permissionToolId: string | null;
  rateLimit: SystemRateLimit;
  auditEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SystemRowDb {
  id: string;
  name: string;
  description: string | null;
  mode: SystemMode;
  enabled: number;
  base_url: string | null;
  auth_mode: SystemAuthMode;
  prompt: string | null;
  permission_mode: SystemPermissionMode;
  permission_tool_id: string | null;
  rate_limit: string | null;
  audit_enabled: number;
  created_at: number;
  updated_at: number;
}

export interface UpsertSystemInput {
  id?: string;
  name: string;
  description?: string;
  mode?: SystemMode;
  enabled?: boolean;
  baseUrl?: string | null;
  authMode?: SystemAuthMode;
  prompt?: string;
  permissionMode?: SystemPermissionMode;
  permissionToolId?: string | null;
  rateLimit?: SystemRateLimit;
  auditEnabled?: boolean;
}

function parse(row: SystemRowDb): SystemRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    mode: normalizeMode(row.mode),
    enabled: !!row.enabled,
    baseUrl: row.base_url,
    authMode: normalizeAuthMode(row.auth_mode),
    prompt: row.prompt ?? "",
    permissionMode: normalizePermissionMode(row.permission_mode),
    permissionToolId: row.permission_tool_id,
    rateLimit: safeRateLimit(row.rate_limit),
    auditEnabled: !!row.audit_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSystems(): SystemRow[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM systems ORDER BY CASE WHEN id = 'default' THEN 0 ELSE 1 END, updated_at DESC`,
    )
    .all() as SystemRowDb[];
  return rows.map(parse);
}

export function getSystem(id: string): SystemRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM systems WHERE id = ?`)
    .get(id) as SystemRowDb | undefined;
  return row ? parse(row) : null;
}

export function createSystem(input: UpsertSystemInput): SystemRow {
  const id = cleanId(input.id) || nanoid(10);
  const mode = normalizeMode(input.mode ?? "enterprise");
  const t = now();
  getDb()
    .prepare(
      `INSERT INTO systems (
         id, name, description, mode, enabled, base_url, auth_mode, prompt,
         permission_mode, permission_tool_id, rate_limit, audit_enabled,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      cleanRequired(input.name, "name"),
      input.description ?? "",
      mode,
      input.enabled === false ? 0 : 1,
      cleanOptional(input.baseUrl),
      normalizeAuthMode(input.authMode ?? "none"),
      input.prompt ?? "",
      normalizePermissionMode(input.permissionMode ?? defaultPermissionMode(mode)),
      cleanOptional(input.permissionToolId),
      JSON.stringify(normalizeRateLimit(input.rateLimit)),
      input.auditEnabled === false ? 0 : 1,
      t,
      t,
    );
  return getSystem(id)!;
}

export function updateSystem(
  id: string,
  patch: Partial<UpsertSystemInput>,
): SystemRow | null {
  const current = getSystem(id);
  if (!current) return null;

  const next = {
    name: patch.name === undefined ? current.name : cleanRequired(patch.name, "name"),
    description: patch.description ?? current.description,
    mode: normalizeMode(patch.mode ?? current.mode),
    enabled: patch.enabled ?? current.enabled,
    baseUrl: patch.baseUrl === undefined ? current.baseUrl : cleanOptional(patch.baseUrl),
    authMode: normalizeAuthMode(patch.authMode ?? current.authMode),
    prompt: patch.prompt ?? current.prompt,
    permissionMode: normalizePermissionMode(
      patch.permissionMode ?? current.permissionMode,
    ),
    permissionToolId:
      patch.permissionToolId === undefined
        ? current.permissionToolId
        : cleanOptional(patch.permissionToolId),
    rateLimit: normalizeRateLimit(patch.rateLimit ?? current.rateLimit),
    auditEnabled: patch.auditEnabled ?? current.auditEnabled,
    updatedAt: now(),
  };

  getDb()
    .prepare(
      `UPDATE systems SET
         name=?, description=?, mode=?, enabled=?, base_url=?, auth_mode=?,
         prompt=?, permission_mode=?, permission_tool_id=?, rate_limit=?,
         audit_enabled=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      next.name,
      next.description,
      next.mode,
      next.enabled ? 1 : 0,
      next.baseUrl,
      next.authMode,
      next.prompt,
      next.permissionMode,
      next.permissionToolId,
      JSON.stringify(next.rateLimit),
      next.auditEnabled ? 1 : 0,
      next.updatedAt,
      id,
    );
  return getSystem(id);
}

function defaultPermissionMode(mode: SystemMode): SystemPermissionMode {
  return mode === "enterprise" ? "preflight" : "none";
}

function cleanRequired(value: string | undefined, name: string): string {
  const cleaned = (value ?? "").trim();
  if (!cleaned) throw new Error(`${name} is required`);
  return cleaned;
}

function cleanOptional(value: string | null | undefined): string | null {
  const cleaned = (value ?? "").trim();
  return cleaned ? cleaned : null;
}

function cleanId(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    throw new Error("id can only contain letters, numbers, _ and -");
  }
  return cleaned;
}

function normalizeMode(value: string): SystemMode {
  if (value === "enterprise" || value === "personal") return value;
  throw new Error("mode must be enterprise or personal");
}

function normalizeAuthMode(value: string): SystemAuthMode {
  if (value === "none" || value === "bearer" || value === "forwarded") {
    return value;
  }
  throw new Error("authMode must be none, bearer, or forwarded");
}

function normalizePermissionMode(value: string): SystemPermissionMode {
  if (value === "none" || value === "preflight" || value === "inline") {
    return value;
  }
  throw new Error("permissionMode must be none, preflight, or inline");
}

function normalizeRateLimit(value: SystemRateLimit | undefined): SystemRateLimit {
  if (!value || !value.enabled) return { enabled: false };
  return {
    enabled: true,
    perMinute: normalizePositiveInt(value.perMinute),
    perHour: normalizePositiveInt(value.perHour),
  };
}

function normalizePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function safeRateLimit(value: string | null): SystemRateLimit {
  if (!value) return { enabled: false };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { enabled: false };
    }
    return normalizeRateLimit(parsed as SystemRateLimit);
  } catch {
    return { enabled: false };
  }
}
