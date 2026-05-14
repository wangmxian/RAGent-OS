import { nanoid } from "nanoid";
import { getDb, now } from "./db";

export interface SkillStep {
  tool: string;
  params: Record<string, unknown>;
}

export interface SkillRow {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  version: string;
  steps: SkillStep[];
  system_prompt: string;
  tool_ids: string[]; // 解析后
  default_temp: number;
  enable_thinking: boolean;
  created_at: number;
  updated_at: number;
}

interface SkillRowDb {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  version: string;
  steps: string;
  system_prompt: string;
  tool_ids: string;
  default_temp: number;
  enable_thinking: number;
  created_at: number;
  updated_at: number;
}

function rowToSkill(r: SkillRowDb): SkillRow {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    description: r.description,
    version: r.version || "v1",
    steps: safeJsonSteps(r.steps),
    system_prompt: r.system_prompt,
    tool_ids: safeJsonArray(r.tool_ids),
    default_temp: r.default_temp,
    enable_thinking: !!r.enable_thinking,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function safeJsonSteps(s: string): SkillStep[] {
  try {
    const v = JSON.parse(s);
    if (!Array.isArray(v)) return [];
    return v
      .filter((step) => step && typeof step === "object")
      .map((step) => ({
        tool: typeof step.tool === "string" ? step.tool : "",
        params:
          step.params && typeof step.params === "object" && !Array.isArray(step.params)
            ? step.params
            : {},
      }))
      .filter((step) => step.tool);
  } catch {
    return [];
  }
}

export function validateSkillSteps(steps: unknown): SkillStep[] {
  if (!Array.isArray(steps)) {
    throw new Error("steps must be an array");
  }
  return steps.map((step, idx) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      throw new Error(`steps[${idx}] must be an object`);
    }
    const raw = step as Record<string, unknown>;
    if (typeof raw.tool !== "string" || !raw.tool.trim()) {
      throw new Error(`steps[${idx}].tool is required`);
    }
    if (
      raw.params == null ||
      typeof raw.params !== "object" ||
      Array.isArray(raw.params)
    ) {
      throw new Error(`steps[${idx}].params must be an object`);
    }
    return {
      tool: raw.tool.trim(),
      params: raw.params as Record<string, unknown>,
    };
  });
}

export function listSkills(): SkillRow[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM skills ORDER BY updated_at DESC`)
    .all() as SkillRowDb[];
  return rows.map(rowToSkill);
}

export function getSkill(id: string): SkillRow | null {
  const db = getDb();
  const r = db.prepare(`SELECT * FROM skills WHERE id = ?`).get(id) as
    | SkillRowDb
    | undefined;
  return r ? rowToSkill(r) : null;
}

export function createSkill(input: {
  name: string;
  icon?: string | null;
  description?: string | null;
  version?: string;
  steps?: unknown;
  systemPrompt?: string;
  toolIds?: string[];
  defaultTemp?: number;
  enableThinking?: boolean;
}): SkillRow {
  const db = getDb();
  const id = nanoid(10);
  const t = now();
  const steps = input.steps === undefined ? [] : validateSkillSteps(input.steps);
  db.prepare(
    `INSERT INTO skills (id, name, icon, description, version, steps, system_prompt, tool_ids, default_temp, enable_thinking, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.icon ?? null,
    input.description ?? null,
    input.version ?? "v1",
    JSON.stringify(steps),
    input.systemPrompt ?? "",
    JSON.stringify(input.toolIds ?? []),
    input.defaultTemp ?? 0.7,
    input.enableThinking ? 1 : 0,
    t,
    t,
  );
  return getSkill(id)!;
}

export function updateSkill(
  id: string,
  patch: Partial<{
    name: string;
    icon: string | null;
    description: string | null;
    version: string;
    steps: unknown;
    systemPrompt: string;
    toolIds: string[];
    defaultTemp: number;
    enableThinking: boolean;
  }>,
): SkillRow | null {
  const db = getDb();
  const existing = getSkill(id);
  if (!existing) return null;
  const merged = {
    name: patch.name ?? existing.name,
    icon: patch.icon === undefined ? existing.icon : patch.icon,
    description:
      patch.description === undefined ? existing.description : patch.description,
    version: patch.version ?? existing.version,
    steps: JSON.stringify(
      patch.steps === undefined ? existing.steps : validateSkillSteps(patch.steps),
    ),
    system_prompt:
      patch.systemPrompt === undefined
        ? existing.system_prompt
        : patch.systemPrompt,
    tool_ids: JSON.stringify(
      patch.toolIds === undefined ? existing.tool_ids : patch.toolIds,
    ),
    default_temp: patch.defaultTemp ?? existing.default_temp,
    enable_thinking:
      (patch.enableThinking === undefined
        ? existing.enable_thinking
        : patch.enableThinking)
        ? 1
        : 0,
  };
  db.prepare(
    `UPDATE skills SET name=?, icon=?, description=?, version=?, steps=?, system_prompt=?, tool_ids=?, default_temp=?, enable_thinking=?, updated_at=? WHERE id=?`,
  ).run(
    merged.name,
    merged.icon,
    merged.description,
    merged.version,
    merged.steps,
    merged.system_prompt,
    merged.tool_ids,
    merged.default_temp,
    merged.enable_thinking,
    now(),
    id,
  );
  return getSkill(id);
}

export function deleteSkill(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM skills WHERE id = ?`).run(id);
}

export interface SkillRunLogInput {
  conversationId?: string | null;
  skill: string;
  args: Record<string, unknown>;
  steps: unknown[];
  ok: boolean;
  error?: string | null;
  durationMs: number;
}

export function createSkillRunLog(input: SkillRunLogInput): string {
  const db = getDb();
  const id = nanoid(14);
  db.prepare(
    `INSERT INTO skill_run_logs (
       id, conversation_id, skill, args, steps, ok, error, duration_ms, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.conversationId ?? null,
    input.skill,
    JSON.stringify(input.args ?? {}),
    JSON.stringify(input.steps ?? []),
    input.ok ? 1 : 0,
    input.error ?? null,
    input.durationMs,
    now(),
  );
  return id;
}
