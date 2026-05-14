import { ChatOpenAICompletions } from "@langchain/openai";
import { AIMessageChunk, type BaseMessageChunk } from "@langchain/core/messages";
import type { OpenAI } from "openai";

/**
 * vLLM / DeepSeek / Qwen3 等带 reasoning parser 的 OpenAI 兼容后端适配。
 *
 * 背景：
 *   @langchain/openai v1.x 的 `ChatOpenAI` 是 `ChatOpenAICompletions` 与
 *   `ChatOpenAIResponses` 的包装器。流式 delta 解析最终落到
 *   `_convertCompletionsDeltaToBaseMessageChunk`，但该方法对非 OpenAI
 *   官方的 `delta.reasoning_content` 透传不稳定（部分版本走另一条 hoisted
 *   函数，未把 reasoning 写回 additional_kwargs）。
 *
 * 本类继承 ChatOpenAICompletions，重写 protected 方法
 * `_convertCompletionsDeltaToBaseMessageChunk`，确保：
 *   - delta.reasoning_content  -> chunk.additional_kwargs.reasoning_content
 *   - delta.reasoning          -> chunk.additional_kwargs.reasoning_content
 *
 * 其余字段（content / tool_calls / function_call / id / response_metadata）
 * 由父类按官方协议处理，保持 LangChain agent / memory / tracing 等生态兼容。
 *
 * 用法：
 *   const llm = new ChatVLLM({
 *     model: "Qwen3.6-27B-FP8",
 *     apiKey: "EMPTY",
 *     configuration: { baseURL: "http://10.1.101.65:8001/v1" },
 *     streaming: true,
 *     modelKwargs: { chat_template_kwargs: { enable_thinking: true } },
 *   });
 *   for await (const c of await llm.stream(messages)) {
 *     const reasoning = c.additional_kwargs?.reasoning_content as string | undefined;
 *     const content = c.content as string;
 *     ...
 *   }
 */
export class ChatVLLM extends ChatOpenAICompletions {
  static lc_name(): string {
    return "ChatVLLM";
  }

  protected _convertCompletionsDeltaToBaseMessageChunk(
    delta: Record<string, any>,
    rawResponse: OpenAI.Chat.Completions.ChatCompletionChunk,
    defaultRole?: OpenAI.Chat.ChatCompletionRole,
  ): BaseMessageChunk {
    // 让父类先处理 content / tool_calls / function_call / role 等官方字段
    const base = super._convertCompletionsDeltaToBaseMessageChunk(
      delta,
      rawResponse,
      defaultRole,
    );

    // 补充非官方扩展：vLLM/DeepSeek/Qwen3 的 reasoning_content / reasoning
    const reasoning =
      (typeof delta.reasoning_content === "string"
        ? delta.reasoning_content
        : typeof delta.reasoning === "string"
          ? delta.reasoning
          : "") || "";

    if (!reasoning) return base;

    // base 通常已是 AIMessageChunk；把 reasoning_content 合并进 additional_kwargs
    const merged = new AIMessageChunk({
      content: (base.content as string) ?? "",
      additional_kwargs: {
        ...(base.additional_kwargs ?? {}),
        reasoning_content: reasoning,
      },
      tool_call_chunks: (base as AIMessageChunk).tool_call_chunks,
      id: (base as AIMessageChunk).id,
      response_metadata: (base as AIMessageChunk).response_metadata,
    });
    return merged;
  }
}
