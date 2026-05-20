import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_AGENT_PROMPT,
  getAgentPromptConfig,
  renderLayeredAgentPrompt,
  resetAgentPromptConfig,
  updateAgentPromptConfig,
} from "@/lib/agent-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const selectedSkillId = new URL(req.url).searchParams.get("skillId");
  return NextResponse.json({
    prompt: getAgentPromptConfig(),
    defaultPrompt: DEFAULT_AGENT_PROMPT,
    preview: renderLayeredAgentPrompt({ selectedSkillId }),
  });
}

export async function PATCH(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  try {
    const prompt =
      body.reset === true
        ? resetAgentPromptConfig()
        : updateAgentPromptConfig(String(body.content ?? ""));
    return NextResponse.json({ prompt, defaultPrompt: DEFAULT_AGENT_PROMPT });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 400 },
    );
  }
}
