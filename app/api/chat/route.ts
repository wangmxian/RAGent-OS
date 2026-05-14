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
import {
  callUnifiedMcpTool,
  listUnifiedMcpTools,
  type UnifiedMcpToolDescriptor,
} from "@/lib/mcp/dispatcher";

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
  useRetrieval?: boolean;
  useKnowledge?: boolean;
  fileIds?: string[];
  retrievalK?: number;
  conversationId?: string;
  skillId?: string | null;
}

type AgentDecision =
  | { type: "chat"; content: string }
  | { type: "mcp_call"; tool: string; params: Record<string, unknown> }
  | { type: "skill_call"; skill: string; args: Record<string, unknown> };

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
      .map((item: any) => (typeof item === "string" ? item : item?.text ?? ""))
      .join("");
  }
  return "";
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
      let collectedAnswer = "";
      let collectedReasoning = "";
      let chunkIdx = 0;
      let skillResult: SkillExecutionResult | null = null;
      let skillRunLogId: string | null = null;
      let sources = [] as SourceHit[];

      const emit = (event: string, data: unknown) => {
        controller.enqueue(sseEvent(encoder, event, data));
      };
      const emitAnswer = (delta: string) => {
        if (!delta) return;
        collectedAnswer += delta;
        emit("delta", { delta });
      };

      emit("start", { model, enableThinking, ts: Date.now() });

      try {
        const decision: AgentDecision = selectedSkill
          ? {
              type: "skill_call",
              skill: selectedSkill.id,
              args: buildDefaultArgs(messages, fileIds),
            }
          : await decideExecution(messages, {
              baseURL,
              apiKey,
              model,
              signal: req.signal,
              fileIds,
              knowledgeEnabled,
            });

        emit("decision", decision);

        if (decision.type === "chat") {
          if (decision.content) {
            emitAnswer(decision.content);
          } else {
            const streamed = await streamDirectChat(messages, {
              baseURL,
              apiKey,
              model,
              temperature,
              enableThinking,
              systemPrompt: body.systemPrompt,
              signal: req.signal,
              onThinking(delta) {
                collectedReasoning += delta;
                emit("thinking", { delta });
              },
              onAnswer(delta) {
                chunkIdx++;
                emitAnswer(delta);
              },
            });
            chunkIdx = streamed.chunks;
          }
        } else if (decision.type === "mcp_call") {
          const startedAt = Date.now();
          const params = normalizeMcpParams(decision.tool, decision.params, fileIds);
          const output = await callUnifiedMcpTool(decision.tool, params, {
            fileIds,
            knowledgeEnabled,
            signal: req.signal,
            llm: {
              baseURL,
              apiKey,
              model,
              temperature,
              enableThinking,
            },
          });
          emit("tool", {
            step: 1,
            name: decision.tool,
            ok: true,
            preview: JSON.stringify(output ?? null).slice(0, 500),
            durationMs: Date.now() - startedAt,
          });
          sources = sourcesFromMcpResult(output);
          if (sources.length) emit("sources", { hits: sources });
          emitAnswer(finalAnswerFromMcpResult(output));
        } else {
          const skill = getSkill(decision.skill);
          if (!skill) throw new Error(`Skill not found: ${decision.skill}`);

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
            emit("tool", {
              step: step.step,
              name: step.tool,
              ok: step.ok,
              preview: JSON.stringify(step.output ?? step.error).slice(0, 500),
              durationMs: step.durationMs,
            });
          }
          sources = sourcesFromSkillResult(skillResult);
          if (sources.length) emit("sources", { hits: sources });
          emitAnswer(
            skillResult.ok
              ? finalAnswerFromSkillResult(skillResult)
              : `Skill execution failed: ${skillResult.error}`,
          );

          skillRunLogId = createSkillRunLog({
            conversationId,
            skill: skill.id,
            args,
            steps: skillResult.steps,
            ok: skillResult.ok,
            error: skillResult.error,
            durationMs: skillResult.durationMs,
          });
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

        emit("done", {
          ok: true,
          chunks: chunkIdx,
          thinkingChars: collectedReasoning.length,
          answerChars: collectedAnswer.length,
          skillRunLogId,
        });
      } catch (err: any) {
        console.error("[chat] error", err);
        emit("error", { message: err?.message || String(err) });
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

async function decideExecution(
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
  const mcpTools = listUnifiedMcpTools().filter((tool) => tool.enabled);
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
  const skillList = skills.map(skillForPrompt).join("\n");
  const mcpToolList = mcpTools.map(toolForPrompt).join("\n");

  const res = await llm.invoke(
    [
      new SystemMessage(
        [
          "You are the routing Agent for an enterprise AI scheduler.",
          "Return strict JSON only. Do not use markdown. Do not explain the decision.",
          "",
          "Decision rules:",
          "1. If the question can be answered directly, use chat.",
          "2. If exactly one MCP tool is sufficient, use mcp_call.",
          "3. If multiple steps or dependencies are required, use skill_call.",
          "",
          "Output formats:",
          "{\"type\":\"chat\",\"content\":\"answer text\"}",
          "{\"type\":\"mcp_call\",\"tool\":\"tool_name\",\"params\":{}}",
          "{\"type\":\"skill_call\",\"skill\":\"skill_id\",\"args\":{\"query\":\"...\",\"time\":\"...\"}}",
          "",
          "Constraints:",
          "- Only choose tools listed under MCP tools.",
          "- Only choose skills listed under Skills.",
          "- Knowledge-base retrieval must use ragSearch or a skill that contains ragSearch.",
          "- Prefer skill_call when the request needs tool output plus summarization or dependent parameter passing.",
          "- Extract query and time from the latest user input when using skill_call.",
          "",
          `Skills:\n${skillList || "(none)"}`,
          "",
          `MCP tools:\n${mcpToolList || "(none)"}`,
        ].join("\n"),
      ),
      new HumanMessage(
        `Latest user input: ${lastUser?.content ?? ""}\n\nAvailable file scope: ${JSON.stringify(
          opts.knowledgeEnabled === false ? [] : opts.fileIds ?? [],
        )}`,
      ),
    ],
    { signal: opts.signal },
  );

  return parseDecision(messageText(res.content), mcpTools, skills.map((s) => s.id));
}

function parseDecision(
  raw: string,
  mcpTools: UnifiedMcpToolDescriptor[],
  skillIds: string[],
): AgentDecision {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed?.type === "skill_call" && typeof parsed.skill === "string") {
      if (!skillIds.includes(parsed.skill)) {
        return { type: "chat", content: "No matching skill is configured." };
      }
      return {
        type: "skill_call",
        skill: parsed.skill,
        args: plainObject(parsed.args),
      };
    }
    if (parsed?.type === "mcp_call" && typeof parsed.tool === "string") {
      if (!mcpTools.some((tool) => tool.name === parsed.tool)) {
        return { type: "chat", content: "No matching MCP tool is configured." };
      }
      return {
        type: "mcp_call",
        tool: parsed.tool,
        params: plainObject(parsed.params),
      };
    }
    if (parsed?.type === "chat") {
      return {
        type: "chat",
        content: typeof parsed.content === "string" ? parsed.content : "",
      };
    }
  } catch {}
  return { type: "chat", content: raw.trim() };
}

