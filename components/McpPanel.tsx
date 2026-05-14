"use client";
import { useEffect, useState } from "react";
import { X, Plus, Trash2, Plug, AlertTriangle } from "lucide-react";

export interface McpServer {
  id: string;
  name: string;
  transport: "stdio" | "http" | "sse";
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  enabled: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function McpPanel({ open, onClose }: Props) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [note, setNote] = useState<string>("");
  const [creating, setCreating] = useState(false);

  async function load() {
    const r = await fetch("/api/mcp");
    const j = await r.json();
    setServers(j.servers || []);
    setNote(j.note || "");
  }
  useEffect(() => {
    if (open) load();
  }, [open]);

  async function remove(id: string) {
    if (!confirm("删除该 MCP 服务器配置？")) return;
    await fetch(`/api/mcp?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  async function create(input: {
    name: string;
    transport: McpServer["transport"];
    command?: string;
    args?: string[];
    url?: string;
  }) {
    await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, enabled: false }),
    });
    setCreating(false);
    await load();
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
        className={`fixed top-0 right-0 h-full w-full sm:w-[520px] bg-white border-l border-slate-200 z-50 shadow-2xl
          transform transition-transform ${open ? "translate-x-0" : "translate-x-full"}
          flex flex-col`}
      >
        <header className="h-14 px-4 border-b border-slate-200 flex items-center gap-2">
          <Plug size={16} className="text-slate-600" />
          <div>
            <div className="font-semibold text-slate-950">MCP 配置</div>
            <div className="text-[11px] text-slate-500">管理外部企业能力网关</div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="ml-auto h-8 px-2.5 rounded-md text-xs flex items-center gap-1 border border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
          >
            <Plus size={13} /> 新增
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </header>

        {note && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800 flex gap-2 items-start">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{note}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1.5">
          {servers.length === 0 && !creating && (
            <div className="text-center text-slate-500 text-sm py-6">
              暂无 MCP 服务器配置
            </div>
          )}
          {creating && <McpEditor onCancel={() => setCreating(false)} onSave={create} />}
          {servers.map((s) => (
            <div
              key={s.id}
              className="group rounded-md px-3 py-2 border border-slate-200 flex items-start gap-2 hover:bg-slate-50"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-950 truncate">{s.name}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {s.transport === "stdio"
                    ? `${s.command || ""} ${s.args.join(" ")}`
                    : s.url}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {s.transport.toUpperCase()} · {s.enabled ? "已启用" : "未启用"}
                </div>
              </div>
              <button
                onClick={() => remove(s.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

function McpEditor({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (input: {
    name: string;
    transport: "stdio" | "http" | "sse";
    command?: string;
    args?: string[];
    url?: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http" | "sse">("stdio");
  const [command, setCommand] = useState("");
  const [argsStr, setArgsStr] = useState("");
  const [url, setUrl] = useState("");

  return (
    <div className="p-3 border border-slate-200 bg-slate-50 rounded-md space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名称（如 filesystem）"
        className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-950"
      />
      <div className="flex gap-2 text-xs">
        {(["stdio", "http", "sse"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTransport(t)}
            className={`px-2 py-1 rounded border ${
              transport === t
                ? "bg-slate-950 border-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {transport === "stdio" ? (
        <>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="命令（如 npx）"
            className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-slate-950"
          />
          <input
            value={argsStr}
            onChange={(e) => setArgsStr(e.target.value)}
            placeholder="参数（空格分隔）"
            className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-slate-950"
          />
        </>
      ) : (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL"
          className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm font-mono text-slate-950"
        />
      )}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs rounded-md border border-slate-200 text-slate-600 hover:text-slate-950 hover:bg-white"
        >
          取消
        </button>
        <button
          onClick={() =>
            onSave({
              name: name.trim() || "未命名",
              transport,
              command: transport === "stdio" ? command : undefined,
              args:
                transport === "stdio"
                  ? argsStr.split(/\s+/).filter(Boolean)
                  : undefined,
              url: transport !== "stdio" ? url : undefined,
            })
          }
          className="px-3 py-1 text-xs rounded-md bg-slate-950 hover:bg-slate-800 text-white"
        >
          保存
        </button>
      </div>
    </div>
  );
}
