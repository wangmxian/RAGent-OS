"use client";
import { useEffect, useRef, useState } from "react";
import {
  Send,
  Square,
  Trash2,
  Brain,
  FolderOpen,
  Sparkles,
  Plug,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Message, { type Role, type SourceHit } from "./Message";
import FilesPanel from "./FilesPanel";
import ConversationsSidebar from "./ConversationsSidebar";
import SkillsPanel, { type SkillItem } from "./SkillsPanel";

interface Msg {
  role: Role;
  content: string;
  sources?: SourceHit[];
}

const DEFAULT_SYSTEM = "你是一个有帮助的 AI 助手，使用简洁、准确的中文回答。";

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [enableThinking, setEnableThinking] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM);
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [useKnowledge, setUseKnowledge] = useState(true);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [activeSkill, setActiveSkill] = useState<SkillItem | null>(null);

  // 会话状态
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [convListVersion, setConvListVersion] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // 同步选中的 skill 详情
  useEffect(() => {
    if (!activeSkillId) {
      setActiveSkill(null);
      return;
    }
    fetch(`/api/skills/${activeSkillId}`)
      .then((r) => r.json())
      .then((j) => setActiveSkill(j.skill || null))
      .catch(() => setActiveSkill(null));
  }, [activeSkillId]);

  // 首次加载：获取会话列表，选中最近一个或创建一个新会话
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/conversations");
        const j = await r.json();
        const list = j.conversations || [];
        if (list.length) {
          await selectConversation(list[0].id);
        } else {
          await createNewConversation();
        }
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createNewConversation() {
    const r = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    setConversationId(j.conversation.id);
    setMessages([]);
    setConvListVersion((v) => v + 1);
  }

  async function selectConversation(id: string) {
    setConversationId(id);
    try {
      const r = await fetch(`/api/conversations/${id}`);
      const j = await r.json();
      const loaded: Msg[] = (j.messages || [])
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({
          role: m.role,
          content: m.reasoning
            ? `<think>${m.reasoning}</think>${m.content}`
            : m.content,
          sources: m.meta?.sources,
        }));
      setMessages(loaded);
    } catch (e) {
      console.error(e);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    // 确保有活动会话
    let convId = conversationId;
    if (!convId) {
      const r = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      convId = j.conversation.id as string;
      setConversationId(convId);
    }

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    // 占位 assistant 消息
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          // 不传 enableThinking/temperature/systemPrompt 时，后端会从 skill 默认取
          enableThinking: activeSkill ? undefined : enableThinking,
          temperature: activeSkill ? undefined : temperature,
          systemPrompt: activeSkill ? undefined : systemPrompt,
          useKnowledge,
          fileIds: selectedFileIds,
          conversationId: convId,
          skillId: activeSkillId,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "请求失败");
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: `[请求失败] ${err}`,
          };
          return copy;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let answer = "";
      let thinking = "";
      let thinkingDone = false;
      let sources: SourceHit[] | undefined;

      const render = () => {
        let composed = "";
        if (thinking) {
          composed += `<think>${thinking}${thinkingDone ? "</think>" : ""}`;
        }
        composed += answer;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: composed,
            sources,
          };
          return copy;
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // 按 SSE 规范以空行切分事件
        let sepIdx: number;
        while ((sepIdx = buf.indexOf("\n\n")) !== -1) {
          const rawEvent = buf.slice(0, sepIdx);
          buf = buf.slice(sepIdx + 2);

          let eventName = "message";
          const dataLines: string[] = [];
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          }
          if (!dataLines.length) continue;
          const dataStr = dataLines.join("\n");

          let payload: any = null;
          try {
            payload = JSON.parse(dataStr);
          } catch {
            payload = dataStr;
          }

          if (eventName === "thinking") {
            thinking += payload?.delta ?? "";
            render();
          } else if (eventName === "sources") {
            sources = payload?.hits ?? [];
            render();
          } else if (eventName === "delta") {
            if (thinking && !thinkingDone) thinkingDone = true;
            answer += payload?.delta ?? "";
            render();
          } else if (eventName === "error") {
            answer += `\n\n[ERROR] ${payload?.message ?? "unknown"}`;
            render();
          } else if (eventName === "done") {
            if (thinking && !thinkingDone) thinkingDone = true;
            render();
          }
          // start / 其他事件忽略
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: `[错误] ${e?.message || String(e)}`,
          };
          return copy;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      // 刷新会话列表（可能有标题自动生成 / updated_at 变化）
      setConvListVersion((v) => v + 1);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clearAll() {
    if (loading) return;
    setMessages([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-screen bg-[#f6f7f9] text-slate-950">
      <ConversationsSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        activeId={conversationId}
        onSelect={(id) => selectConversation(id)}
        onCreate={createNewConversation}
        refreshKey={convListVersion}
      />
      <div className="flex-1 flex flex-col min-w-0 bg-[#f6f7f9]">
      {/* 顶栏 */}
      <header className="h-14 border-b border-slate-200 bg-white/95 backdrop-blur px-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-md bg-slate-950 text-white flex items-center justify-center">
            <Sparkles size={14} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-950 leading-tight">企业 AI 调度台</div>
            <div className="text-[11px] text-slate-500 hidden sm:block">
              Agent · Skill · MCP · RAG
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="/mcp"
            title="MCP 配置"
            className="h-8 flex items-center gap-1.5 text-xs px-3 rounded-md border bg-white border-slate-200 text-slate-600 hover:text-slate-950 hover:bg-slate-50"
          >
            <Plug size={14} />
            MCP 配置
          </a>
          <a
            href="/skills"
            title="Skill 配置"
            className={`h-8 flex items-center gap-1.5 text-xs px-3 rounded-md border transition ${
              activeSkill
                ? "bg-slate-950 border-slate-950 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:text-slate-950 hover:bg-slate-50"
            }`}
          >
            <Sparkles size={14} />
            {activeSkill ? `${activeSkill.icon || ""} ${activeSkill.name}` : "Skill 配置"}
          </a>
          <button
            onClick={() => setShowFiles(true)}
            title="文件/知识库"
            className={`h-8 flex items-center gap-1.5 text-xs px-3 rounded-md border transition ${
              selectedFileIds.length
                ? "bg-slate-100 border-slate-300 text-slate-950"
                : "bg-white border-slate-200 text-slate-600 hover:text-slate-950 hover:bg-slate-50"
            }`}
          >
            <FolderOpen size={14} />
            知识库 {selectedFileIds.length > 0 ? `(${selectedFileIds.length})` : ""}
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="h-8 w-8 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100 flex items-center justify-center"
            title="模型设置"
          >
            <SlidersHorizontal size={16} />
          </button>
          <button
            onClick={clearAll}
            disabled={loading || !messages.length}
            className="h-8 w-8 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center"
            title="清空当前页消息"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="border-b border-slate-200 bg-white px-4 py-3 space-y-3">
          <div className="max-w-5xl mx-auto">
            <label className="text-xs text-slate-500 mb-1 block">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={2}
              className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <label className="text-xs text-slate-500">
              Temperature: {temperature.toFixed(2)}
            </label>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="flex-1 max-w-xs"
            />
          </div>
        </div>
      )}

      {/* 消息区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#f6f7f9]">
        <div className={`max-w-3xl mx-auto px-4 ${messages.length === 0 ? "min-h-full flex items-center" : "py-8 space-y-7"}`}>
          {messages.length === 0 && (
            <div className="w-full -mt-14">
              <div className="text-center mb-7">
                <div className="mx-auto h-11 w-11 rounded-xl bg-slate-950 text-white flex items-center justify-center mb-4">
                  <Sparkles size={20} />
                </div>
                <div className="text-2xl font-semibold text-slate-950">今天要处理什么企业问题？</div>
                <div className="text-sm mt-2 text-slate-500">
                  选择 Skill、连接 MCP、检索知识库，或直接开始普通对话。
                </div>
              </div>
              <Composer
                input={input}
                setInput={setInput}
                onKeyDown={onKeyDown}
                loading={loading}
                send={send}
                stop={stop}
                enableThinking={enableThinking}
                setEnableThinking={setEnableThinking}
                useKnowledge={useKnowledge}
                setUseKnowledge={setUseKnowledge}
                selectedFileCount={selectedFileIds.length}
                onOpenFiles={() => setShowFiles(true)}
              />
            </div>
          )}
          {messages.map((m, i) => (
            <Message
              key={i}
              role={m.role}
              content={m.content}
              sources={m.sources}
              streaming={loading && i === messages.length - 1 && m.role === "assistant"}
            />
          ))}
        </div>
      </div>

      {/* 输入区 */}
      {messages.length > 0 && (
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <Composer
            input={input}
            setInput={setInput}
            onKeyDown={onKeyDown}
            loading={loading}
            send={send}
            stop={stop}
            enableThinking={enableThinking}
            setEnableThinking={setEnableThinking}
            useKnowledge={useKnowledge}
            setUseKnowledge={setUseKnowledge}
            selectedFileCount={selectedFileIds.length}
            onOpenFiles={() => setShowFiles(true)}
          />
          <div className="max-w-3xl mx-auto mt-2 text-[11px] text-slate-400 text-center">
            {process.env.NEXT_PUBLIC_MODEL_NAME || "Qwen3.6-27B-FP8"} · 严格 Skill 调度
          </div>
        </div>
      )}

      <FilesPanel
        open={showFiles}
        onClose={() => setShowFiles(false)}
        selectedIds={selectedFileIds}
        onSelectedChange={setSelectedFileIds}
      />

      <SkillsPanel
        open={showSkills}
        onClose={() => setShowSkills(false)}
        activeSkillId={activeSkillId}
        onActiveChange={setActiveSkillId}
      />

      </div>
    </div>
  );
}

