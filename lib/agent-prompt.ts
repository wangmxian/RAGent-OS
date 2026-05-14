import { getDb, now } from "./db";

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
}): string {
  const content = getAgentPromptConfig().content;
  return content
    .replaceAll("{{skills}}", input.skills || "(none)")
    .replaceAll("{{mcpTools}}", input.mcpTools || "(none)");
}
