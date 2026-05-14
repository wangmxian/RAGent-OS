import { NextRequest } from "next/server";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { ChatVLLM } from "@/lib/chat-vllm";
import {
  appendMessages,
  getConversation,
  maybeAutoTitle,
} from "@/lib/conversations";
import { createSkillRunLog, getSkill, listSkills } from "@/lib/skills";
import { executeSkill, type SkillExecutionResult } from "@/lib/skill-executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "system" | "user" | "assistant";
interface ChatMessage {
  role: Role;
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  enableThinking?: boolean;
  temperature?: number;
  systemPrompt?: string;
  /** Deprecated in strict skill mode. Knowledge QA must route through kb_qa. */
  useRetrieval?: boolean;
  useKnowledge?: boolean;
  fileIds?: string[];
  retrievalK?: number;
  conversationId?: string;
  /** User-selected skill. If present, bypasses agent selection and executes it. */
  skillId?: string | null;
}

type AgentDecision =
  | { type: "skill_call"; skill: string; args: Record<string, unknown> }
  | { type: "chat" };

function toLcMessages(messages: ChatMessage[]): BaseMessage[] {
  return messages.map((m) => {
    if (m.role === "system") return new SystemMessage(m.content);
    if (m.role === "assistant") return new AIMessage(m.content);
    return new HumanMessage(m.content);
  });
}

function sseEvent(
  encoder: TextEncoder,
  event: string,
  data: unknown,
): Uint8Array {
  const payload =
    typeof data === "string" ? data : JSON.stringify(data ?? null);
  return encoder.encode(`event: ${event}\ndata: ${payload}\n\n`);
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c === "string" ? c : c?.text ?? ""))
      .join("");
  }
  return "";
}

const OPEN_TAGS = ["<thinking>", "<think>"] as const;
const CLOSE_TAGS = ["</thinking>", "</think>"] as const;
const MAX_OPEN_LEN = Math.max(...OPEN_TAGS.map((t) => t.length));
const MAX_CLOSE_LEN = Math.max(...CLOSE_TAGS.map((t) => t.length));

function findFirst(
  hay: string,
  needles: readonly string[],
): { idx: number; tag: string } | null {
  let best: { idx: number; tag: string } | null = null;
  for (const n of needles) {
    const i = hay.indexOf(n);
    if (i !== -1 && (best === null || i < best.idx)) {
      best = { idx: i, tag: n };
    }
  }
  return best;
}

