"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, RotateCcw, Save, ScrollText } from "lucide-react";

interface PromptConfig {
  key: string;
  content: string;
  updatedAt: number;
}

export default function PromptPage() {
  const [prompt, setPrompt] = useState<PromptConfig | null>(null);
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch("/api/prompts/agent", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "加载 Prompt 失败");
    setPrompt(json.prompt);
    setDefaultPrompt(json.defaultPrompt || "");
    setContent(json.prompt?.content || "");
  }

  useEffect(() => {
    load().catch((e) => setError(e?.message || String(e)));
  }, []);

  async function save(nextContent = content, reset = false) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/prompts/agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { reset: true } : { content: nextContent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存 Prompt 失败");
      setPrompt(json.prompt);
      setDefaultPrompt(json.defaultPrompt || "");
      setContent(json.prompt?.content || "");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            title="返回调度台"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-white">
            <ScrollText size={15} />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">
              Agent Prompt 配置
            </h1>
            <p className="text-xs text-slate-500">
              配置调度 Agent 的模式选择规则和 JSON 输出约束
            </p>
          </div>
          <button
            onClick={() => load().catch((e) => setError(e?.message || String(e)))}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-950"
          >
            <RefreshCw size={13} />
            刷新
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[1fr_320px]">
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Routing Agent Prompt</h2>
          </div>
          <div className="space-y-3 p-4">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input min-h-[560px] font-mono"
              spellCheck={false}
            />
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => save(defaultPrompt, true)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50"
              >
                <RotateCcw size={13} />
                恢复默认
              </button>
              <button
                onClick={() => save()}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Save size={13} />
                保存 Prompt
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">必需保留</h2>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              <p>Prompt 必须要求 Agent 输出严格 JSON。</p>
              <p>必须包含三种模式：chat、mcp_call、skill_call。</p>
              <p>必须保留占位符：{"{{skills}}"} 和 {"{{mcpTools}}"}。</p>
            </div>
          </section>
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">状态</h2>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div>Key: {prompt?.key || "-"}</div>
              <div>
                Updated:{" "}
                {prompt?.updatedAt
                  ? new Date(prompt.updatedAt).toLocaleString()
                  : "default"}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
