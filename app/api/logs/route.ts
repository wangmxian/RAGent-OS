import { NextRequest, NextResponse } from "next/server";
import { listExecutionLogs } from "@/lib/execution-logs";
import { listGatewayAuditLogs } from "@/lib/gateway-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 100);
  return NextResponse.json({
    logs: listExecutionLogs(limit),
    gatewayLogs: listGatewayAuditLogs(limit),
  });
}
