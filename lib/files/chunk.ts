import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface ChunkOpts {
  /** 每片最大字符数 */
  chunkSize?: number;
  /** 相邻片重叠字符数 */
  chunkOverlap?: number;
}

/**
 * 使用 LangChain 的 RecursiveCharacterTextSplitter 切分文本。
 * 默认对中文友好的分隔符序列。
 */
export async function chunkText(
  text: string,
  opts: ChunkOpts = {},
): Promise<string[]> {
  const { chunkSize = 800, chunkOverlap = 100 } = opts;
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: [
      "\n\n",
      "\n",
      "。",
      "！",
      "？",
      ".",
      "!",
      "?",
      "；",
      ";",
      "，",
      ",",
      " ",
      "",
    ],
  });
  const chunks = await splitter.splitText(text);
  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}
