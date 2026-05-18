"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Database,
  Plug,
  RefreshCw,
  Save,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";

type HandlerType = "local" | "rag-http" | "llm";
type McpKind = "generic" | "rag-http";
type McpTransport = "stdio" | "http" | "sse";
type PermissionMode = "inherit" | "none" | "preflight" | "inline";

interface McpTool {
  id: string;
  name: string;
  pathSuffix: string;
  description: string;
  schema: Record<string, unknown>;
  enabled: boolean;
  handlerType: HandlerType;
  systemId: string;
  permissionMode: PermissionMode;
  rateLimit: {
    enabled: boolean;
    perMinute?: number;
    perHour?: number;
  };
  serverId: string | null;
}

interface SystemItem {
  id: string;
  name: string;
  mode: "enterprise" | "personal";
  enabled: boolean;
}

interface McpServer {
  id: string;
  name: string;
  kind: McpKind;
  transport: McpTransport;
  base_url: string | null;
  url: string | null;
  enabled: boolean;
}

interface ToolDraft {
  id?: string;
  name: string;
  pathSuffix: string;
  description: string;
  schemaText: string;
  enabled: boolean;
  handlerType: HandlerType;
  systemId: string;
  permissionMode: PermissionMode;
  rateLimitEnabled: boolean;
  perMinute: string;
  perHour: string;
  serverId: string;
}

