"use client";
import { useEffect, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  Wrench,
  Brain,
  Save,
  Code2,
} from "lucide-react";

export interface SkillItem {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  version: string;
  steps: Array<{ tool: string; params: Record<string, unknown> }>;
  system_prompt: string;
  tool_ids: string[];
  default_temp: number;
  enable_thinking: boolean;
}

export interface ToolDescriptor {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 当前选中的 skill id（在 chat 中使用） */
  activeSkillId: string | null;
  onActiveChange: (id: string | null) => void;
  /** 通知外部刷新（如有需要） */
  onChange?: () => void;
}

export default function SkillsPanel({
  open,
  onClose,
  activeSkillId,
  onActiveChange,
  onChange,
}: Props) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [editing, setEditing] = useState<SkillItem | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [a, b] = await Promise.all([
      fetch("/api/skills").then((r) => r.json()),
      fetch("/api/tools").then((r) => r.json()),
    ]);
    setSkills(a.skills || []);
    setTools([...(b.mcpTools || []), ...(b.tools || [])]);
  }
  useEffect(() => {
    if (open) load();
  }, [open]);

  async function save(s: SkillItem | null, draft: Partial<SkillItem>) {
    if (s) {
      await fetch(`/api/skills/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          icon: draft.icon,
          description: draft.description,
          version: draft.version,
          steps: draft.steps,
          systemPrompt: draft.system_prompt,
          toolIds: draft.tool_ids,
          defaultTemp: draft.default_temp,
          enableThinking: draft.enable_thinking,
        }),
      });
    } else {
      await fetch(`/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name || "新技能",
          icon: draft.icon,
          description: draft.description,
          version: draft.version,
          steps: draft.steps,
          systemPrompt: draft.system_prompt,
          toolIds: draft.tool_ids,
          defaultTemp: draft.default_temp,
          enableThinking: draft.enable_thinking,
        }),
      });
    }
    setEditing(null);
    setCreating(false);
    await load();
    onChange?.();
  }

  async function remove(id: string) {
    if (!confirm("删除该技能？")) return;
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    if (activeSkillId === id) onActiveChange(null);
    await load();
    onChange?.();
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[560px] bg-white border-l border-slate-200 z-50 shadow-2xl
          transform transition-transform ${open ? "translate-x-0" : "translate-x-full"}
          flex flex-col`}
      >
        <header className="h-14 px-4 border-b border-slate-200 flex items-center gap-2">
          <Sparkles size={16} className="text-slate-600" />
          <div>
            <div className="font-semibold text-slate-950">Skill 配置</div>
            <div className="text-[11px] text-slate-500">编排 Agent 可选择的执行流程</div>
          </div>
          <button
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
            className="ml-auto h-8 px-2.5 rounded-md text-xs flex items-center gap-1 border border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
          >
            <Plus size={13} /> 新建
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {creating && (
            <SkillEditor
              tools={tools}
              initial={null}
              onCancel={() => setCreating(false)}
              onSave={(d) => save(null, d)}
            />
          )}
          {editing && (
            <SkillEditor
              tools={tools}
              initial={editing}
              onCancel={() => setEditing(null)}
              onSave={(d) => save(editing, d)}
            />
          )}
          {!creating && !editing && (
            <div className="px-2 py-2 space-y-1">
              <div
                onClick={() => onActiveChange(null)}
                className={`rounded-md px-3 py-2 cursor-pointer text-sm flex items-center gap-2 border ${
                  activeSkillId === null
                    ? "bg-slate-100 border-slate-200 text-slate-950"
                    : "border-transparent text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="w-5 text-center">—</span>
                <span>不使用技能</span>
              </div>
              {skills.length === 0 && (
                  <div className="text-center text-slate-500 text-sm py-6">
                  暂无技能，点击右上角“新建”
                </div>
              )}
              {skills.map((s) => {
                const active = activeSkillId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => onActiveChange(s.id)}
                    className={`group rounded-md px-3 py-2 cursor-pointer text-sm flex items-start gap-2 border ${
                      active
                        ? "bg-slate-100 border-slate-200 text-slate-950"
                        : "border-transparent text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="w-5 text-center text-base">
                      {s.icon || "✨"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      {s.description && (
                          <div className="text-[11px] text-slate-500 line-clamp-2">
                          {s.description}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                        {s.steps.length > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Wrench size={10} /> {s.steps.length} 步
                          </span>
                        )}
                        {s.enable_thinking && (
                          <span className="flex items-center gap-0.5">
                            <Brain size={10} /> 思考
                          </span>
                        )}
                        <span>{s.version || "v1"}</span>
                        <span>T={s.default_temp.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(s);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-slate-950"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(s.id);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function SkillEditor({
  initial,
  tools,
  onCancel,
  onSave,
}: {
  initial: SkillItem | null;
  tools: ToolDescriptor[];
  onCancel: () => void;
  onSave: (d: Partial<SkillItem>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [version, setVersion] = useState(initial?.version ?? "v1");
  const [systemPrompt, setSystemPrompt] = useState(
    initial?.system_prompt ?? "",
  );
  const [toolIds, setToolIds] = useState<string[]>(initial?.tool_ids ?? []);
  const [stepsText, setStepsText] = useState(
    JSON.stringify(initial?.steps ?? [], null, 2),
  );
  const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<number>(initial?.default_temp ?? 0.7);
  const [thinking, setThinking] = useState<boolean>(
    initial?.enable_thinking ?? false,
  );

  function toggleTool(id: string) {
    setToolIds((arr) =>
      arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
    );
  }

  function parseSteps() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stepsText);
    } catch (e: any) {
      throw new Error(`步骤 JSON 无效：${e?.message || String(e)}`);
    }
    if (!Array.isArray(parsed)) throw new Error("步骤 JSON 必须是数组");
    parsed.forEach((step, idx) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) {
        throw new Error(`第 ${idx + 1} 步必须是对象`);
      }
      const s = step as any;
      if (typeof s.tool !== "string" || !s.tool.trim()) {
        throw new Error(`第 ${idx + 1} 步缺少 tool`);
      }
      if (!s.params || typeof s.params !== "object" || Array.isArray(s.params)) {
        throw new Error(`第 ${idx + 1} 步 params 必须是对象`);
      }
    });
    return parsed as Array<{ tool: string; params: Record<string, unknown> }>;
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          maxLength={2}
          placeholder="✨"
          className="w-12 text-center bg-white border border-slate-200 rounded-md px-2 py-2 text-base text-slate-950"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="技能名称"
          className="flex-1 bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-950"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="一句话描述（可选）"
        className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-950"
      />
      <input
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder="版本，例如 v1"
        className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-950"
      />
      <div>
        <label className="text-[11px] text-slate-500 flex items-center gap-1">
          <Code2 size={12} /> Steps JSON
        </label>
        <textarea
          value={stepsText}
          onChange={(e) => {
            setStepsText(e.target.value);
            setError(null);
          }}
          rows={12}
          placeholder='[{"tool":"ragSearch","params":{"query":"$input.query","topK":5}}]'
          className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm font-mono text-slate-100"
        />
        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
      </div>
      <div>
        <label className="text-[11px] text-slate-500">System Prompt（普通聊天兜底）</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={3}
          placeholder="普通聊天时的角色 / 行为规范 / 输出风格…"
          className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-slate-950"
        />
      </div>
      <div>
        <label className="text-[11px] text-slate-500 mb-1 block">
          可用工具参考
        </label>
        <div className="flex flex-wrap gap-1.5">
          {tools.map((t) => {
            const on = toolIds.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleTool(t.id)}
                className={`text-[11px] px-2 py-1 rounded-md border ${
                  on
                    ? "bg-slate-950 border-slate-950 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
                title={t.description}
              >
                {t.name}
              </button>
            );
          })}
          {tools.length === 0 && (
            <div className="text-slate-500 text-xs">暂无可用工具</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-2 text-slate-700">
          <input
            type="checkbox"
            className="accent-slate-950"
            checked={thinking}
            onChange={(e) => setThinking(e.target.checked)}
          />
          默认思考模式
        </label>
        <label className="flex items-center gap-2 text-slate-700">
          <span>Temp</span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={temp}
            onChange={(e) => setTemp(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="w-8 text-right">{temp.toFixed(2)}</span>
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-600 hover:text-slate-950 hover:bg-slate-50"
        >
          取消
        </button>
        <button
          onClick={() => {
            let steps;
            try {
              steps = parseSteps();
            } catch (e: any) {
              setError(e?.message || String(e));
              return;
            }
            onSave({
              name: name.trim() || "新技能",
              icon: icon.trim() || null,
              description: description.trim() || null,
              version: version.trim() || "v1",
              steps,
              system_prompt: systemPrompt,
              tool_ids: toolIds,
              default_temp: temp,
              enable_thinking: thinking,
            });
          }}
          className="px-3 py-1.5 text-xs rounded-md bg-slate-950 hover:bg-slate-800 text-white flex items-center gap-1"
        >
          <Save size={13} /> 保存
        </button>
      </div>
    </div>
  );
}
