import { nanoid } from "nanoid";
import { getDb, now } from "./db";

export interface ConversationRow {
  id: string;
  title: string;
  skill_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning: string | null;
  meta: Record<string, unknown> | null;
  created_at: number;
}

export interface MessageInput {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning?: string | null;
  meta?: Record<string, unknown> | null;
}

export function listConversations(): ConversationRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, title, skill_id, created_at, updated_at
       FROM conversations ORDER BY updated_at DESC`,
    )
    .all() as ConversationRow[];
}

export function createConversation(opts: {
  title?: string;
  skillId?: string | null;
}): ConversationRow {
  const db = getDb();
  const id = nanoid(12);
  const t = now();
  const title = (opts.title || "新会话").slice(0, 100);
  db.prepare(
    `INSERT INTO conversations (id, title, skill_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, title, opts.skillId ?? null, t, t);
  return { id, title, skill_id: opts.skillId ?? null, created_at: t, updated_at: t };
}

export function getConversation(id: string): ConversationRow | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT id, title, skill_id, created_at, updated_at
         FROM conversations WHERE id = ?`,
      )
      .get(id) as ConversationRow | undefined) ?? null
  );
}

export function updateConversation(
  id: string,
  patch: { title?: string; skillId?: string | null },
): ConversationRow | null {
  const db = getDb();
  const existing = getConversation(id);
  if (!existing) return null;
  const t = now();
  db.prepare(
    `UPDATE conversations SET
       title = COALESCE(?, title),
       skill_id = COALESCE(?, skill_id),
       updated_at = ?
     WHERE id = ?`,
  ).run(
    patch.title ?? null,
    patch.skillId === undefined ? null : patch.skillId,
    t,
    id,
  );
  return getConversation(id);
}

export function deleteConversation(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

export function listMessages(conversationId: string): MessageRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, conversation_id, role, content, reasoning, meta, created_at
       FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(conversationId) as Array<
    Omit<MessageRow, "meta"> & { meta: string | null }
  >;
  return rows.map((r) => ({
    ...r,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));
}

/** 批量追加消息（事务） */
export function appendMessages(
  conversationId: string,
  msgs: MessageInput[],
): MessageRow[] {
  const db = getDb();
  if (!getConversation(conversationId)) {
    throw new Error(`conversation not found: ${conversationId}`);
  }
  const insert = db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, reasoning, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateConv = db.prepare(
    `UPDATE conversations SET updated_at = ? WHERE id = ?`,
  );
  const out: MessageRow[] = [];
  const tx = db.transaction(() => {
    let t = now();
    for (const m of msgs) {
      const id = nanoid(14);
      insert.run(
        id,
        conversationId,
        m.role,
        m.content,
        m.reasoning ?? null,
        m.meta ? JSON.stringify(m.meta) : null,
        t,
      );
      out.push({
        id,
        conversation_id: conversationId,
        role: m.role,
        content: m.content,
        reasoning: m.reasoning ?? null,
        meta: m.meta ?? null,
        created_at: t,
      });
      // 同毫秒下保持顺序：以 1ms 步进
      t += 1;
    }
    updateConv.run(now(), conversationId);
  });
  tx();
  return out;
}

/**
 * 用首条 user 消息为新会话生成默认标题（截断 30 字）。
 */
export function maybeAutoTitle(conversationId: string, firstUserText: string) {
  const db = getDb();
  const conv = getConversation(conversationId);
  if (!conv) return;
  if (conv.title && conv.title !== "新会话") return;
  const title = firstUserText.replace(/\s+/g, " ").trim().slice(0, 30) ||
    "新会话";
  db.prepare(
    `UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`,
  ).run(title, now(), conversationId);
}
