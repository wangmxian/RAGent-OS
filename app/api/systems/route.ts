import { NextRequest, NextResponse } from "next/server";
import {
  createSystem,
  listSystems,
  updateSystem,
  type SystemAuthMode,
  type SystemMode,
  type SystemPermissionMode,
  type SystemRateLimit,
} from "@/lib/systems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ systems: listSystems() });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  try {
    const system = createSystem({
      id: body.id,
      name: body.name,
      description: body.description,
      mode: body.mode as SystemMode | undefined,
      enabled: body.enabled,
      baseUrl: body.baseUrl ?? body.base_url ?? null,
      authMode: body.authMode ?? body.auth_mode,
      prompt: body.prompt,
      permissionMode: body.permissionMode ?? body.permission_mode,
      permissionToolId: body.permissionToolId ?? body.permission_tool_id ?? null,
      rateLimit: parseRateLimit(body.rateLimit ?? body.rate_limit),
      auditEnabled: body.auditEnabled ?? body.audit_enabled,
    });
    return NextResponse.json({ system });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const id = body?.id ?? new URL(req.url).searchParams.get("id");
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const system = updateSystem(id, {
      name: body.name,
      description: body.description,
      mode: body.mode as SystemMode | undefined,
      enabled: body.enabled,
      baseUrl: body.baseUrl ?? body.base_url,
      authMode: (body.authMode ?? body.auth_mode) as SystemAuthMode | undefined,
      prompt: body.prompt,
      permissionMode: (body.permissionMode ?? body.permission_mode) as
        | SystemPermissionMode
        | undefined,
      permissionToolId:
        body.permissionToolId === undefined && body.permission_tool_id === undefined
          ? undefined
          : body.permissionToolId ?? body.permission_tool_id ?? null,
      rateLimit:
        body.rateLimit === undefined && body.rate_limit === undefined
          ? undefined
          : parseRateLimit(body.rateLimit ?? body.rate_limit),
      auditEnabled: body.auditEnabled ?? body.audit_enabled,
    });
    if (!system) {
      return NextResponse.json({ error: "system not found" }, { status: 404 });
    }
    return NextResponse.json({ system });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 400 },
    );
  }
}

function parseRateLimit(value: unknown): SystemRateLimit | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: false };
  }
  const raw = value as Record<string, unknown>;
  return {
    enabled: !!raw.enabled,
    perMinute: numberOrUndefined(raw.perMinute ?? raw.per_minute),
    perHour: numberOrUndefined(raw.perHour ?? raw.per_hour),
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === "" || value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
