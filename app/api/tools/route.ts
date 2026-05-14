import { NextResponse } from "next/server";
import { listToolDescriptors } from "@/lib/tools/registry";
import { listUnifiedMcpTools } from "@/lib/mcp/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tools —— 内置工具列表（仅元数据） */
export async function GET() {
  return NextResponse.json({
    tools: listToolDescriptors(),
    mcpTools: listUnifiedMcpTools(),
  });
}
