"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ListTree, RefreshCw, XCircle } from "lucide-react";

interface ExecutionLog {
  id: string;
  conversationId: string | null;
  mode: "chat" | "mcp_call" | "skill_call";
  target: string | null;
  input: unknown;
  decision: unknown;
  output: unknown;
  ok: boolean;
  error: string | null;
  durationMs: number;
  createdAt: number;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch("/api/logs?limit=100", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "加载日志失败");
    setLogs(json.logs || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e?.message || String(e)));
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            title="返回调度台"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-white">
            <ListTree size={15} />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">执行日志</h1>
            <p className="text-xs text-slate-500">
              Agent 决策、MCP 调用、Skill 编排和执行结果
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

      <div className="mx-auto max-w-7xl px-4 py-5">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="grid grid-cols-[160px_120px_1fr_100px] border-b border-slate-200 px-4 py-2 text-xs font-medium text-slate-500">
            <div>时间</div>
            <div>模式</div>
            <div>目标 / 决策</div>
            <div className="text-right">结果</div>
          </div>
          <div className="divide-y divide-slate-100">
            {logs.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                暂无执行日志
              </div>
            )}
            {logs.map((log) => (
              <details key={log.id} className="group">
                <summary className="grid cursor-pointer grid-cols-[160px_120px_1fr_100px] items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                  <div>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                      {log.mode}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {log.target || "-"}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {preview(log.decision)}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 text-xs">
                    {log.ok ? (
                      <CheckCircle2 size={14} className="text-emerald-600" />
                    ) : (
                      <XCircle size={14} className="text-red-600" />
                    )}
                    <span className="text-slate-500">{log.durationMs}ms</span>
                  </div>
                </summary>
                <div className="grid gap-3 bg-slate-50 px-4 py-3 md:grid-cols-3">
                  <JsonPanel title="Input" value={log.input} />
                  <JsonPanel title="Decision" value={log.decision} />
                  <JsonPanel
                    title={log.ok ? "Output" : "Error"}
                    value={log.ok ? log.output : log.error}
                  />
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
        {title}
      </div>
      <pre className="max-h-72 overflow-auto p-3 text-xs leading-5 text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function preview(value: unknown): string {
  return JSON.stringify(value ?? null).slice(0, 180);
}
