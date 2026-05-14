import { getDb, ensureVecSchema } from "./db";

/** 把 number[] 序列化为 sqlite-vec 期望的 Float32 LE Buffer */
function serializeFloat32(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i], i * 4);
  }
  return buf;
}

/**
 * 单个文档片段的元数据；向量另存于 chunk_vectors 虚表。
 */
export interface ChunkRecord {
  id: string;
  file_id: string;
  ord: number;
  modality: "text" | "image";
  text: string | null;
  image_path: string | null;
  meta?: Record<string, unknown>;
}

export interface SearchHit {
  chunk_id: string;
  file_id: string;
  ord: number;
  modality: "text" | "image";
  text: string | null;
  image_path: string | null;
  file_name: string;
  distance: number; // 越小越相似（cosine distance）
  meta?: Record<string, unknown> | null;
}

/**
 * 写入或更新一组 chunk 及其向量。
 * 调用方应保证 chunks.length === vectors.length 且 vectors 已是同维度的 number[]。
 */
export function upsertChunksWithVectors(
  chunks: ChunkRecord[],
  vectors: number[][],
) {
  if (!chunks.length) return;
  if (chunks.length !== vectors.length) {
    throw new Error(
      `chunks (${chunks.length}) and vectors (${vectors.length}) length mismatch`,
    );
  }
  const dim = vectors[0].length;
  ensureVecSchema(dim);

  const db = getDb();
  const now = Date.now();
  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, file_id, ord, modality, text, image_path, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      file_id=excluded.file_id,
      ord=excluded.ord,
      modality=excluded.modality,
      text=excluded.text,
      image_path=excluded.image_path,
      meta=excluded.meta
  `);

  // sqlite-vec 的 vec0 虚表不支持 ON CONFLICT，故改为 DELETE + INSERT
  const deleteVec = db.prepare(
    `DELETE FROM chunk_vectors WHERE chunk_id = ?`,
  );
  const insertVec = db.prepare(
    `INSERT INTO chunk_vectors (chunk_id, embedding) VALUES (?, ?)`,
  );

  const tx = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      insertChunk.run(
        c.id,
        c.file_id,
        c.ord,
        c.modality,
        c.text,
        c.image_path,
        c.meta ? JSON.stringify(c.meta) : null,
        now,
      );
      deleteVec.run(c.id);
      insertVec.run(c.id, serializeFloat32(vectors[i]));
    }
  });
  tx();
}

/**
 * 余弦距离 KNN 搜索。
 * 可选 fileIds 过滤；返回带文件名的命中。
 */
export function vectorSearch(
  queryVec: number[],
  options: {
    k?: number;
    fileIds?: string[];
    modalities?: Array<"text" | "image">;
  } = {},
): SearchHit[] {
  const db = getDb();
  const k = options.k ?? 5;

  // sqlite-vec 的 KNN 写法：
  //   SELECT chunk_id, distance FROM chunk_vectors
  //   WHERE embedding MATCH ? AND k = ?
  //   ORDER BY distance
  // 然后 JOIN 元数据表过滤
  ensureVecSchema(queryVec.length);

  const blob = serializeFloat32(queryVec);

  // 先取 KNN candidate（取多一些方便过滤）
  const candidatesK = Math.min(Math.max(k * 4, 16), 200);
  const knn = db
    .prepare(
      `SELECT chunk_id, distance
       FROM chunk_vectors
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`,
    )
    .all(blob, candidatesK) as Array<{
    chunk_id: string;
    distance: number;
  }>;

  if (!knn.length) return [];

  const idList = knn.map((r) => r.chunk_id);
  const placeholders = idList.map(() => "?").join(",");

  type ChunkRow = {
    id: string;
    file_id: string;
    ord: number;
    modality: "text" | "image";
    text: string | null;
    image_path: string | null;
    meta: string | null;
    file_name: string;
  };
  const rows = db
    .prepare(
      `SELECT c.id, c.file_id, c.ord, c.modality, c.text, c.image_path, c.meta,
              f.name AS file_name
       FROM chunks c JOIN files f ON f.id = c.file_id
       WHERE c.id IN (${placeholders})`,
    )
    .all(...idList) as ChunkRow[];

  const byId = new Map<string, ChunkRow>();
  for (const r of rows) byId.set(r.id, r);

  const hits: SearchHit[] = [];
  for (const { chunk_id, distance } of knn) {
    const c = byId.get(chunk_id);
    if (!c) continue;
    if (options.fileIds && !options.fileIds.includes(c.file_id)) continue;
    if (options.modalities && !options.modalities.includes(c.modality)) continue;
    hits.push({
      chunk_id,
      file_id: c.file_id,
      ord: c.ord,
      modality: c.modality,
      text: c.text,
      image_path: c.image_path,
      file_name: c.file_name,
      distance,
      meta: c.meta ? JSON.parse(c.meta) : null,
    });
    if (hits.length >= k) break;
  }
  return hits;
}

/** 删除某文件下的所有 chunks 与向量（外键级联会带走 chunks，但向量需要单独清理） */
export function deleteVectorsByFileId(fileId: string) {
  const db = getDb();
  const ids = db
    .prepare("SELECT id FROM chunks WHERE file_id = ?")
    .all(fileId) as Array<{ id: string }>;
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM chunk_vectors WHERE chunk_id IN (${placeholders})`,
    ).run(...ids.map((r) => r.id));
    db.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
  });
  tx();
}
