import { NextRequest, NextResponse } from "next/server";
import {
  deleteConversation,
  getConversation,
  listMessages,
  updateConversation,
} from "@/lib/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/conversations/[id] —— 详情含消息 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const conv = getConversation(params.id);
  if (!conv) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const messages = listMessages(params.id);
  return NextResponse.json({ conversation: conv, messages });
}

/** PATCH /api/conversations/[id] —— 更新标题 / skill 绑定 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: { title?: string; skillId?: string | null } = {};
  try {
    body = await req.json();
  } catch {}
  const conv = updateConversation(params.id, body);
  if (!conv) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation: conv });
}

/** DELETE /api/conversations/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  deleteConversation(params.id);
  return NextResponse.json({ ok: true });
}
