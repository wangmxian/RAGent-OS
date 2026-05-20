import assert from "node:assert/strict";
import { getDb, ensureVecSchema } from "../lib/db";
import { createSystem } from "../lib/systems";
import { upsertChunksWithVectors, vectorSearch } from "../lib/vectorstore";
import { callToolGateway } from "../lib/tool-gateway";

function insertFile(input: {
  id: string;
  name: string;
  systemId: string;
  visibility?: "system" | "skill" | "user";
  skillId?: string | null;
  userId?: string | null;
  tenantId?: string | null;
  kbRoleIds?: string[];
}) {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO files (
         id, name, mime, size, path, modality, status, chunk_count,
         system_id, skill_id, visibility, user_id, tenant_id, kb_role_ids,
         created_at, updated_at
       ) VALUES (?, ?, 'text/plain', 0, ?, 'text', 'ready', 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.name,
      `${input.id}.txt`,
      input.systemId,
      input.skillId ?? null,
      input.visibility ?? "system",
      input.userId ?? null,
      input.tenantId ?? null,
      JSON.stringify(input.kbRoleIds ?? []),
      now,
      now,
    );
}

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const personalSystemId = `rag-scope-personal-${suffix}`;
  const enterpriseSystemId = `rag-scope-enterprise-${suffix}`;
  const ids = {
    systems: [personalSystemId, enterpriseSystemId],
    files: [
      `scope-default-${suffix}`,
      `scope-other-${suffix}`,
      `scope-enterprise-open-${suffix}`,
      `scope-enterprise-role-${suffix}`,
    ],
  };

  try {
    createSystem({
      id: personalSystemId,
      name: "RAG Scope Personal Smoke",
      mode: "personal",
      permissionMode: "none",
      enabled: true,
    });
    createSystem({
      id: enterpriseSystemId,
      name: "RAG Scope Enterprise Smoke",
      mode: "enterprise",
      permissionMode: "none",
      enabled: true,
    });

    ensureVecSchema(3);
    insertFile({
      id: ids.files[0],
      name: "scope-personal.txt",
      systemId: personalSystemId,
    });
    insertFile({
      id: ids.files[1],
      name: "scope-other.txt",
      systemId: "default",
    });
    insertFile({
      id: ids.files[2],
      name: "scope-enterprise-open.txt",
      systemId: enterpriseSystemId,
      kbRoleIds: [],
    });
    insertFile({
      id: ids.files[3],
      name: "scope-enterprise-role.txt",
      systemId: enterpriseSystemId,
      kbRoleIds: ["kb-a"],
      tenantId: "tenant-a",
    });

    upsertChunksWithVectors(
      [
        {
          id: `${ids.files[0]}-0`,
          file_id: ids.files[0],
          ord: 0,
          modality: "text",
          text: "personal scoped chunk",
          image_path: null,
          meta: { scope: { systemId: personalSystemId, visibility: "system", kbRoleIds: [] } },
        },
        {
          id: `${ids.files[1]}-0`,
          file_id: ids.files[1],
          ord: 0,
          modality: "text",
          text: "other scoped chunk",
          image_path: null,
          meta: { scope: { systemId: "default", visibility: "system", kbRoleIds: [] } },
        },
        {
          id: `${ids.files[2]}-0`,
          file_id: ids.files[2],
          ord: 0,
          modality: "text",
          text: "enterprise open chunk",
          image_path: null,
          meta: {
            scope: { systemId: enterpriseSystemId, visibility: "system", kbRoleIds: [] },
          },
        },
        {
          id: `${ids.files[3]}-0`,
          file_id: ids.files[3],
          ord: 0,
          modality: "text",
          text: "enterprise role chunk",
          image_path: null,
          meta: {
            scope: {
              systemId: enterpriseSystemId,
              visibility: "system",
              tenantId: "tenant-a",
              kbRoleIds: ["kb-a"],
            },
          },
        },
      ],
      [
        [1, 0, 0],
        [0.9, 0, 0],
        [0.8, 0, 0],
        [0.7, 0, 0],
      ],
    );

    const personalHits = vectorSearch([1, 0, 0], {
      k: 4,
      scopeFilter: { systemId: personalSystemId, mode: "personal" },
    });
    assert.equal(personalHits.length, 1);
    assert.equal(personalHits[0].file_id, ids.files[0]);

    const enterpriseNoRole = vectorSearch([1, 0, 0], {
      k: 4,
      scopeFilter: {
        systemId: enterpriseSystemId,
        mode: "enterprise",
        userContext: { trustLevel: "trusted", tenantId: "tenant-a", kbRoleIds: [] },
      },
    });
    assert.equal(
      enterpriseNoRole.length,
      0,
      "enterprise docs without kbRoleIds should be invisible and role docs need match",
    );

    const enterpriseRole = vectorSearch([1, 0, 0], {
      k: 4,
      scopeFilter: {
        systemId: enterpriseSystemId,
        mode: "enterprise",
        userContext: {
          trustLevel: "trusted",
          tenantId: "tenant-a",
          kbRoleIds: ["kb-a"],
        },
      },
    });
    assert.equal(enterpriseRole.length, 1);
    assert.equal(enterpriseRole[0].file_id, ids.files[3]);

    const gateway = await callToolGateway(
      {
        toolName: "ragSearch",
        params: { query: "scope smoke", topK: 1, systemId: personalSystemId },
        executionContext: {
          mode: "mcp_call",
          requestId: `rag-scope-smoke-${suffix}`,
        },
      },
      { knowledgeEnabled: false },
    );
    assert.equal(gateway.ok, true, "ragSearch should still run through Gateway");

    console.log("RAG scope smoke OK");
  } finally {
    const db = getDb();
    for (const fileId of ids.files) {
      const chunkIds = db
        .prepare(`SELECT id FROM chunks WHERE file_id = ?`)
        .all(fileId) as Array<{ id: string }>;
      for (const chunk of chunkIds) {
        db.prepare(`DELETE FROM chunk_vectors WHERE chunk_id = ?`).run(chunk.id);
      }
      db.prepare(`DELETE FROM chunks WHERE file_id = ?`).run(fileId);
      db.prepare(`DELETE FROM files WHERE id = ?`).run(fileId);
    }
    for (const systemId of ids.systems) {
      db.prepare(`DELETE FROM systems WHERE id = ?`).run(systemId);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
