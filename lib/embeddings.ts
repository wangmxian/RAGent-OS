import { Embeddings, type EmbeddingsParams } from "@langchain/core/embeddings";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 兼容 OpenAI Embeddings 协议的多模态 embedding。
 *
 * 文本：input 数组中元素为字符串
 * 图片：input 数组中元素为 { type: 'image_url', image_url: { url: 'data:...base64' } }
 *
 * 这是 OpenAI 多模态 embedding 提案的事实标准格式（vLLM / Qwen3-VL-Embedding 采用）。
 *
 * 用法：
 *   const emb = new VLEmbeddings();
 *   const v1 = await emb.embedQuery("你好");
 *   const v2 = await emb.embedImage("/abs/path/to/img.png");
 *   const vs = await emb.embedDocuments(["doc1", "doc2"]);
 */
export interface VLEmbeddingsParams extends EmbeddingsParams {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  batchSize?: number;
  /** 请求超时毫秒 */
  timeoutMs?: number;
}

type OpenAIEmbeddingItem =
  | string
  | {
      type: "image_url";
      image_url: { url: string };
    };

interface OpenAIEmbeddingResponse {
  data: Array<{ index: number; embedding: number[] }>;
  model: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export class VLEmbeddings extends Embeddings {
  baseURL: string;
  apiKey: string;
  model: string;
  batchSize: number;
  timeoutMs: number;

  constructor(fields: VLEmbeddingsParams = {}) {
    super(fields);
    this.baseURL = (
      fields.baseURL ||
      process.env.EMBEDDING_BASE_URL ||
      "http://10.1.101.65:8002/v1"
    ).replace(/\/$/, "");
    this.apiKey =
      fields.apiKey || process.env.EMBEDDING_API_KEY || "EMPTY";
    this.model =
      fields.model ||
      process.env.EMBEDDING_MODEL ||
      "qwen3-vl-embedding-8b";
    this.batchSize =
      fields.batchSize ??
      Number(process.env.EMBEDDING_BATCH_SIZE || 10);
    this.timeoutMs = fields.timeoutMs ?? 60_000;
  }

  /** LangChain 标准接口：批量文本 */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embedAny(texts);
  }

  /** LangChain 标准接口：单条 query */
  async embedQuery(text: string): Promise<number[]> {
    const v = await this.embedAny([text]);
    return v[0];
  }

  /** 为图片本地路径生成 embedding */
  async embedImage(absPath: string): Promise<number[]> {
    const item = await imagePathToInputItem(absPath);
    const v = await this.embedAny([item]);
    return v[0];
  }

  /** 批量混合输入；按 batchSize 拆分 */
  async embedAny(items: OpenAIEmbeddingItem[]): Promise<number[][]> {
    const out: number[][] = new Array(items.length);
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const vecs = await this.callEmbeddings(batch);
      for (let j = 0; j < vecs.length; j++) {
        out[i + j] = vecs[j];
      }
    }
    return out;
  }

  private async callEmbeddings(
    input: OpenAIEmbeddingItem[],
  ): Promise<number[][]> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseURL}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey || "EMPTY"}`,
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: this.model,
          input,
          encoding_format: "float",
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Embeddings ${res.status} ${res.statusText}: ${text.slice(0, 500)}`,
        );
      }
      const json = (await res.json()) as OpenAIEmbeddingResponse;
      // 按 index 还原顺序（部分实现可能乱序）
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    } finally {
      clearTimeout(t);
    }
  }
}

/** 把图片路径转成 OpenAI 多模态 input item（data URL） */
export async function imagePathToInputItem(
  absPath: string,
): Promise<OpenAIEmbeddingItem> {
  const buf = await fs.readFile(absPath);
  const ext = path.extname(absPath).slice(1).toLowerCase();
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "application/octet-stream";
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  return { type: "image_url", image_url: { url: dataUrl } };
}
