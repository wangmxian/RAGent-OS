import { nanoid } from "nanoid";
import { getDb, now } from "./db";

export type ExecutionMode = "chat" | "mcp_call" | "skill_call";

export interface ExecutionLogRow {
  id: string;
  conversationId: string | null;
  mode: ExecutionMode;
  target: string | null;
  input: unknown;
  decision: unknown;
  output: unknown;
  ok: boolean;
  error: string | null;
  durationMs: number;
  createdAt: number;
}

interface ExecutionLogDb {
  id: string;
  conversation_id: string | null;
  mode: ExecutionMode;
  target: string | null;
  input: string;
  decision: string;
  output: string;
  ok: number;
  error: string | null;
  duration_ms: number;
  created_at: number;
}

export interface CreateExecutionLogInput {
  conversationId?: string | null;
  mode: ExecutionMode;
  target?: string | null;
  input?: unknown;
  decision?: unknown;
  output?: unknown;
  ok: boolean;
  error?: string | null;
  durationMs: number;
}

export function createExecutionLog(input: CreateExecutionLogInput): string {
  const id = nanoid(14);
  getDb()
    .prepare(
      `INSERT INTO execution_logs (
         id, conversation_id, mode, target, input, decision, output,
         ok, error, duration_ms, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.conversationId ?? null,
      input.mode,
      input.target ?? null,
      safeStringify(input.input ?? null),
      safeStringify(input.decision ?? null),
      safeStringify(input.output ?? null),
      input.ok ? 1 : 0,
      input.error ?? null,
      input.durationMs,
      now(),
    );
  return id;
}

export function listExecutionLogs(limit = 100): ExecutionLogRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM execution_logs ORDER BY created_at DESC LIMIT ?`)
    .all(Math.min(Math.max(Math.trunc(limit), 1), 500)) as ExecutionLogDb[];
  return rows.map(parse);
}

function parse(row: ExecutionLogDb): ExecutionLogRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    mode: row.mode,
    target: row.target,
    input: safeParse(row.input),
    decision: safeParse(row.decision),
    output: safeParse(row.output),
    ok: !!row.ok,
    error: row.error,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify(String(value));
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
