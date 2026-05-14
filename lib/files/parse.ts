import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
// pdf-parse 1.1.1：根 index.js 的 test-file 启动逻辑仅在 require.main===module
// 时触发；作为库引入是安全的。该版本不依赖 DOMMatrix，可在 Node 22 直接使用。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  buf: Buffer,
) => Promise<{ text: string; numpages: number }>;

export type Modality = "text" | "image";

export interface ParsedFile {
  modality: Modality;
  /** 提取出的纯文本（图片为 ""） */
  text: string;
  /** 仅 image 时填，绝对路径 */
  imagePath?: string;
  /** 原始 mime */
  mime: string;
  meta?: Record<string, unknown>;
}

const TEXT_EXT = new Set([".txt", ".md", ".markdown"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

export async function parseFile(
  absPath: string,
  originalName: string,
): Promise<ParsedFile> {
  const ext = path.extname(originalName).toLowerCase();
  const mime = mimeFromExt(ext);

  if (ext === ".pdf") {
    const buf = await fs.readFile(absPath);
    const r = await pdfParse(buf);
    return {
      modality: "text",
      text: r.text,
      mime,
      meta: { pages: r.numpages },
    };
  }

  if (ext === ".docx") {
    const buf = await fs.readFile(absPath);
    const r = await mammoth.extractRawText({ buffer: buf });
    return { modality: "text", text: r.value, mime };
  }

  if (TEXT_EXT.has(ext)) {
    const text = await fs.readFile(absPath, "utf8");
    return { modality: "text", text, mime };
  }

  if (IMAGE_EXT.has(ext)) {
    return {
      modality: "image",
      text: "",
      imagePath: absPath,
      mime,
    };
  }

  // 兜底：尝试当文本读
  try {
    const text = await fs.readFile(absPath, "utf8");
    return { modality: "text", text, mime: "text/plain" };
  } catch {
    throw new Error(`不支持的文件类型: ${ext || "(无扩展名)"}`);
  }
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

export const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".md",
  ".markdown",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
];
