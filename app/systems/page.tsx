"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  RefreshCw,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type SystemMode = "enterprise" | "personal";
type AuthMode = "none" | "bearer" | "forwarded";
type PermissionMode = "none" | "preflight" | "inline";

interface SystemItem {
  id: string;
  name: string;
  description: string;
  mode: SystemMode;
  enabled: boolean;
  baseUrl: string | null;
  authMode: AuthMode;
  prompt: string;
  permissionMode: PermissionMode;
  permissionToolId: string | null;
  rateLimit: {
    enabled: boolean;
    perMinute?: number;
    perHour?: number;
  };
  auditEnabled: boolean;
  updatedAt: number;
}

interface ToolItem {
  id: string;
  name: string;
  systemId: string;
}

interface Draft {
  id?: string;
  customId: string;
  name: string;
  description: string;
  mode: SystemMode;
  enabled: boolean;
  baseUrl: string;
  authMode: AuthMode;
  prompt: string;
  permissionMode: PermissionMode;
  permissionToolId: string;
  rateLimitEnabled: boolean;
  perMinute: string;
  perHour: string;
  auditEnabled: boolean;
}

const EMPTY_DRAFT: Draft = {
  customId: "",
  name: "",
  description: "",
  mode: "enterprise",
  enabled: true,
  baseUrl: "",
  authMode: "none",
  prompt: "",
  permissionMode: "preflight",
  permissionToolId: "",
  rateLimitEnabled: false,
  perMinute: "",
  perHour: "",
  auditEnabled: true,
};

