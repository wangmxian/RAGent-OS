import path from "node:path";
import fs from "node:fs/promises";
import { nanoid } from "nanoid";
import { getDb, now } from "../db";
import { VLEmbeddings } from "../embeddings";
import {
  upsertChunksWithVectors,
  deleteVectorsByFileId,
  type ChunkRecord,
} from "../vectorstore";
import { parseFile } from "./parse";
import { chunkText } from "./chunk";

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");

export interface SavedFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  path: string; // 相对 UPLOAD_DIR 的路径
  modality: "text" | "image";
}

/** 写入上传的文件到磁盘并登记元数据，状态为 pending。 */
export async function saveUploadedFile(
  buf: Buffer,
  originalName: string,
  mime: string,
): Promise<SavedFile> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const id = nanoid(12);
  const safeName = originalName.replace(/[\\/:*?"<>|]/g, "_");
  const stored = `${id}_${safeName}`;
  const absPath = path.join(UPLOAD_DIR, stored);
  await fs.writeFile(absPath, buf);

  const ext = path.extname(originalName).toLowerCase();
  const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(
    ext,
  );
  const modality: "text" | "image" = isImage ? "image" : "text";

  const db = getDb();
  const t = now();
  db.prepare(
    `INSERT INTO files (id, name, mime, size, path, modality, status, chunk_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
  ).run(id, originalName, mime, buf.length, stored, modality, t, t);

  return {
    id,
    name: originalName,
    mime,
    size: buf.length,
    path: stored,
    modality,
  };
}

/** 把已登记的文件解析、切片、生成向量并写入索引。 */
export async function indexFile(fileId: string): Promise<{
  chunkCount: number;
  modality: "text" | "image";
}> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, name, mime, path, modality FROM files WHERE id = ?`,
    )
    .get(fileId) as
    | {
        id: string;
        name: string;
        mime: string;
        path: string;
        modality: "text" | "image";
      }
    | undefined;
  if (!row) throw new Error(`file not found: ${fileId}`);

  const absPath = path.join(UPLOAD_DIR, row.path);

  // 标记为索引中
  db.prepare(
    `UPDATE files SET status = 'indexing', error = NULL, updated_at = ? WHERE id = ?`,
  ).run(now(), fileId);

  try {
    // 删除该文件的旧 chunks 与向量
    deleteVectorsByFileId(fileId);

    const parsed = await parseFile(absPath, row.name);
    const emb = new VLEmbeddings();

    let records: ChunkRecord[] = [];
    let vectors: number[][] = [];

    if (parsed.modality === "text") {
      const chunks = await chunkText(parsed.text);
      if (chunks.length === 0) {
        throw new Error("文件未提取到任何可索引文本");
      }
      vectors = await emb.embedDocuments(chunks);
      records = chunks.map((text, i) => ({
        id: `${fileId}-${i}`,
        file_id: fileId,
        ord: i,
        modality: "text" as const,
        text,
        image_path: null,
      }));
    } else {
      // image：整图作为一个 chunk
      const v = await emb.embedImage(absPath);
      vectors = [v];
      records = [
        {
          id: `${fileId}-0`,
          file_id: fileId,
          ord: 0,
          modality: "image",
          text: null,
          image_path: row.path,
        },
      ];
    }

    upsertChunksWithVectors(records, vectors);

    db.prepare(
      `UPDATE files SET status = 'ready', chunk_count = ?, error = NULL, updated_at = ? WHERE id = ?`,
    ).run(records.length, now(), fileId);

    return { chunkCount: records.length, modality: parsed.modality };
  } catch (e: any) {
    db.prepare(
      `UPDATE files SET status = 'error', error = ?, updated_at = ? WHERE id = ?`,
    ).run(String(e?.message || e), now(), fileId);
    throw e;
  }
}

/** 物理删除：清理 chunks/向量、文件记录、磁盘文件 */
export async function deleteFile(fileId: string): Promise<void> {
  const db = getDb();
  const row = db
    .prepare(`SELECT path FROM files WHERE id = ?`)
    .get(fileId) as { path: string } | undefined;
  if (!row) return;

  deleteVectorsByFileId(fileId);
  db.prepare(`DELETE FROM files WHERE id = ?`).run(fileId);

  const abs = path.join(UPLOAD_DIR, row.path);
  await fs.unlink(abs).catch(() => {});
}

export function listFiles() {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, mime, size, modality, status, error, chunk_count, created_at, updated_at
       FROM files ORDER BY created_at DESC`,
    )
    .all();
}
