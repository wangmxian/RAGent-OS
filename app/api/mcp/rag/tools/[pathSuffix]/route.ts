import { NextRequest, NextResponse } from "next/server";
import { listUnifiedMcpTools } from "@/lib/mcp/dispatcher";
import { callToolGateway } from "@/lib/tool-gateway";

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
    const response = await callToolGateway(
      {
        toolName: tool.name,
        params: body,
        executionContext: {
          mode: "mcp_call",
          requestId: `mcp-route-${Date.now()}`,
        },
      },
      { signal: req.signal },
    );
    if (!response.ok) {
      return NextResponse.json(response, { status: 502 });
    }
    return NextResponse.json({ tool: tool.name, result: response.result, gateway: response.gateway });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 },
    );
  }
}
