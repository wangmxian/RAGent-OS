import { NextRequest, NextResponse } from "next/server";
import { deleteSkill, getSkill, updateSkill } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const s = getSkill(params.id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ skill: s });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const s = updateSkill(params.id, body);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ skill: s });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  deleteSkill(params.id);
  return NextResponse.json({ ok: true });
}