async function streamDirectChat(
  messages: ChatMessage[],
  opts: {
    baseURL: string;
    apiKey: string;
    model: string;
    temperature: number;
    enableThinking: boolean;
    systemPrompt?: string;
    signal: AbortSignal;
    onThinking: (delta: string) => void;
    onAnswer: (delta: string) => void;
  },
): Promise<{ chunks: number }> {
  const llm = new ChatVLLM({
    model: opts.model,
    apiKey: opts.apiKey,
    temperature: opts.temperature,
    streaming: true,
    configuration: { baseURL: opts.baseURL },
    modelKwargs: {
      chat_template_kwargs: { enable_thinking: opts.enableThinking },
    },
  });
  const finalSystem =
    opts.systemPrompt ||
    "Answer directly. Do not call tools. Use concise Chinese when the user writes Chinese.";
  const iter = await llm.stream(
    [new SystemMessage(finalSystem), ...toLcMessages(messages)],
    { signal: opts.signal },
  );
  let chunks = 0;
  for await (const chunk of iter) {
    chunks++;
    const reasoningDelta =
      ((chunk.additional_kwargs as any)?.reasoning_content as string) ?? "";
    const contentDelta = messageText(chunk.content);
    if (reasoningDelta) opts.onThinking(reasoningDelta);
    if (contentDelta) opts.onAnswer(contentDelta);
  }
  return { chunks };
}

function buildDefaultArgs(
  messages: ChatMessage[],
  fileIds?: string[],
): Record<string, unknown> {
  const query =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  return { query, time: query, fileIds: fileIds ?? [] };
}

function normalizeMcpParams(
  tool: string,
  params: Record<string, unknown>,
  fileIds?: string[],
): Record<string, unknown> {
  if (tool !== "ragSearch") return params;
  return {
    ...params,
    query: typeof params.query === "string" ? params.query : "",
    topK: typeof params.topK === "number" ? params.topK : 5,
    fileIds:
      Array.isArray(params.fileIds) && params.fileIds.length
        ? params.fileIds
        : fileIds ?? [],
  };
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

function finalAnswerFromMcpResult(result: unknown): string {
  if (result && typeof result === "object") {
    const value = result as any;
    if (typeof value.answer === "string") return value.answer;
    if (typeof value.result === "string") return value.result;
  }
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

interface SourceHit {
  chunk_id: string;
  file_id: string;
  file_name: string;
  ord: number;
  modality: "text" | "image";
  distance: number;
  preview: string;
}

function sourcesFromSkillResult(result: SkillExecutionResult): SourceHit[] {
  const out: SourceHit[] = [];
  for (const step of result.steps) {
    out.push(...sourcesFromChunks((step.output as any)?.chunks));
  }
  return out;
}

function sourcesFromMcpResult(result: unknown): SourceHit[] {
  return sourcesFromChunks((result as any)?.chunks);
}

function sourcesFromChunks(chunks: unknown): SourceHit[] {
  if (!Array.isArray(chunks)) return [];
  return chunks
    .map((chunk: any): SourceHit => {
      const modality: SourceHit["modality"] =
        chunk.modality === "image" ? "image" : "text";
      return {
        chunk_id: String(chunk.chunkId ?? ""),
        file_id: String(chunk.fileId ?? ""),
        file_name: String(chunk.fileName ?? ""),
        ord: Number(chunk.ord ?? 0),
        modality,
        distance: Number(chunk.distance ?? 0),
        preview: String(chunk.content ?? "").slice(0, 200),
      };
    })
    .filter((source) => source.chunk_id);
}

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function skillForPrompt(skill: ReturnType<typeof listSkills>[number]): string {
  return JSON.stringify({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    steps: skill.steps.map((step) => step.tool),
  });
}

function toolForPrompt(tool: UnifiedMcpToolDescriptor): string {
  return JSON.stringify({
    name: tool.name,
    pathSuffix: tool.pathSuffix,
    description: tool.description,
    schema: tool.schema,
  });
}
