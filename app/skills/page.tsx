"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";

interface SkillItem {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  version: string;
  steps: SkillStep[];
  system_prompt: string;
  tool_ids: string[];
  default_temp: number;
  enable_thinking: boolean;
}

interface SkillStep {
  tool: string;
  params: Record<string, unknown>;
}

interface ToolItem {
  name: string;
  description: string;
  schema?: Record<string, unknown>;
  pathSuffix?: string;
  handlerType?: string;
}

interface DraftStep {
  tool: string;
  paramsText: string;
}

interface Draft {
  id?: string;
  name: string;
  description: string;
  version: string;
  systemPrompt: string;
  steps: DraftStep[];
}

const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  version: "v1",
  systemPrompt: "",
  steps: [],
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    const [skillsRes, toolsRes] = await Promise.all([
      fetch("/api/skills", { cache: "no-store" }),
      fetch("/api/tools", { cache: "no-store" }),
    ]);
    const skillsJson = await skillsRes.json();
    const toolsJson = await toolsRes.json();
    setSkills(skillsJson.skills || []);
    setTools(toolsJson.mcpTools || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e?.message || String(e)));
  }, []);

  const toolNames = useMemo(() => tools.map((tool) => tool.name), [tools]);

  function edit(skill: SkillItem) {
    setDraft({
      id: skill.id,
      name: skill.name,
      description: skill.description ?? "",
      version: skill.version || "v1",
      systemPrompt: skill.system_prompt ?? "",
      steps: skill.steps.map((step) => ({
        tool: step.tool,
        paramsText: JSON.stringify(step.params ?? {}, null, 2),
      })),
    });
  }

  function addStep() {
    setDraft((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          tool: toolNames[0] ?? "",
          paramsText: "{\n  \"query\": \"$input.query\"\n}",
        },
      ],
    }));
  }

  function updateStep(index: number, patch: Partial<DraftStep>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, i) =>
        i === index ? { ...step, ...patch } : step,
      ),
    }));
  }

  function removeStep(index: number) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.filter((_, i) => i !== index),
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.steps.length) return current;
      const steps = [...current.steps];
      const [step] = steps.splice(index, 1);
      steps.splice(nextIndex, 0, step);
      return { ...current, steps };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const steps = draft.steps.map((step, index) => {
        if (!step.tool.trim()) {
          throw new Error(`第 ${index + 1} 步缺少工具`);
        }
        const params = JSON.parse(step.paramsText || "{}");
        if (!params || typeof params !== "object" || Array.isArray(params)) {
          throw new Error(`第 ${index + 1} 步参数必须是 JSON 对象`);
        }
        return { tool: step.tool, params };
      });
      const payload = {
        name: draft.name.trim() || "未命名 Skill",
        description: draft.description.trim() || null,
        version: draft.version.trim() || "v1",
        systemPrompt: draft.systemPrompt,
        steps,
        toolIds: steps.map((step) => step.tool),
      };
      const res = await fetch(draft.id ? `/api/skills/${draft.id}` : "/api/skills", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存 Skill 失败");
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("删除这个 Skill？")) return;
    const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "删除 Skill 失败");
      return;
    }
    if (draft.id === id) setDraft(EMPTY_DRAFT);
    await load();
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
            <Sparkles size={15} />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Skill 编排</h1>
            <p className="text-xs text-slate-500">
              用配置化 MCP 工具组成多步骤执行流程，支持 $input 和 $stepN 参数引用
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
              {draft.id ? "编辑 Skill" : "新建 Skill"}
            </h2>
          </div>
          <div className="space-y-3 px-4 py-3">
            <Field label="名称">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="input"
                placeholder="NGFAI 分析"
              />
            </Field>
            <Field label="描述">
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                className="input min-h-20"
                placeholder="说明这个 Skill 何时被 Agent 选择"
              />
            </Field>
            <Field label="版本">
              <input
                value={draft.version}
                onChange={(e) =>
                  setDraft({ ...draft, version: e.target.value })
                }
                className="input"
              />
            </Field>
            <Field label="Skill Prompt">
              <textarea
                value={draft.systemPrompt}
                onChange={(e) =>
                  setDraft({ ...draft, systemPrompt: e.target.value })
                }
                className="input min-h-28"
                placeholder="Optional prompt injected only when this Skill is selected"
              />
            </Field>
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
                保存 Skill
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={<Sparkles size={15} />} label="Skill 数" value={skills.length} />
            <Metric icon={<Wrench size={15} />} label="工具数" value={tools.length} />
            <Metric
              icon={<CheckCircle2 size={15} />}
              label="当前步骤"
              value={draft.steps.length}
            />
          </div>

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="flex items-center border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">步骤编排</h2>
              <button
                onClick={addStep}
                className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-slate-950 bg-slate-950 px-3 text-xs text-white hover:bg-slate-800"
              >
                <Plus size={13} />
                添加步骤
              </button>
            </div>
            <div className="space-y-3 p-3">
              {draft.steps.length === 0 && (
                <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  还没有步骤。添加步骤后选择 MCP 工具并填写参数 JSON。
                </div>
              )}
              {draft.steps.map((step, index) => {
                const tool = tools.find((item) => item.name === step.tool);
                return (
                  <div
                    key={index}
                    className="rounded-md border border-slate-200 bg-white"
                  >
                    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-950 text-xs text-white">
                        {index + 1}
                      </span>
                      <select
                        value={step.tool}
                        onChange={(e) =>
                          updateStep(index, { tool: e.target.value })
                        }
                        className="input h-8 flex-1 py-1 font-mono"
                      >
                        <option value="">选择工具</option>
                        {tools.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <IconButton
                        title="上移"
                        onClick={() => moveStep(index, -1)}
                        disabled={index === 0}
                      >
                        <ArrowUp size={13} />
                      </IconButton>
                      <IconButton
                        title="下移"
                        onClick={() => moveStep(index, 1)}
                        disabled={index === draft.steps.length - 1}
                      >
                        <ArrowDown size={13} />
                      </IconButton>
                      <IconButton title="删除" onClick={() => removeStep(index)}>
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                    {tool && (
                      <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                        {tool.description}
                      </div>
                    )}
                    <div className="p-3">
                      <textarea
                        value={step.paramsText}
                        onChange={(e) =>
                          updateStep(index, { paramsText: e.target.value })
                        }
                        className="input min-h-32 font-mono"
                        spellCheck={false}
                        placeholder='{"query":"$input.query","topK":5}'
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">已有 Skill</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {skills.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  暂无 Skill
                </div>
              )}
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto]"
                >
                  <button onClick={() => edit(skill)} className="min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {skill.name}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {skill.version}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {skill.description || "未填写描述"}
                    </p>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {skill.steps.length} steps
                    </div>
                  </button>
                  <button
                    onClick={() => remove(skill.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="删除"
                  >
                    <Trash2 size={14} />
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

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-950 disabled:opacity-35"
    >
      {children}
    </button>
  );
}
