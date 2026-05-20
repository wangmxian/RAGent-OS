import { VLEmbeddings } from "./embeddings";
import { vectorSearch, type SearchHit } from "./vectorstore";
import type { RagScopeFilter } from "./rag-scope";

export interface RetrieveOptions {
  /** 召回数量，默认 5 */
  k?: number;
  /** 仅在指定文件 id 集合内检索 */
  fileIds?: string[];
  /** 限定模态 */
  modalities?: Array<"text" | "image">;
  /** 距离阈值；超过该值的命中将被过滤掉（cosine distance，越小越相似） */
  maxDistance?: number;
  /** 是否启用 MMR 多样性重排 */
  useMmr?: boolean;
  /** MMR 候选池大小（须 >= k） */
  mmrFetchK?: number;
  /** MMR lambda：1=只看相关性，0=只看多样性 */
  mmrLambda?: number;
  scopeFilter?: RagScopeFilter;
}

export interface RetrieveResult {
  hits: SearchHit[];
  /** 用 query 实际产生的向量维度 */
  dim: number;
}

let _emb: VLEmbeddings | null = null;
function getEmbeddings(): VLEmbeddings {
  if (!_emb) _emb = new VLEmbeddings();
  return _emb;
}

/**
 * 端到端检索：query -> 向量 -> KNN -> （可选 MMR）。
 * 不依赖 LangChain VectorStore（sqlite-vec 没有官方适配），但行为一致。
 */
export async function retrieve(
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrieveResult> {
  const {
    k = 5,
    fileIds,
    modalities,
    maxDistance,
    useMmr = false,
    mmrFetchK,
    mmrLambda = 0.5,
    scopeFilter,
  } = options;

  const emb = getEmbeddings();
  const queryVec = await emb.embedQuery(query);

  const fetchK = useMmr ? Math.max(mmrFetchK ?? k * 4, k) : k;
  let hits = vectorSearch(queryVec, {
    k: fetchK,
    fileIds,
    modalities,
    scopeFilter,
  });

  if (maxDistance != null) {
    hits = hits.filter((h) => h.distance <= maxDistance);
  }

  if (useMmr && hits.length > k) {
    // 需要 hits 的向量参与多样性计算；暂时用文本重新做一次 embedding 简化
    // 注：可改为入库时同时存 vector 副本以避免二次 embedding
    const candidateTexts = hits.map((h) => h.text ?? "");
    const candidateVecs = await emb.embedDocuments(candidateTexts);
    hits = mmr(queryVec, candidateVecs, hits, k, mmrLambda);
  } else if (hits.length > k) {
    hits = hits.slice(0, k);
  }

  return { hits, dim: queryVec.length };
}

/** Maximal Marginal Relevance 重排 */
function mmr<T>(
  queryVec: number[],
  candVecs: number[][],
  candItems: T[],
  k: number,
  lambda: number,
): T[] {
  const n = candItems.length;
  const selected: number[] = [];
  const selectedItems: T[] = [];

  const queryNorm = norm(queryVec);
  const candNorms = candVecs.map(norm);

  const simToQuery = candVecs.map(
    (v, i) => cosineSim(v, queryVec, candNorms[i], queryNorm),
  );

  while (selectedItems.length < k && selected.length < n) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      if (selected.includes(i)) continue;
      let maxSimToSelected = 0;
      for (const j of selected) {
        const s = cosineSim(
          candVecs[i],
          candVecs[j],
          candNorms[i],
          candNorms[j],
        );
        if (s > maxSimToSelected) maxSimToSelected = s;
      }
      const score =
        lambda * simToQuery[i] - (1 - lambda) * maxSimToSelected;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    selected.push(bestIdx);
    selectedItems.push(candItems[bestIdx]);
  }
  return selectedItems;
}

function norm(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s) || 1;
}
function cosineSim(
  a: number[],
  b: number[],
  na: number,
  nb: number,
): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (na * nb);
}

/** 为引用展示格式化命中片段 */
export function hitsToContext(hits: SearchHit[]): string {
  return hits
    .map((h, i) => {
      const head = `[${i + 1}] ${h.file_name}#${h.ord}`;
      const body = h.text ? h.text.trim() : `(image: ${h.image_path})`;
      return `${head}\n${body}`;
    })
    .join("\n\n---\n\n");
}
