import { NextRequest, NextResponse } from "next/server";
import { createSkill, listSkills } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ skills: listSkills() });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const skill = createSkill({
    name: body.name,
    icon: body.icon,
    description: body.description,
    version: body.version,
    steps: body.steps,
    systemPrompt: body.systemPrompt,
    toolIds: body.toolIds,
    defaultTemp: body.defaultTemp,
    enableThinking: body.enableThinking,
  });
  return NextResponse.json({ skill });
}