class ThinkSplitter {
  private buf = "";
  private inThink = false;
  push(text: string): { thinking: string; answer: string } {
    this.buf += text;
    let thinking = "";
    let answer = "";
    while (this.buf.length > 0) {
      if (!this.inThink) {
        const hit = findFirst(this.buf, OPEN_TAGS);
        if (!hit) {
          const safe = Math.max(0, this.buf.length - (MAX_OPEN_LEN - 1));
          answer += this.buf.slice(0, safe);
          this.buf = this.buf.slice(safe);
          break;
        }
        answer += this.buf.slice(0, hit.idx);
        this.buf = this.buf.slice(hit.idx + hit.tag.length);
        this.inThink = true;
      } else {
        const hit = findFirst(this.buf, CLOSE_TAGS);
        if (!hit) {
          const safe = Math.max(0, this.buf.length - (MAX_CLOSE_LEN - 1));
          thinking += this.buf.slice(0, safe);
          this.buf = this.buf.slice(safe);
          break;
        }
        thinking += this.buf.slice(0, hit.idx);
        this.buf = this.buf.slice(hit.idx + hit.tag.length);
        this.inThink = false;
      }
    }
    return { thinking, answer };
  }
  flush(): { thinking: string; answer: string } {
    const rest = this.buf;
    this.buf = "";
    return this.inThink
      ? { thinking: rest, answer: "" }
      : { thinking: "", answer: rest };
  }
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages = [], fileIds, conversationId, skillId } = body;
  const knowledgeEnabled = body.useKnowledge ?? body.useRetrieval ?? true;
  if (!messages.length) {
    return new Response("messages is required", { status: 400 });
  }

  const baseURL = process.env.OPENAI_BASE_URL || "http://10.1.101.65:8001/v1";
  const apiKey = process.env.OPENAI_API_KEY || "EMPTY";
  const model = process.env.OPENAI_MODEL || "Qwen3.6-27B-FP8";
  const selectedSkill = skillId ? getSkill(skillId) : null;
  const enableThinking =
    body.enableThinking ?? selectedSkill?.enable_thinking ?? false;
  const temperature = body.temperature ?? selectedSkill?.default_temp ?? 0.7;

  const llm = new ChatVLLM({
    model,
    apiKey,
    temperature,
    streaming: true,
    configuration: { baseURL },
    modelKwargs: {
      chat_template_kwargs: { enable_thinking: enableThinking },
    },
  });

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (conversationId && getConversation(conversationId) && lastUserMsg) {
    appendMessages(conversationId, [
      { role: "user", content: lastUserMsg.content },
    ]);
    maybeAutoTitle(conversationId, lastUserMsg.content);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const splitter = new ThinkSplitter();
      let chunkIdx = 0;
      let totalThinking = 0;
      let totalAnswer = 0;
      let collectedAnswer = "";
      let collectedReasoning = "";
      let skillResult: SkillExecutionResult | null = null;
      let skillRunLogId: string | null = null;
      let sources = [] as ReturnType<typeof sourcesFromSkillResult>;

      controller.enqueue(
        sseEvent(encoder, "start", { model, enableThinking, ts: Date.now() }),
      );

      const emitAnswer = (text: string) => {
        const { thinking, answer } = splitter.push(text);
        if (thinking) {
          totalThinking += thinking.length;
          collectedReasoning += thinking;
          controller.enqueue(sseEvent(encoder, "thinking", { delta: thinking }));
        }
        if (answer) {
          totalAnswer += answer.length;
          collectedAnswer += answer;
          controller.enqueue(sseEvent(encoder, "delta", { delta: answer }));
        }
      };

      const streamAnswer = async (inputMessages: BaseMessage[]) => {
        const iter = await llm.stream(inputMessages, { signal: req.signal });
        for await (const chunk of iter) {
          chunkIdx++;
          const reasoningDelta: string =
            ((chunk.additional_kwargs as any)?.reasoning_content as string) ??
            "";
          const contentDelta = messageText(chunk.content);
          if (reasoningDelta) {
            totalThinking += reasoningDelta.length;
            collectedReasoning += reasoningDelta;
            controller.enqueue(
              sseEvent(encoder, "thinking", { delta: reasoningDelta }),
            );
          }
          if (contentDelta) emitAnswer(contentDelta);
        }
      };

      try {
        const decision = selectedSkill
          ? {
              type: "skill_call" as const,
              skill: selectedSkill.id,
              args: buildDefaultArgs(messages, fileIds),
            }
          : await decideSkill(messages, {
              baseURL,
              apiKey,
              model,
              signal: req.signal,
              fileIds,
            });

        controller.enqueue(sseEvent(encoder, "decision", decision));

        if (decision.type === "skill_call") {
          const skill = getSkill(decision.skill);
          if (!skill) {
            throw new Error(`Skill not found: ${decision.skill}`);
          }
          const args = {
            ...buildDefaultArgs(messages, fileIds),
            ...(decision.args ?? {}),
          };
          skillResult = await executeSkill(skill, args, {
            fileIds,
            knowledgeEnabled,
            signal: req.signal,
            llm: {
              baseURL,
              apiKey,
              model,
              temperature: skill.default_temp,
              enableThinking: skill.enable_thinking,
            },
          });
          for (const step of skillResult.steps) {
            controller.enqueue(
              sseEvent(encoder, "tool", {
                step: step.step,
                name: step.tool,
                ok: step.ok,
                preview: JSON.stringify(step.output ?? step.error).slice(0, 500),
                durationMs: step.durationMs,
              }),
            );
          }
          sources = sourcesFromSkillResult(skillResult);
          if (sources.length) {
            controller.enqueue(sseEvent(encoder, "sources", { hits: sources }));
          }
          if (!skillResult.ok) {
            emitAnswer(`执行技能 ${skill.name} 失败：${skillResult.error}`);
          } else {
            emitAnswer(finalAnswerFromSkillResult(skillResult));
          }
          skillRunLogId = createSkillRunLog({
            conversationId,
            skill: skill.id,
            args,
            steps: skillResult.steps,
            ok: skillResult.ok,
            error: skillResult.error,
            durationMs: skillResult.durationMs,
          });
        } else {
          const finalSystem = [
            body.systemPrompt || "你是一个有帮助的 AI 助手，使用简洁、准确的中文回答。",
            "严格规则：你不能直接调用 MCP 或任何工具。企业数据、知识库、考勤、NGFAI 等需要真实数据的问题，应由 Agent 选择 Skill；如果当前没有选择 Skill，就不要编造数据。",
          ]
            .filter(Boolean)
            .join("\n\n");
          await streamAnswer([new SystemMessage(finalSystem), ...toLcMessages(messages)]);
        }

        const tail = splitter.flush();
        if (tail.thinking) {
          totalThinking += tail.thinking.length;
          collectedReasoning += tail.thinking;
          controller.enqueue(sseEvent(encoder, "thinking", { delta: tail.thinking }));
        }
        if (tail.answer) {
          totalAnswer += tail.answer.length;
          collectedAnswer += tail.answer;
          controller.enqueue(sseEvent(encoder, "delta", { delta: tail.answer }));
        }

        if (
          conversationId &&
          getConversation(conversationId) &&
          (collectedAnswer || collectedReasoning)
        ) {
          appendMessages(conversationId, [
            {
              role: "assistant",
              content: collectedAnswer,
              reasoning: collectedReasoning || null,
              meta: {
                ...(sources.length ? { sources } : {}),
                ...(skillResult
                  ? {
                      skillRun: {
                        id: skillRunLogId,
                        skill: skillResult.skill,
                        args: skillResult.args,
                        steps: skillResult.steps,
                        ok: skillResult.ok,
                        error: skillResult.error,
                        durationMs: skillResult.durationMs,
                      },
                    }
                  : {}),
              },
            },
          ]);
        }

        controller.enqueue(
          sseEvent(encoder, "done", {
            ok: true,
            chunks: chunkIdx,
            thinkingChars: totalThinking,
            answerChars: totalAnswer,
            skillRunLogId,
          }),
        );
      } catch (err: any) {
        console.error("[chat] error", err);
        controller.enqueue(
          sseEvent(encoder, "error", {
            message: err?.message || String(err),
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function decideSkill(
  messages: ChatMessage[],
  opts: {
    baseURL: string;
    apiKey: string;
    model: string;
    signal: AbortSignal;
    fileIds?: string[];
    knowledgeEnabled?: boolean;
  },
): Promise<AgentDecision> {
  const skills = listSkills().filter((skill) => skill.steps.length > 0);
  const llm = new ChatVLLM({
    model: opts.model,
    apiKey: opts.apiKey,
    temperature: 0,
    streaming: false,
    configuration: { baseURL: opts.baseURL },
    modelKwargs: {
      chat_template_kwargs: { enable_thinking: false },
    },
  });
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const skillList = skills
    .map((skill) =>
      JSON.stringify({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        steps: skill.steps.map((step) => step.tool),
      }),
    )
    .join("\n");
  const res = await llm.invoke(
    [
      new SystemMessage(
        [
          "你是企业智能助手的调度 Agent。你的唯一职责是从 Skill 列表中选择一个 Skill，或返回普通聊天。",
          "禁止调用工具。禁止解释。必须只输出严格 JSON。",
          "输出格式一：{\"type\":\"skill_call\",\"skill\":\"skill_id\",\"args\":{\"query\":\"...\",\"time\":\"...\"}}",
          "输出格式二：{\"type\":\"chat\"}",
          "企业知识库/文档/制度/资料问答优先选择 kb_qa。",
          "NGFAI、CR241、柏拉图、考勤、到岗等企业数据问题必须选择最匹配的 Skill。",
          "尽量从用户输入中提取 query 和 time；没有时间时 time 可为空字符串。",
          `Skill 列表：\n${skillList}`,
        ].join("\n"),
      ),
      new HumanMessage(
        `用户最新输入：${lastUser?.content ?? ""}\n\n可选文件范围：${JSON.stringify(
          opts.knowledgeEnabled === false ? [] : opts.fileIds ?? [],
        )}`,
      ),
    ],
    { signal: opts.signal },
  );
  return parseDecision(messageText(res.content));
}

function parseDecision(raw: string): AgentDecision {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed?.type === "skill_call" && typeof parsed.skill === "string") {
      return {
        type: "skill_call",
        skill: parsed.skill,
        args:
          parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)
            ? parsed.args
            : {},
      };
    }
    if (parsed?.type === "chat") return { type: "chat" };
  } catch {}
  return { type: "chat" };
}

function buildDefaultArgs(
  messages: ChatMessage[],
  fileIds?: string[],
): Record<string, unknown> {
  const query = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  return { query, time: query, fileIds: fileIds ?? [] };
}

function finalAnswerFromSkillResult(result: SkillExecutionResult): string {
  const last = result.result as any;
  if (last && typeof last === "object") {
    if (typeof last.answer === "string") return last.answer;
    if (typeof last.result === "string") return last.result;
  }
  if (typeof last === "string") return last;
  return JSON.stringify(last, null, 2);
}

function sourcesFromSkillResult(result: SkillExecutionResult) {
  const out: Array<{
    chunk_id: string;
    file_id: string;
    file_name: string;
    ord: number;
    modality: "text" | "image";
    distance: number;
    preview: string;
  }> = [];
  for (const step of result.steps) {
    const chunks = (step.output as any)?.chunks;
    if (!Array.isArray(chunks)) continue;
    for (const chunk of chunks) {
      out.push({
        chunk_id: String(chunk.chunkId ?? ""),
        file_id: String(chunk.fileId ?? ""),
        file_name: String(chunk.fileName ?? ""),
        ord: Number(chunk.ord ?? 0),
        modality: chunk.modality === "image" ? "image" : "text",
        distance: Number(chunk.distance ?? 0),
        preview: String(chunk.content ?? "").slice(0, 200),
      });
    }
  }
  return out.filter((source) => source.chunk_id);
}
