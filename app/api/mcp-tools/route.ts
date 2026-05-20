import { NextRequest, NextResponse } from "next/server";
import {
  createMcpTool,
  deleteMcpTool,
  listMcpTools,
  updateMcpTool,
} from "@/lib/mcp/tool-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tools: listMcpTools() });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  try {
    const tool = createMcpTool({
      name: body.name,
      pathSuffix: body.pathSuffix ?? body.path_suffix,
      description: body.description,
      schema: parseSchema(body.schema),
      enabled: body.enabled,
      handlerType: body.handlerType ?? body.handler_type,
      systemId: body.systemId ?? body.system_id,
      permissionMode: body.permissionMode ?? body.permission_mode,
      rateLimit: parseRateLimit(body.rateLimit ?? body.rate_limit),
      fallback: parseFallback(body.fallback),
      serverId: body.serverId ?? body.server_id ?? null,
    });
    return NextResponse.json({ tool });
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
    const tool = updateMcpTool(id, {
      name: body.name,
      pathSuffix: body.pathSuffix ?? body.path_suffix,
      description: body.description,
      schema: body.schema === undefined ? undefined : parseSchema(body.schema),
      enabled: body.enabled,
      handlerType: body.handlerType ?? body.handler_type,
      systemId: body.systemId ?? body.system_id,
      permissionMode: body.permissionMode ?? body.permission_mode,
      rateLimit:
        body.rateLimit === undefined && body.rate_limit === undefined
          ? undefined
          : parseRateLimit(body.rateLimit ?? body.rate_limit),
      fallback:
        body.fallback === undefined ? undefined : parseFallback(body.fallback),
      serverId: body.serverId ?? body.server_id,
    });
    if (!tool) {
      return NextResponse.json({ error: "tool not found" }, { status: 404 });
    }
    return NextResponse.json({ tool });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 400 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  deleteMcpTool(id);
  return NextResponse.json({ ok: true });
}

function parseSchema(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === "string") {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("schema must be a JSON object");
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error("schema must be a JSON object");
}

function parseRateLimit(value: unknown) {
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

function parseFallback(value: unknown) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: false };
  }
  const raw = value as Record<string, unknown>;
  const fallbackParams = raw.fallbackParams ?? raw.fallback_params;
  return {
    enabled: !!raw.enabled,
    fallbackToolId: stringOrUndefined(raw.fallbackToolId ?? raw.fallback_tool_id),
    fallbackParams:
      fallbackParams && typeof fallbackParams === "object" && !Array.isArray(fallbackParams)
        ? (fallbackParams as Record<string, unknown>)
        : undefined,
  };
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