interface ServerDraft {
  id?: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

const EMPTY_TOOL: ToolDraft = {
  name: "",
  pathSuffix: "",
  description: "",
  schemaText: "{\n  \"query\": \"string\"\n}",
  enabled: true,
  handlerType: "rag-http",
  systemId: "default",
  permissionMode: "inherit",
  rateLimitEnabled: false,
  perMinute: "",
  perHour: "",
  serverId: "",
};

const EMPTY_SERVER: ServerDraft = {
  name: "",
  baseUrl: "",
  enabled: true,
};

export default function McpPage() {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [toolDraft, setToolDraft] = useState<ToolDraft>(EMPTY_TOOL);
  const [serverDraft, setServerDraft] = useState<ServerDraft>(EMPTY_SERVER);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    const [toolRes, serverRes, systemRes] = await Promise.all([
      fetch("/api/mcp-tools", { cache: "no-store" }),
      fetch("/api/mcp", { cache: "no-store" }),
      fetch("/api/systems", { cache: "no-store" }),
    ]);
    const toolJson = await toolRes.json();
    const serverJson = await serverRes.json();
    const systemJson = await systemRes.json();
    setTools(toolJson.tools || []);
    setServers(serverJson.servers || []);
    setSystems(systemJson.systems || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e?.message || String(e)));
  }, []);

  const enabledToolCount = useMemo(
    () => tools.filter((tool) => tool.enabled).length,
    [tools],
  );
  const systemById = useMemo(
    () => new Map(systems.map((system) => [system.id, system])),
    [systems],
  );

  function editTool(tool: McpTool) {
    setToolDraft({
      id: tool.id,
      name: tool.name,
      pathSuffix: tool.pathSuffix,
      description: tool.description,
      schemaText: JSON.stringify(tool.schema ?? {}, null, 2),
      enabled: tool.enabled,
      handlerType: tool.handlerType,
      systemId: tool.systemId || "default",
      permissionMode: tool.permissionMode || "inherit",
      rateLimitEnabled: !!tool.rateLimit?.enabled,
      perMinute: tool.rateLimit?.perMinute?.toString() ?? "",
      perHour: tool.rateLimit?.perHour?.toString() ?? "",
      serverId: tool.serverId ?? "",
    });
  }

  async function saveTool() {
    setSaving(true);
    setError(null);
    try {
      const schema = JSON.parse(toolDraft.schemaText || "{}");
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        throw new Error("参数 schema 必须是 JSON 对象");
      }
      const res = await fetch("/api/mcp-tools", {
        method: toolDraft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: toolDraft.id,
          name: toolDraft.name,
          pathSuffix: toolDraft.pathSuffix,
          description: toolDraft.description,
          schema,
          enabled: toolDraft.enabled,
          handlerType: toolDraft.handlerType,
          systemId: toolDraft.systemId || "default",
          permissionMode: toolDraft.permissionMode,
          rateLimit: {
            enabled: toolDraft.rateLimitEnabled,
            perMinute: toolDraft.perMinute ? Number(toolDraft.perMinute) : undefined,
            perHour: toolDraft.perHour ? Number(toolDraft.perHour) : undefined,
          },
          serverId: toolDraft.serverId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存工具失败");
      setToolDraft(EMPTY_TOOL);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleTool(tool: McpTool) {
    const res = await fetch("/api/mcp-tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tool.id, enabled: !tool.enabled }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "更新工具失败");
      return;
    }
    await load();
  }

  async function removeTool(id: string) {
    if (!confirm("删除这个工具配置？")) return;
    const res = await fetch(`/api/mcp-tools?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "删除工具失败");
      return;
    }
    if (toolDraft.id === id) setToolDraft(EMPTY_TOOL);
    await load();
  }

  function editServer(server: McpServer) {
    setServerDraft({
      id: server.id,
      name: server.name,
      baseUrl: server.base_url ?? server.url ?? "",
      enabled: server.enabled,
    });
  }

  async function saveServer() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp", {
        method: serverDraft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: serverDraft.id,
          name: serverDraft.name || "RAG HTTP MCP",
          kind: "rag-http",
          transport: "http",
          baseUrl: serverDraft.baseUrl,
          enabled: serverDraft.enabled,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存连接失败");
      setServerDraft(EMPTY_SERVER);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

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
            <Plug size={15} />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">MCP 工具配置</h1>
            <p className="text-xs text-slate-500">
              配置工具名称、描述、参数 schema 和调用路径，供 Agent 与 Skill 编排使用
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

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[420px_1fr]">
        <section className="space-y-4 ">
          <Panel title={toolDraft.id ? "编辑工具" : "新建工具"}>
            <div className="space-y-3 px-4 py-3">
              <Field label="工具名称">
                <input
                  value={toolDraft.name}
                  onChange={(e) =>
                    setToolDraft({ ...toolDraft, name: e.target.value })
                  }
                  className="input font-mono"
                  placeholder="cr241AfmtNgFaiPareto"
                />
              </Field>
              <Field label="Path Suffix">
                <input
                  value={toolDraft.pathSuffix}
                  onChange={(e) =>
                    setToolDraft({ ...toolDraft, pathSuffix: e.target.value })
                  }
                  className="input font-mono"
                  placeholder="cr241-afmt-ngfai-pareto"
                />
              </Field>
              <Field label="归属 System">
                <select
                  value={toolDraft.systemId}
                  onChange={(e) =>
                    setToolDraft({ ...toolDraft, systemId: e.target.value })
                  }
                  className="input"
                >
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name} ({system.id})
                    </option>
                  ))}
                  {!systems.length && <option value="default">Default System</option>}
                </select>
              </Field>
              <Field label="描述">
                <textarea
                  value={toolDraft.description}
                  onChange={(e) =>
                    setToolDraft({ ...toolDraft, description: e.target.value })
                  }
                  className="input min-h-20"
                  placeholder="说明这个工具什么时候使用、需要什么参数、返回什么结果"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="处理器">
                  <select
                    value={toolDraft.handlerType}
                    onChange={(e) =>
                      setToolDraft({
                        ...toolDraft,
                        handlerType: e.target.value as HandlerType,
                      })
                    }
                    className="input"
                  >
                    <option value="rag-http">rag-http</option>
                    <option value="local">local</option>
                    <option value="llm">llm</option>
                  </select>
                </Field>
                <Field label="MCP 连接">
                  <select
                    value={toolDraft.serverId}
                    onChange={(e) =>
                      setToolDraft({ ...toolDraft, serverId: e.target.value })
                    }
                    className="input"
                    disabled={toolDraft.handlerType !== "rag-http"}
                  >
                    <option value="">默认启用连接</option>
                    {servers.map((server) => (
                      <option key={server.id} value={server.id}>
                        {server.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="权限模式">
                <select
                  value={toolDraft.permissionMode}
                  onChange={(e) =>
                    setToolDraft({
                      ...toolDraft,
                      permissionMode: e.target.value as PermissionMode,
                    })
                  }
                  className="input"
                >
                  <option value="inherit">inherit</option>
                  <option value="none">none</option>
                  <option value="preflight">preflight</option>
                  <option value="inline">inline</option>
                </select>
              </Field>
              <div className="rounded-md border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="accent-slate-950"
                    checked={toolDraft.rateLimitEnabled}
                    onChange={(e) =>
                      setToolDraft({
                        ...toolDraft,
                        rateLimitEnabled: e.target.checked,
                      })
                    }
                  />
                  启用工具限流
                </label>
                {toolDraft.rateLimitEnabled && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Field label="每分钟">
                      <input
                        value={toolDraft.perMinute}
                        onChange={(e) =>
                          setToolDraft({
                            ...toolDraft,
                            perMinute: e.target.value,
                          })
                        }
                        className="input"
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="每小时">
                      <input
                        value={toolDraft.perHour}
                        onChange={(e) =>
                          setToolDraft({ ...toolDraft, perHour: e.target.value })
                        }
                        className="input"
                        inputMode="numeric"
                      />
                    </Field>
                  </div>
                )}
              </div>
              <Field label="参数 Schema JSON">
                <textarea
                  value={toolDraft.schemaText}
                  onChange={(e) =>
                    setToolDraft({ ...toolDraft, schemaText: e.target.value })
                  }
                  className="input min-h-40 font-mono"
                  spellCheck={false}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-slate-950"
                  checked={toolDraft.enabled}
                  onChange={(e) =>
                    setToolDraft({ ...toolDraft, enabled: e.target.checked })
                  }
                />
                启用工具
              </label>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2">
                {toolDraft.id && (
                  <button
                    onClick={() => setToolDraft(EMPTY_TOOL)}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    新建
                  </button>
                )}
                <button
                  onClick={saveTool}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save size={13} />
                  保存工具
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="MCP HTTP 连接">
            <div className="space-y-3 px-4 py-3">
              <Field label="连接名称">
                <input
                  value={serverDraft.name}
                  onChange={(e) =>
                    setServerDraft({ ...serverDraft, name: e.target.value })
                  }
                  className="input"
                  placeholder="RuoYi RAG MCP"
                />
              </Field>
              <Field label="Base URL">
                <input
                  value={serverDraft.baseUrl}
                  onChange={(e) =>
                    setServerDraft({ ...serverDraft, baseUrl: e.target.value })
                  }
                  className="input font-mono"
                  placeholder="http://10.1.101.65:8080"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-slate-950"
                  checked={serverDraft.enabled}
                  onChange={(e) =>
                    setServerDraft({ ...serverDraft, enabled: e.target.checked })
                  }
                />
                启用连接
              </label>
              <div className="flex justify-end gap-2">
                {serverDraft.id && (
                  <button
                    onClick={() => setServerDraft(EMPTY_SERVER)}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    新建
                  </button>
                )}
                <button
                  onClick={saveServer}
                  disabled={saving}
                  className="rounded-md border border-slate-950 bg-white px-3 py-2 text-xs text-slate-950 hover:bg-slate-50 disabled:opacity-50"
                >
                  保存连接
                </button>
              </div>
            </div>
          </Panel>
        </section>

        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric icon={<Wrench size={15} />} label="工具数" value={tools.length} />
            <Metric
              icon={<CheckCircle2 size={15} />}
              label="已启用工具"
              value={enabledToolCount}
            />
            <Metric
              icon={<Database size={15} />}
              label="MCP 连接"
              value={servers.length}
            />
            <Metric
              icon={<Building2 size={15} />}
              label="Systems"
              value={systems.length}
            />
          </div>

          <Panel title="工具调用配置">
            <div className="divide-y divide-slate-100">
              {tools.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  暂无工具配置
                </div>
              )}
              {tools.map((tool) => (
                <div
                  key={tool.id}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto]"
                >
                  <button
                    onClick={() => editTool(tool)}
                    className="min-w-0 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {tool.name}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                        {tool.pathSuffix}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {tool.handlerType}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {systemLabel(tool.systemId, systemById)}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        permission: {tool.permissionMode || "inherit"}
                      </span>
                      {tool.rateLimit?.enabled && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                          rate: {rateLimitLabel(tool.rateLimit)}
                        </span>
                      )}
                      <Status enabled={tool.enabled} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                      {tool.description || "未填写描述"}
                    </p>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleTool(tool)}
                      className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      {tool.enabled ? "停用" : "启用"}
                    </button>
                    <button
                      onClick={() => removeTool(tool.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="MCP 连接">
            <div className="divide-y divide-slate-100">
              {servers.map((server) => (
                <button
                  key={server.id}
                  onClick={() => editServer(server)}
                  className="block w-full px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{server.name}</span>
                    <Status enabled={server.enabled} />
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {server.kind} / {server.base_url || server.url || "未配置 URL"}
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
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

function systemLabel(
  systemId: string,
  systems: Map<string, SystemItem>,
): string {
  const system = systems.get(systemId);
  return system ? `System: ${system.name}` : `System: ${systemId || "default"}`;
}

function rateLimitLabel(rateLimit: McpTool["rateLimit"]): string {
  const parts = [];
  if (rateLimit.perMinute) parts.push(`${rateLimit.perMinute}/min`);
  if (rateLimit.perHour) parts.push(`${rateLimit.perHour}/hour`);
  return parts.length ? parts.join(", ") : "enabled";
}
