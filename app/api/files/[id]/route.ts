import { NextRequest, NextResponse } from "next/server";
import { deleteFile, indexFile } from "@/lib/files/ingest";
import { getDb } from "@/lib/db";
import path from "node:path";
import fs from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");

/** GET /api/files/[id] —— 详情（含 chunks 概览） */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const db = getDb();
  const file = db
    .prepare(`SELECT * FROM files WHERE id = ?`)
    .get(params.id);
  if (!file) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const chunks = db
    .prepare(
      `SELECT id, ord, modality, substr(text, 1, 200) AS preview, image_path
       FROM chunks WHERE file_id = ? ORDER BY ord`,
    )
    .all(params.id);
  return NextResponse.json({ file, chunks });
}

/** DELETE /api/files/[id] —— 删除文件、chunks、向量、磁盘文件 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await deleteFile(params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 },
    );
  }
}

/** POST /api/files/[id]?action=reindex —— 重建索引 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const action = new URL(req.url).searchParams.get("action");
  if (action === "reindex") {
    try {
      const r = await indexFile(params.id);
      return NextResponse.json({ ok: true, ...r });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || String(e) },
        { status: 500 },
      );
    }
  }
  if (action === "raw") {
    // 返回原始文件（用于预览）
    const db = getDb();
    const row = db
      .prepare(`SELECT path, mime, name FROM files WHERE id = ?`)
      .get(params.id) as
      | { path: string; mime: string; name: string }
      | undefined;
    if (!row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const abs = path.join(UPLOAD_DIR, row.path);
    const buf = await fs.readFile(abs);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": row.mime || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      },
    });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
