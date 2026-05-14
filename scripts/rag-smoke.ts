/**
 * 自检脚本：DB + Embedding + 向量入库 + 向量检索。
 * 运行：npm run smoke
 */
import "dotenv/config";
import { getDb, ensureVecSchema } from "../lib/db";
import { VLEmbeddings } from "../lib/embeddings";
import {
  upsertChunksWithVectors,
  vectorSearch,
} from "../lib/vectorstore";

async function main() {
  console.log("==> 初始化 SQLite + sqlite-vec");
  const db = getDb();
  const jm = db.pragma("journal_mode") as Array<{ journal_mode: string }>;
  console.log("    SQLite OK, journal_mode=", jm[0].journal_mode);

  console.log("==> 调用 embedding 服务做一次冒烟（短文本）");
  const emb = new VLEmbeddings();
  const t0 = Date.now();
  const queryVec = await emb.embedQuery("这是一个测试句子");
  console.log(
    `    向量维度: ${queryVec.length}, 耗时: ${Date.now() - t0}ms`,
  );
  ensureVecSchema(queryVec.length);

  console.log("==> 准备 3 个文本片段并入库");
  const fileId = "smoke-file-1";
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO files (id, name, mime, size, path, modality, status, chunk_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    fileId,
    "smoke.txt",
    "text/plain",
    0,
    "smoke.txt",
    "text",
    "ready",
    3,
    now,
    now,
  );

  const docs = [
    "猫是一种小型哺乳动物，常被作为宠物饲养。",
    "Python 是一门解释型编程语言，广泛用于数据分析。",
    "杭州是浙江省的省会城市，拥有西湖等著名景点。",
  ];
  const vecs = await emb.embedDocuments(docs);

  upsertChunksWithVectors(
    docs.map((text, i) => ({
      id: `${fileId}-${i}`,
      file_id: fileId,
      ord: i,
      modality: "text" as const,
      text,
      image_path: null,
    })),
    vecs,
  );
  console.log("    入库完成");

  const queryStr = "我想了解养猫的常识";
  console.log(`==> 检索：'${queryStr}'`);
  const q = await emb.embedQuery(queryStr);
  const hits = vectorSearch(q, { k: 3 });
  for (const h of hits) {
    console.log(`    [${h.distance.toFixed(4)}] ${h.text}`);
  }
  console.log("==> 完成 ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error("自检失败:", e);
  process.exit(1);
});
