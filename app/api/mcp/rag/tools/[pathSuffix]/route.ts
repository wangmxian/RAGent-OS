import { NextRequest, NextResponse } from "next/server";
import {
  callUnifiedMcpTool,
  listUnifiedMcpTools,
} from "@/lib/mcp/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { pathSuffix: string } },
) {
  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {}

  const tool = listUnifiedMcpTools().find(
    (item) => item.enabled && item.pathSuffix === params.pathSuffix,
  );
  if (!tool) {
    return NextResponse.json(
      { error: `MCP tool not found: ${params.pathSuffix}` },
      { status: 404 },
    );
  }

  try {
    const result = await callUnifiedMcpTool(tool.name, body, {
      signal: req.signal,
    });
    return NextResponse.json({ tool: tool.name, result });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