function Composer({
  input,
  setInput,
  onKeyDown,
  loading,
  send,
  stop,
  enableThinking,
  setEnableThinking,
  useKnowledge,
  setUseKnowledge,
  selectedFileCount,
  onOpenFiles,
}: {
  input: string;
  setInput: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  loading: boolean;
  send: () => void;
  stop: () => void;
  enableThinking: boolean;
  setEnableThinking: (fn: (value: boolean) => boolean) => void;
  useKnowledge: boolean;
  setUseKnowledge: (fn: (value: boolean) => boolean) => void;
  selectedFileCount: number;
  onOpenFiles: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="向企业 AI 调度台提问..."
          rows={3}
          className="w-full resize-none bg-white px-4 py-3 text-[15px] text-slate-950 placeholder:text-slate-400 focus:outline-none max-h-44"
        />
        <div className="border-t border-slate-100 px-3 py-2 flex items-center gap-2">
          <SwitchButton
            checked={enableThinking}
            onChange={() => setEnableThinking((v) => !v)}
            icon={<Brain size={13} />}
            label="思考模式"
          />
          <SwitchButton
            checked={useKnowledge}
            onChange={() => setUseKnowledge((v) => !v)}
            icon={<Search size={13} />}
            label={selectedFileCount ? `知识库 ${selectedFileCount}` : "知识库检索"}
          />
          <button
            onClick={onOpenFiles}
            className="h-8 px-2.5 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-950 flex items-center gap-1.5"
            title="选择知识库文件"
          >
            <FolderOpen size={13} />
            文件范围
          </button>
          <div className="ml-auto">
            {loading ? (
              <button
                onClick={stop}
                className="h-8 w-8 rounded-md bg-slate-950 hover:bg-slate-800 text-white flex items-center justify-center"
                title="停止"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="h-8 w-8 rounded-md bg-slate-950 hover:bg-slate-800 disabled:opacity-35 disabled:hover:bg-slate-950 text-white flex items-center justify-center"
                title="发送"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitchButton({
  checked,
  onChange,
  icon,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onChange}
      className={`h-8 px-2.5 rounded-md border text-xs flex items-center gap-2 transition ${
        checked
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition ${
          checked ? "bg-white/25" : "bg-slate-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full transition ${
            checked ? "left-3.5 bg-white" : "left-0.5 bg-white"
          }`}
        />
      </span>
    </button>
  );
}