export default function SystemsPage() {
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    const [systemRes, toolRes] = await Promise.all([
      fetch("/api/systems", { cache: "no-store" }),
      fetch("/api/mcp-tools", { cache: "no-store" }),
    ]);
    const systemJson = await systemRes.json();
    const toolJson = await toolRes.json();
    if (!systemRes.ok) throw new Error(systemJson.error || "加载 System 失败");
    if (!toolRes.ok) throw new Error(toolJson.error || "加载工具失败");
    setSystems(systemJson.systems || []);
    setTools(toolJson.tools || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e?.message || String(e)));
  }, []);

  const enabledCount = useMemo(
    () => systems.filter((system) => system.enabled).length,
    [systems],
  );
  const enterpriseCount = useMemo(
    () => systems.filter((system) => system.mode === "enterprise").length,
    [systems],
  );

  function edit(system: SystemItem) {
    setDraft({
      id: system.id,
      customId: system.id,
      name: system.name,
      description: system.description,
      mode: system.mode,
      enabled: system.enabled,
      baseUrl: system.baseUrl ?? "",
      authMode: system.authMode,
      prompt: system.prompt,
      permissionMode: system.permissionMode,
      permissionToolId: system.permissionToolId ?? "",
      rateLimitEnabled: !!system.rateLimit?.enabled,
      perMinute: system.rateLimit?.perMinute?.toString() ?? "",
      perHour: system.rateLimit?.perHour?.toString() ?? "",
      auditEnabled: system.auditEnabled,
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: draft.id ?? (draft.customId.trim() || undefined),
        name: draft.name.trim(),
        description: draft.description.trim(),
        mode: draft.mode,
        enabled: draft.enabled,
        baseUrl: draft.baseUrl.trim() || null,
        authMode: draft.authMode,
        prompt: draft.prompt,
        permissionMode: draft.permissionMode,
        permissionToolId: draft.permissionToolId || null,
        rateLimit: {
          enabled: draft.rateLimitEnabled,
          perMinute: draft.perMinute ? Number(draft.perMinute) : undefined,
          perHour: draft.perHour ? Number(draft.perHour) : undefined,
        },
        auditEnabled: draft.auditEnabled,
      };
      const res = await fetch("/api/systems", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存 System 失败");
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(system: SystemItem) {
    const res = await fetch("/api/systems", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: system.id, enabled: !system.enabled }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "更新 System 失败");
      return;
    }
    await load();
  }

  function updateMode(mode: SystemMode) {
    setDraft((current) => ({
      ...current,
      mode,
      permissionMode:
        current.id ||
        (current.permissionMode !== "preflight" && current.permissionMode !== "none")
          ? current.permissionMode
          : mode === "enterprise"
            ? "preflight"
            : "none",
    }));
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
            <Building2 size={15} />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">System 注册</h1>
            <p className="text-xs text-slate-500">
              管理业务系统边界、Prompt 和工具归属配置
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

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[460px_1fr]">
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">
              {draft.id ? "编辑 System" : "新建 System"}
            </h2>
          </div>
          <div className="space-y-3 px-4 py-3">
            <Field label="System ID">
              <input
                value={draft.customId}
                disabled={!!draft.id}
                onChange={(e) => setDraft({ ...draft, customId: e.target.value })}
                className="input font-mono disabled:bg-slate-50 disabled:text-slate-400"
                placeholder="quality-system"
              />
            </Field>
            <Field label="名称">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="input"
                placeholder="Quality System"
              />
            </Field>
            <Field label="描述">
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                className="input min-h-20"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="模式">
                <select
                  value={draft.mode}
                  onChange={(e) => updateMode(e.target.value as SystemMode)}
                  className="input"
                >
                  <option value="enterprise">enterprise</option>
                  <option value="personal">personal</option>
                </select>
              </Field>
              <Field label="Auth Mode">
                <select
                  value={draft.authMode}
                  onChange={(e) =>
                    setDraft({ ...draft, authMode: e.target.value as AuthMode })
                  }
                  className="input"
                >
                  <option value="none">none</option>
                  <option value="bearer">bearer</option>
                  <option value="forwarded">forwarded</option>
                </select>
              </Field>
            </div>
            <Field label="Base URL">
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                className="input font-mono"
                placeholder="https://system.example.com"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Permission Mode">
                <select
                  value={draft.permissionMode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      permissionMode: e.target.value as PermissionMode,
                    })
                  }
                  className="input"
                >
                  <option value="none">none</option>
                  <option value="preflight">preflight</option>
                  <option value="inline">inline</option>
                </select>
              </Field>
              <Field label="Permission Tool">
                <select
                  value={draft.permissionToolId}
                  onChange={(e) =>
                    setDraft({ ...draft, permissionToolId: e.target.value })
                  }
                  className="input"
                >
                  <option value="">未选择</option>
                  {tools.map((tool) => (
                    <option key={tool.id} value={tool.id}>
                      {tool.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-slate-950"
                  checked={draft.rateLimitEnabled}
                  onChange={(e) =>
                    setDraft({ ...draft, rateLimitEnabled: e.target.checked })
                  }
                />
                启用限流配置
              </label>
              {draft.rateLimitEnabled && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Field label="每分钟">
                    <input
                      value={draft.perMinute}
                      onChange={(e) =>
                        setDraft({ ...draft, perMinute: e.target.value })
                      }
                      className="input"
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="每小时">
                    <input
                      value={draft.perHour}
                      onChange={(e) =>
                        setDraft({ ...draft, perHour: e.target.value })
                      }
                      className="input"
                      inputMode="numeric"
                    />
                  </Field>
                </div>
              )}
            </div>
            <Field label="System Prompt">
              <textarea
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                className="input min-h-32"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-slate-950"
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft({ ...draft, enabled: e.target.checked })
                  }
                />
                启用 System
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-slate-950"
                  checked={draft.auditEnabled}
                  onChange={(e) =>
                    setDraft({ ...draft, auditEnabled: e.target.checked })
                  }
                />
                启用审计
              </label>
            </div>
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
                保存 System
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={<Building2 size={15} />} label="Systems" value={systems.length} />
            <Metric icon={<CheckCircle2 size={15} />} label="已启用" value={enabledCount} />
            <Metric
              icon={<ShieldCheck size={15} />}
              label="企业模式"
              value={enterpriseCount}
            />
          </div>

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">System 列表</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {systems.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  暂无 System
                </div>
              )}
              {systems.map((system) => (
                <div
                  key={system.id}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto]"
                >
                  <button onClick={() => edit(system)} className="min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {system.name}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                        {system.id}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {system.mode}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        permission: {system.permissionMode}
                      </span>
                      <Status enabled={system.enabled} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                      {system.description || "未填写描述"}
                    </p>
                    <div className="mt-1 text-[11px] text-slate-400">
                      更新于 {new Date(system.updatedAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    onClick={() => toggle(system)}
                    className="h-8 rounded-md border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {system.enabled ? "停用" : "启用"}
                  </button>
                </div>
              ))}
            </div>
          </section>
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
