import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import fs from "node:fs";
import path from "node:path";
import { RAG_TOOLS } from "./mcp/rag-tools";

const SQLITE_PATH =
  process.env.SQLITE_PATH || path.join(process.cwd(), "data", "app.db");

/**
 * 向量维度。Qwen3-VL-Embedding-8B 输出 4096 维。
 * 如果实际维度不同，首次调用 ensureVecSchema 时会自动重建表。
 */
export const DEFAULT_VECTOR_DIM = Number(
  process.env.EMBEDDING_DIM || 4096,
);

let _db: Database.Database | null = null;
let _vecDim: number | null = null;

/** 全局单例 SQLite 句柄；首次调用会执行 schema 迁移并加载 sqlite-vec 扩展。 */
export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(SQLITE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(SQLITE_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 加载 sqlite-vec 扩展（提供 vec0 虚拟表）
  sqliteVec.load(db);

  migrate(db);
  _db = db;
  return db;
}

/**
 * 确保向量虚拟表存在并匹配指定维度；维度变化会重建。
 * 调用方应在第一次拿到真实 embedding 维度后调用一次。
 */
export function ensureVecSchema(dim: number) {
  const db = getDb();
  if (_vecDim === dim) return;

  // 通过 pragma 获取已有 vec 表是否存在以及其维度声明
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='chunk_vectors'",
    )
    .get() as { sql?: string } | undefined;

  if (row?.sql) {
    const m = row.sql.match(/float\[(\d+)\]/i);
    const existingDim = m ? Number(m[1]) : null;
    if (existingDim === dim) {
      _vecDim = dim;
      return;
    }
    // 维度变了：清空重建
    db.exec("DROP TABLE chunk_vectors");
  }

  db.exec(`
    CREATE VIRTUAL TABLE chunk_vectors USING vec0(
      chunk_id TEXT PRIMARY KEY,
      embedding float[${dim}]
    );
  `);
  _vecDim = dim;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT '新会话',
      skill_id    TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role            TEXT NOT NULL CHECK(role IN ('system','user','assistant','tool')),
      content         TEXT NOT NULL,
      reasoning       TEXT,
      meta            TEXT, -- JSON: 引用源、tool_calls 等
      created_at      INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS files (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      mime        TEXT NOT NULL,
      size        INTEGER NOT NULL,
      path        TEXT NOT NULL,    -- 原文件相对路径
      modality    TEXT NOT NULL CHECK(modality IN ('text','image')) DEFAULT 'text',
      status      TEXT NOT NULL CHECK(status IN ('pending','indexing','ready','error')) DEFAULT 'pending',
      error       TEXT,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    -- chunks 仅存元数据；向量在 LanceDB 里以 chunk.id 为主键关联
    CREATE TABLE IF NOT EXISTS chunks (
      id          TEXT PRIMARY KEY,
      file_id     TEXT NOT NULL,
      ord         INTEGER NOT NULL, -- 在文件内的顺序
      modality    TEXT NOT NULL CHECK(modality IN ('text','image')),
      text        TEXT,             -- 文本片段或图片 OCR/caption
      image_path  TEXT,             -- 若为图片，原图相对路径
      meta        TEXT,             -- JSON
      created_at  INTEGER NOT NULL,
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id, ord);

    CREATE TABLE IF NOT EXISTS skills (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      icon            TEXT,
      description     TEXT,
      version         TEXT NOT NULL DEFAULT 'v1',
      steps           TEXT NOT NULL DEFAULT '[]', -- JSON array of executable skill steps
      system_prompt   TEXT NOT NULL DEFAULT '',
      tool_ids        TEXT NOT NULL DEFAULT '[]', -- JSON array of tool registry ids
      default_temp    REAL NOT NULL DEFAULT 0.7,
      enable_thinking INTEGER NOT NULL DEFAULT 0, -- 布尔
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS systems (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      description        TEXT NOT NULL DEFAULT '',
      mode               TEXT NOT NULL CHECK(mode IN ('enterprise','personal')),
      enabled            INTEGER NOT NULL DEFAULT 1,
      base_url           TEXT,
      auth_mode          TEXT NOT NULL CHECK(auth_mode IN ('none','bearer','forwarded')) DEFAULT 'none',
      prompt             TEXT NOT NULL DEFAULT '',
      permission_mode    TEXT NOT NULL CHECK(permission_mode IN ('none','preflight','inline')),
      permission_tool_id TEXT,
      rate_limit         TEXT NOT NULL DEFAULT '{"enabled":false}',
      audit_enabled      INTEGER NOT NULL DEFAULT 1,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL,
      FOREIGN KEY(permission_tool_id) REFERENCES mcp_tools(id) ON DELETE SET NULL
    );

    -- MCP 服务器配置
    -- kind: 'generic' (老的 stdio/sse 占位) | 'rag-http' (RuoYi AjaxResult 风格 HTTP 工具网关)
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      transport   TEXT NOT NULL CHECK(transport IN ('stdio','http','sse')),
      command     TEXT,
      args        TEXT, -- JSON array
      url         TEXT,
      env         TEXT, -- JSON object
      enabled     INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_tools (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL UNIQUE,
      path_suffix   TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      schema        TEXT NOT NULL DEFAULT '{}',
      enabled       INTEGER NOT NULL DEFAULT 1,
      handler_type  TEXT NOT NULL CHECK(handler_type IN ('local','rag-http','llm')),
      system_id     TEXT NOT NULL DEFAULT 'default',
      permission_mode TEXT NOT NULL CHECK(permission_mode IN ('inherit','none','preflight','inline')) DEFAULT 'inherit',
      rate_limit    TEXT NOT NULL DEFAULT '{"enabled":false}',
      server_id     TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      FOREIGN KEY(system_id) REFERENCES systems(id) ON DELETE RESTRICT,
      FOREIGN KEY(server_id) REFERENCES mcp_servers(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_tools_enabled ON mcp_tools(enabled);

    CREATE TABLE IF NOT EXISTS prompt_configs (
      key        TEXT PRIMARY KEY,
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS execution_logs (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT,
      mode            TEXT NOT NULL CHECK(mode IN ('chat','mcp_call','skill_call')),
      target          TEXT,
      input           TEXT NOT NULL,
      decision        TEXT NOT NULL,
      output          TEXT NOT NULL,
      ok              INTEGER NOT NULL,
      error           TEXT,
      duration_ms     INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at
      ON execution_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS gateway_audit_logs (
      id                 TEXT PRIMARY KEY,
      request_id         TEXT NOT NULL,
      conversation_id    TEXT,
      system_id          TEXT NOT NULL,
      tool_id            TEXT NOT NULL,
      tool_name          TEXT NOT NULL,
      user_id            TEXT,
      tenant_id          TEXT,
      session_user_id    TEXT,
      identity           TEXT NOT NULL,
      params_preview     TEXT NOT NULL,
      result_preview     TEXT NOT NULL,
      permission_checked INTEGER NOT NULL,
      permission_allowed INTEGER,
      fallback_used      INTEGER NOT NULL,
      ok                 INTEGER NOT NULL,
      error_type         TEXT,
      error_message      TEXT,
      duration_ms        INTEGER NOT NULL,
      created_at         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gateway_audit_logs_created_at
      ON gateway_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gateway_audit_logs_request
      ON gateway_audit_logs(request_id);
  `);

  // 后续新增字段：旧库幂等迁移
  addColumnIfMissing(db, "mcp_servers", "kind", "TEXT NOT NULL DEFAULT 'generic'");
  addColumnIfMissing(db, "mcp_servers", "base_url", "TEXT");
  addColumnIfMissing(db, "mcp_servers", "auth_token", "TEXT");
  addColumnIfMissing(db, "mcp_tools", "system_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(
    db,
    "mcp_tools",
    "permission_mode",
    "TEXT NOT NULL DEFAULT 'inherit'",
  );
  addColumnIfMissing(
    db,
    "mcp_tools",
    "rate_limit",
    "TEXT NOT NULL DEFAULT '{\"enabled\":false}'",
  );
  addColumnIfMissing(db, "skills", "version", "TEXT NOT NULL DEFAULT 'v1'");
  addColumnIfMissing(db, "skills", "steps", "TEXT NOT NULL DEFAULT '[]'");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mcp_tools_system ON mcp_tools(system_id);
  `);
  seedDefaultSystem(db);
  db.prepare(
    `UPDATE mcp_tools SET system_id = 'default' WHERE system_id IS NULL OR system_id = ''`,
  ).run();
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_run_logs (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT,
      skill           TEXT NOT NULL,
      args            TEXT NOT NULL,
      steps           TEXT NOT NULL,
      ok              INTEGER NOT NULL,
      error           TEXT,
      duration_ms     INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_skill_run_logs_conv
      ON skill_run_logs(conversation_id, created_at);
  `);
  seedDefaultRagMcpServer(db);
  seedDefaultMcpTools(db);
  seedDefaultSkills(db);
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  ddl: string,
) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.find((c) => c.name === column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (e: any) {
    if (!String(e?.message || e).includes("duplicate column name")) {
      throw e;
    }
  }
}

function seedDefaultRagMcpServer(db: Database.Database) {
  if (process.env.RAG_MCP_AUTO_SEED === "false") return;

  const existing = db
    .prepare(`SELECT id FROM mcp_servers WHERE kind = 'rag-http' LIMIT 1`)
    .get() as { id: string } | undefined;
  if (existing) return;

  const t = now();
  db.prepare(
    `INSERT INTO mcp_servers (
       id, name, kind, transport, command, args, url, base_url, auth_token, env,
       enabled, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "ruoyi-rag",
    process.env.RAG_MCP_NAME || "RuoYi RAG MCP",
    "rag-http",
    "http",
    null,
    "[]",
    null,
    process.env.RAG_MCP_BASE_URL || "http://10.1.101.65:8080",
    process.env.RAG_MCP_AUTH_TOKEN || null,
    "{}",
    process.env.RAG_MCP_ENABLED === "false" ? 0 : 1,
    t,
    t,
  );
}

function seedDefaultSystem(db: Database.Database) {
  const t = now();
  db.prepare(
    `INSERT OR IGNORE INTO systems (
       id, name, description, mode, enabled, base_url, auth_mode, prompt,
       permission_mode, permission_tool_id, rate_limit, audit_enabled,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "default",
    "Default System",
    "Personal default system for existing MCP tools.",
    "personal",
    1,
    null,
    "none",
    "",
    "none",
    null,
    JSON.stringify({ enabled: false }),
    1,
    t,
    t,
  );
}

function seedDefaultMcpTools(db: Database.Database) {
  const t = now();
  const ragServer = db
    .prepare(`SELECT id FROM mcp_servers WHERE kind = 'rag-http' ORDER BY created_at ASC LIMIT 1`)
    .get() as { id: string } | undefined;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO mcp_tools (
       id, name, path_suffix, description, schema, enabled, handler_type,
       system_id, server_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insert.run(
    "tool-rag-search",
    "ragSearch",
    "rag-search",
    "Enterprise knowledge-base vector search. Uses local sqlite-vec and returns top matching chunks.",
    JSON.stringify({ query: "string", topK: "number", fileIds: "string[]" }),
    1,
    "local",
    "default",
    null,
    t,
    t,
  );
  insert.run(
    "tool-llm-summary",
    "llmSummary",
    "llm-summary",
    "Summarize upstream tool results, knowledge chunks, and the user question into a final answer.",
    JSON.stringify({
      question: "string",
      context: "unknown",
      data: "unknown",
      knowledge: "unknown",
    }),
    1,
    "llm",
    "default",
    null,
    t,
    t,
  );

  for (const tool of RAG_TOOLS) {
    insert.run(
      `tool-${tool.name}`,
      tool.name,
      tool.pathSuffix,
      tool.description,
      JSON.stringify({ type: "zod", source: "RAG_TOOLS", name: tool.name }),
      1,
      "rag-http",
      "default",
      ragServer?.id ?? null,
      t,
      t,
    );
  }
}

function seedDefaultSkills(db: Database.Database) {
  if (process.env.SKILL_AUTO_SEED === "false") return;

  const defaults = [
    {
      id: "kb_qa",
      name: "知识库问答",
      icon: "📚",
      description: "检索企业知识库并基于命中片段回答问题。",
      version: "v1",
      steps: [
        {
          tool: "ragSearch",
          params: { query: "$input.query", topK: 5, fileIds: "$input.fileIds" },
        },
        {
          tool: "llmSummary",
          params: { context: "$step1.chunks", question: "$input.query" },
        },
      ],
    },
    {
      id: "query_ngfai_by_time",
      name: "查询 NGFAI 数据",
      icon: "📊",
      description: "解析用户时间表达并查询 CR241 AFMT NGFAI 柏拉图数据。",
      version: "v1",
      steps: [
        {
          tool: "resolveQueryTime",
          params: { timeExpression: "$input.time" },
        },
        {
          tool: "cr241AfmtNgFaiPareto",
          params: { queryMode: "month", month: "$step1.result" },
        },
      ],
    },
    {
      id: "ngfai_analysis",
      name: "NGFAI 数据与知识分析",
      icon: "🔀",
      description: "查询 NGFAI 数据，并结合知识库资料生成分析回答。",
      version: "v1",
      steps: [
        {
          tool: "resolveQueryTime",
          params: { timeExpression: "$input.time" },
        },
        {
          tool: "cr241AfmtNgFaiPareto",
          params: { queryMode: "month", month: "$step1.result" },
        },
        {
          tool: "ragSearch",
          params: { query: "NGFAI 异常原因", topK: 5, fileIds: "$input.fileIds" },
        },
        {
          tool: "llmSummary",
          params: {
            data: "$step2",
            knowledge: "$step3.chunks",
            question: "$input.query",
          },
        },
      ],
    },
  ];

  const insert = db.prepare(
    `INSERT INTO skills (
       id, name, icon, description, version, steps, system_prompt, tool_ids,
       default_temp, enable_thinking, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, '', '[]', 0.2, 0, ?, ?)`,
  );
  const updateEmptySteps = db.prepare(
    `UPDATE skills SET version=?, steps=?, updated_at=? WHERE id=? AND (steps IS NULL OR steps = '[]')`,
  );
  const t = now();
  for (const s of defaults) {
    const existing = db
      .prepare(`SELECT id FROM skills WHERE id = ?`)
      .get(s.id) as { id: string } | undefined;
    if (existing) {
      updateEmptySteps.run(s.version, JSON.stringify(s.steps), t, s.id);
      continue;
    }
    insert.run(
      s.id,
      s.name,
      s.icon,
      s.description,
      s.version,
      JSON.stringify(s.steps),
      t,
      t,
    );
  }
}

export function now(): number {
  return Date.now();
}
