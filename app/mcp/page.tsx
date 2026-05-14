"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Plug,
  RefreshCw,
  Save,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";

type McpKind = "generic" | "rag-http";
type McpTransport = "stdio" | "http" | "sse";

interface McpServer {
  id: string;
  name: string;
  kind: McpKind;
  transport: McpTransport;
  command: string | null;
  args: string[];
  url: string | null;
  base_url: string | null;
  auth_token: string | null;
  has_token?: boolean;
  env: Record<string, string>;
  enabled: boolean;
}

interface McpTool {
  name: string;
  pathSuffix: string;
  description: string;
  schema: unknown;
  enabled: boolean;
  handlerType?: string;
  serverName?: string;
}

interface Draft {
  id?: string;
  name: string;
  kind: McpKind;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  baseUrl: string;
  authToken: string;
  enabled: boolean;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  kind: "rag-http",
  transport: "http",
  command: "",
  args: "",
  url: "",
  baseUrl: "",
  authToken: "",
  enabled: true,
};

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [mcpRes, toolsRes] = await Promise.all([
      fetch("/api/mcp", { cache: "no-store" }),
      fetch("/api/tools", { cache: "no-store" }),
    ]);
    const mcpJson = await mcpRes.json();
    const toolsJson = await toolsRes.json();
    setServers(mcpJson.servers || []);
    setTools(toolsJson.mcpTools || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e?.message || String(e)));
  }, []);

  const enabledToolCount = useMemo(
    () => tools.filter((tool) => tool.enabled).length,
    [tools],
  );

  function edit(server: McpServer) {
    setDraft({
      id: server.id,
      name: server.name,
      kind: server.kind,
      transport: server.transport,
      command: server.command ?? "",
      args: server.args.join(" "),
      url: server.url ?? "",
      baseUrl: server.base_url ?? "",
      authToken: "",
      enabled: server.enabled,
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: draft.id,
        name: draft.name.trim() || "未命名 MCP",
        kind: draft.kind,
        transport: draft.transport,
        command: draft.command.trim() || null,
        args: draft.args.split(/\s+/).filter(Boolean),
        url: draft.url.trim() || null,
        baseUrl: draft.baseUrl.trim() || null,
        authToken: draft.authToken.trim() || undefined,
        enabled: draft.enabled,
      };
      const res = await fetch("/api/mcp", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存失败");
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("删除这个 MCP 配置？")) return;
    setError(null);
    const res = await fetch(`/api/mcp?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "删除失败");
      return;
    }
    if (draft.id === id) setDraft(EMPTY_DRAFT);
    await load();
  }

  async function toggle(server: McpServer) {
    const res = await fetch("/api/mcp", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: server.id, enabled: !server.enabled }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "更新失败");
      return;
    }
    await load();
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
            <Plug size={15} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-tight">MCP 管理</h1>
            <p className="text-xs text-slate-500">
              工具配置、启用状态与可用 MCP 工具
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

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[380px_1fr]">
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">配置</h2>
            <p className="mt-1 text-xs text-slate-500">
              当前支持 RAG HTTP MCP，通用 stdio/sse 保留为配置占位。
            </p>
          </div>
          <div className="space-y-3 p-4">
            <Field label="名称">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="input"
                placeholder="RuoYi RAG MCP"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="类型">
                <select
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      kind: e.target.value as McpKind,
                      transport:
                        e.target.value === "rag-http" ? "http" : draft.transport,
                    })
                  }
                  className="input"
                >
                  <option value="rag-http">rag-http</option>
                  <option value="generic">generic</option>
                </select>
              </Field>
              <Field label="传输">
                <select
                  value={draft.transport}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      transport: e.target.value as McpTransport,
                    })
                  }
                  className="input"
                >
                  <option value="http">http</option>
                  <option value="stdio">stdio</option>
                  <option value="sse">sse</option>
                </select>
              </Field>
            </div>
            <Field label="Base URL">
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                className="input font-mono"
                placeholder="http://10.1.101.65:8080"
              />
            </Field>
            <Field label="URL">
              <input
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                className="input font-mono"
                placeholder="sse/http endpoint"
              />
            </Field>
            <Field label="Command">
              <input
                value={draft.command}
                onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                className="input font-mono"
                placeholder="npx"
              />
            </Field>
            <Field label="Args">
              <input
                value={draft.args}
                onChange={(e) => setDraft({ ...draft, args: e.target.value })}
                className="input font-mono"
                placeholder="-y @modelcontextprotocol/server-filesystem"
              />
            </Field>
            <Field label="Auth Token">
              <input
                value={draft.authToken}
                onChange={(e) =>
                  setDraft({ ...draft, authToken: e.target.value })
                }
                className="input font-mono"
                placeholder={draft.id ? "留空则保持原 token" : "Bearer token"}
                type="password"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="accent-slate-950"
                checked={draft.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, enabled: e.target.checked })
                }
              />
              启用
            </label>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              {draft.id && (
                <button
                  onClick={() => setDraft(EMPTY_DRAFT)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                >
                  新建
                </button>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Save size={13} />
                保存
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={<Database size={15} />} label="配置数" value={servers.length} />
            <Metric
              icon={<CheckCircle2 size={15} />}
              label="已启用"
              value={servers.filter((server) => server.enabled).length}
            />
            <Metric icon={<Wrench size={15} />} label="可用工具" value={enabledToolCount} />
          </div>

          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">MCP 配置</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {servers.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  暂无 MCP 配置
                </div>
              )}
              {servers.map((server) => (
                <div
                  key={server.id}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto]"
                >
                  <button
                    onClick={() => edit(server)}
                    className="min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {server.name}
                      </span>
                      <Status enabled={server.enabled} />
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {server.kind} / {server.transport}
                      {server.base_url ? ` / ${server.base_url}` : ""}
                      {server.url ? ` / ${server.url}` : ""}
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggle(server)}
                      className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      {server.enabled ? "停用" : "启用"}
                    </button>
                    <button
                      onClick={() => remove(server.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">可用 MCP 工具</h2>
            </div>
            <div className="grid gap-2 p-3">
              {tools.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  暂无可用 MCP 工具
                </div>
              )}
              {tools.map((tool) => (
                <div
                  key={`${tool.serverName || "local"}:${tool.name}:${tool.pathSuffix}`}
                  className="rounded-md border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-slate-950">
                      {tool.name}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                      {tool.pathSuffix}
                    </span>
                    <Status enabled={tool.enabled} />
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {tool.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function Status({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
      <CheckCircle2 size={11} />
      启用
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
      <XCircle size={11} />
      停用
    </span>
  );
}
