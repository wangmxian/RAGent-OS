import { NextRequest, NextResponse } from "next/server";
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  sanitizeForClient,
  updateMcpServer,
} from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    servers: listMcpServers().map(sanitizeForClient),
    note: "",
  });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  if (!body?.name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  const s = createMcpServer({
    name: body.name,
    kind: body.kind,
    transport: body.transport,
    command: body.command,
    args: body.args,
    url: body.url,
    baseUrl: body.baseUrl ?? body.base_url,
    authToken: body.authToken ?? body.auth_token,
    env: body.env,
    enabled: !!body.enabled,
  });
  return NextResponse.json({ server: sanitizeForClient(s) });
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

  const server = updateMcpServer(id, {
    name: body.name,
    kind: body.kind,
    transport: body.transport,
    command: body.command,
    args: body.args,
    url: body.url,
    baseUrl: body.baseUrl ?? body.base_url,
    authToken: body.authToken ?? body.auth_token,
    env: body.env,
    enabled: body.enabled,
  });
  if (!server) {
    return NextResponse.json({ error: "server not found" }, { status: 404 });
  }
  return NextResponse.json({ server: sanitizeForClient(server) });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteMcpServer(id);
  return NextResponse.json({ ok: true });
}
