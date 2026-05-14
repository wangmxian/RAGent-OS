import { NextRequest, NextResponse } from "next/server";
import {
  listConversations,
  createConversation,
} from "@/lib/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/conversations —— 列表 */
export async function GET() {
  return NextResponse.json({ conversations: listConversations() });
}

/** POST /api/conversations —— 新建 */
export async function POST(req: NextRequest) {
  let body: { title?: string; skillId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    /* 允许空 body */
  }
  const conv = createConversation({
    title: body.title,
    skillId: body.skillId,
  });
  return NextResponse.json({ conversation: conv });
}
