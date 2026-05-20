import { getDb, now } from "./db";
import { listMcpTools, type McpToolRow } from "./mcp/tool-config";
import { listSkills, type SkillRow } from "./skills";
import { getSystem, type SystemRow } from "./systems";

export const AGENT_PROMPT_KEY = "agent-routing";

export const DEFAULT_AGENT_PROMPT = [
  "You are the routing Agent for an enterprise AI scheduler.",
  "Return strict JSON only. Do not use markdown. Do not explain the decision.",
  "",
  "Decision rules:",
  "1. If the question can be answered directly, use chat.",
  "2. If exactly one MCP tool is sufficient, use mcp_call.",
  "3. If multiple steps or dependencies are required, use skill_call.",
  "",
  "Output formats:",
  "{\"type\":\"chat\",\"content\":\"answer text\"}",
  "{\"type\":\"mcp_call\",\"tool\":\"tool_name\",\"params\":{}}",
  "{\"type\":\"skill_call\",\"skill\":\"skill_id\",\"args\":{\"query\":\"...\",\"time\":\"...\"}}",
  "",
  "Constraints:",
  "- Only choose tools listed under MCP tools.",
  "- Only choose skills listed under Skills.",
  "- Knowledge-base retrieval must use ragSearch or a skill that contains ragSearch.",
  "- Prefer skill_call when the request needs tool output plus summarization or dependent parameter passing.",
  "- Extract query and time from the latest user input when using skill_call.",
  "- Do not make permission decisions. Tool execution permissions are checked by Tool Gateway.",
  "- If Tool Gateway returns PermissionDenied, report permission failure clearly.",
  "",
  "System prompts:",
  "{{systemPrompts}}",
  "",
  "Skill prompt:",
  "{{skillPrompt}}",
  "",
  "Skills:",
  "{{skills}}",
  "",
  "MCP tools:",
  "{{mcpTools}}",
].join("\n");

export interface AgentPromptConfig {
  key: string;
  content: string;
  updatedAt: number;
}

export function getAgentPromptConfig(): AgentPromptConfig {
  const row = getDb()
    .prepare(`SELECT key, content, updated_at FROM prompt_configs WHERE key = ?`)
    .get(AGENT_PROMPT_KEY) as
    | { key: string; content: string; updated_at: number }
    | undefined;
  if (!row) {
    return {
      key: AGENT_PROMPT_KEY,
      content: DEFAULT_AGENT_PROMPT,
      updatedAt: 0,
    };
  }
  return {
    key: row.key,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

export function updateAgentPromptConfig(content: string): AgentPromptConfig {
  const cleaned = content.trim();
  if (!cleaned) throw new Error("prompt content is required");
  const t = now();
  getDb()
    .prepare(
      `INSERT INTO prompt_configs (key, content, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`,
    )
    .run(AGENT_PROMPT_KEY, cleaned, t, t);
  return getAgentPromptConfig();
}

export function resetAgentPromptConfig(): AgentPromptConfig {
  return updateAgentPromptConfig(DEFAULT_AGENT_PROMPT);
}

export function renderAgentPrompt(input: {
  skills: string;
  mcpTools: string;
  systemPrompts?: string;
  skillPrompt?: string;
}): string {
  const content = getAgentPromptConfig().content;
  let rendered = content
    .replaceAll("{{systemPrompts}}", input.systemPrompts || "(none)")
    .replaceAll("{{skillPrompt}}", input.skillPrompt || "(none)")
    .replaceAll("{{skills}}", input.skills || "(none)")
    .replaceAll("{{mcpTools}}", input.mcpTools || "(none)");
  if (!content.includes("{{systemPrompts}}")) {
    rendered += `\n\nSystem prompts:\n${input.systemPrompts || "(none)"}`;
  }
  if (!content.includes("{{skillPrompt}}")) {
    rendered += `\n\nSkill prompt:\n${input.skillPrompt || "(none)"}`;
  }
  return rendered;
}

export interface AgentPromptPreviewInput {
  skills?: SkillRow[];
  mcpTools?: PromptToolDescriptor[];
  selectedSkillId?: string | null;
}

export interface PromptToolDescriptor {
  name: string;
  pathSuffix: string;
  description: string;
  schema: Record<string, unknown>;
  systemId: string;
  permissionMode: string;
  enabled?: boolean;
}

export interface AgentPromptPreview {
  prompt: string;
  sections: {
    globalPrompt: string;
    systemPrompts: string;
    skillPrompt: string;
    skills: string;
    mcpTools: string;
  };
  relevantSystemIds: string[];
  selectedSkillId?: string | null;
}

export function renderLayeredAgentPrompt(
  input: AgentPromptPreviewInput = {},
): AgentPromptPreview {
  const skills = input.skills ?? listSkills().filter((skill) => skill.steps.length > 0);
  const mcpTools = input.mcpTools ?? listMcpTools().filter((tool) => tool.enabled);
  const selectedSkill = input.selectedSkillId
    ? skills.find((skill) => skill.id === input.selectedSkillId) ?? null
    : null;
  const relevantSystems = resolveRelevantSystems(skills, mcpTools, selectedSkill);
  const systemPrompts = relevantSystems
    .filter((system) => system.prompt.trim())
    .map((system) =>
      JSON.stringify({
        systemId: system.id,
        name: system.name,
        prompt: system.prompt,
      }),
    )
    .join("\n");
  const skillPrompt = selectedSkill?.system_prompt?.trim() || "";
  const skillList = skills.map(skillForPrompt).join("\n");
  const toolList = mcpTools.map(toolForPrompt).join("\n");
  const globalPrompt = getAgentPromptConfig().content;

  return {
    prompt: renderAgentPrompt({
      skills: skillList,
      mcpTools: toolList,
      systemPrompts,
      skillPrompt,
    }),
    sections: {
      globalPrompt,
      systemPrompts,
      skillPrompt,
      skills: skillList,
      mcpTools: toolList,
    },
    relevantSystemIds: relevantSystems.map((system) => system.id),
    selectedSkillId: selectedSkill?.id ?? input.selectedSkillId ?? null,
  };
}

function resolveRelevantSystems(
  skills: SkillRow[],
  mcpTools: PromptToolDescriptor[],
  selectedSkill: SkillRow | null,
): SystemRow[] {
  const toolByName = new Map(mcpTools.map((tool) => [tool.name, tool]));
  const systemIds = new Set<string>();

  for (const tool of mcpTools) {
    systemIds.add(tool.systemId);
  }

  for (const skill of skills) {
    for (const step of skill.steps) {
      const tool = toolByName.get(step.tool);
      if (tool) systemIds.add(tool.systemId);
    }
  }

  if (selectedSkill) {
    systemIds.clear();
    for (const step of selectedSkill.steps) {
      const tool = toolByName.get(step.tool);
      if (tool) systemIds.add(tool.systemId);
    }
  }

  return [...systemIds]
    .map((id) => getSystem(id))
    .filter((system): system is SystemRow => !!system && system.enabled);
}

function skillForPrompt(skill: SkillRow): string {
  return JSON.stringify({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    steps: skill.steps.map((step) => step.tool),
  });
}

function toolForPrompt(tool: PromptToolDescriptor): string {
  return JSON.stringify({
    name: tool.name,
    pathSuffix: tool.pathSuffix,
    description: tool.description,
    schema: tool.schema,
    systemId: tool.systemId,
    permissionMode: tool.permissionMode,
  });
}
