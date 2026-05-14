"use client";
import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  User,
  Bot,
  FileText,
  Image as ImageIcon,
  Copy,
  Check,
} from "lucide-react";

export type Role = "user" | "assistant";

export interface SourceHit {
  chunk_id: string;
  file_id: string;
  file_name: string;
  ord: number;
  modality: "text" | "image";
  distance: number;
  preview: string;
}

interface Props {
  role: Role;
  content: string;
  streaming?: boolean;
  sources?: SourceHit[];
}

/**
 * 解析推理标签，把 `<think>...</think>` 或 `<thinking>...</thinking>`
 * 中的内容剥出来作为推理过程，剩余部分作为正文。
 *
 * 支持：
 *   - 多段交替（模型可能每个 token 都包一对标签）
 *   - 流式未闭合的最后一段（thinkingOpen=true 时正文继续在 think 内）
 *   - 大小写不敏感
 */
function splitThinking(raw: string): {
  thinking: string;
  answer: string;
  thinkingOpen: boolean;
} {
  const re = /<(think(?:ing)?)>([\s\S]*?)(<\/\1>|$)/gi;
  let thinking = "";
  let answer = "";
  let lastIndex = 0;
  let thinkingOpen = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    answer += raw.slice(lastIndex, m.index);
    thinking += m[2];
    // 第三组是 </think> 或 </thinking>，若为空说明流式未闭合
    if (!m[3]) thinkingOpen = true;
    lastIndex = re.lastIndex;
  }
  answer += raw.slice(lastIndex);
  return { thinking, answer, thinkingOpen };
}

export default function Message({ role, content, streaming, sources }: Props) {
  const [open, setOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const { thinking, answer, thinkingOpen } = useMemo(
    () => splitThinking(content),
    [content],
  );

  const isUser = role === "user";

  return (
    <div className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-[#10a37f] flex items-center justify-center shrink-0 shadow-sm">
          <Bot size={16} className="text-white" />
        </div>
      )}
      <div className={`${isUser ? "max-w-[80%] order-1" : "max-w-[80%] sm:max-w-[760px] flex-1"}`}>
        {thinking && (
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 text-xs">
            <button
              onClick={() => setOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-800"
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Brain size={14} />
              <span>
                推理过程 {thinkingOpen ? "(思考中…)" : `(${thinking.length} 字)`}
              </span>
            </button>
            {open && (
              <div className="px-3 pb-3 text-gray-500 italic prose-thinking">
                <MarkdownView text={thinking} />
              </div>
            )}
          </div>
        )}
        {isUser ? (
          <div className="rounded-3xl px-4 py-2.5 whitespace-pre-wrap leading-relaxed bg-gray-100 text-gray-900">
            {answer}
          </div>
        ) : (
          <div className="prose-msg text-gray-900 leading-relaxed">
            <MarkdownView text={answer} />
            {streaming && !thinkingOpen && (
              <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-gray-700 animate-pulse" />
            )}
          </div>
        )}
        {!isUser && sources && sources.length > 0 && (
          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 text-xs">
            <button
              onClick={() => setSourcesOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-800"
            >
              {sourcesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <FileText size={13} />
              <span>引用源 ({sources.length})</span>
            </button>
            {sourcesOpen && (
              <ol className="px-3 pb-3 space-y-2">
                {sources.map((s, i) => (
                  <li key={s.chunk_id} className="text-gray-500">
                    <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                      <span className="text-[#10a37f]">[{i + 1}]</span>
                      {s.modality === "image" ? (
                        <ImageIcon size={12} />
                      ) : (
                        <FileText size={12} />
                      )}
                      <span className="truncate">{s.file_name}</span>
                      <span className="text-gray-400">#{s.ord}</span>
                      <span className="ml-auto text-gray-400">
                        d={s.distance.toFixed(3)}
                      </span>
                    </div>
                    {s.preview && (
                      <div className="mt-0.5 text-gray-500 line-clamp-3">
                        {s.preview}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
          <User size={16} className="text-gray-700" />
        </div>
      )}
    </div>
  );
}

/** Markdown 渲染子组件：GFM 表格/删除线、代码高亮、代码块可复制 */
function MarkdownView({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // 区分 inline code 和代码块；pre 加复制按钮
        code({ className, children, ...props }: any) {
          const isBlock = /language-/.test(className || "");
          if (isBlock) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code
              className="px-1.5 py-0.5 rounded bg-gray-100 text-[#0f766e] text-[0.9em] font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },
        pre({ children }: any) {
          return <CodeBlock>{children}</CodeBlock>;
        },
        a({ href, children }: any) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[#10a37f] hover:underline"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  // 抽取里面 <code> 的原始文本用于复制
  function extractText(node: any): string {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (node?.props?.children) return extractText(node.props.children);
    return "";
  }
  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(extractText(children));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white text-gray-600 hover:text-gray-900 border border-gray-200 shadow-sm"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? "已复制" : "复制"}
      </button>
      <pre className="!my-0 !bg-gray-50 p-4 overflow-x-auto text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}
