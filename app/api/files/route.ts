import { NextRequest, NextResponse } from "next/server";
import {
  listFiles,
  saveUploadedFile,
  indexFile,
} from "@/lib/files/ingest";
import { SUPPORTED_EXTENSIONS } from "@/lib/files/parse";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/files —— 列出所有文件 */
export async function GET() {
  return NextResponse.json({ files: listFiles() });
}

/**
 * POST /api/files —— 上传一个或多个文件并立即触发索引
 * multipart/form-data，字段名 `files`
 */
export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Content-Type must be multipart/form-data" },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e: any) {
    return NextResponse.json(
      { error: "Invalid form data: " + (e?.message || String(e)) },
      { status: 400 },
    );
  }

  const files = form.getAll("files").filter((x): x is File => x instanceof File);
  if (!files.length) {
    return NextResponse.json(
      { error: "no files provided" },
      { status: 400 },
    );
  }

  const results: any[] = [];
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      results.push({
        name: f.name,
        ok: false,
        error: `不支持的文件类型: ${ext || "(无扩展名)"}`,
      });
      continue;
    }
    try {
      const buf = Buffer.from(await f.arrayBuffer());
      const saved = await saveUploadedFile(
        buf,
        f.name,
        f.type || "application/octet-stream",
      );
      // 同步索引；前端可看到 status 直接 ready
      try {
        const idx = await indexFile(saved.id);
        results.push({
          ok: true,
          id: saved.id,
          name: saved.name,
          modality: saved.modality,
          chunkCount: idx.chunkCount,
        });
      } catch (e: any) {
        results.push({
          ok: false,
          id: saved.id,
          name: saved.name,
          error: "索引失败：" + (e?.message || String(e)),
        });
      }
    } catch (e: any) {
      results.push({
        ok: false,
        name: f.name,
        error: e?.message || String(e),
      });
    }
  }

  return NextResponse.json({ results });
}
