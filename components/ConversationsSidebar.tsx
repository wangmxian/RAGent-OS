"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
} from "lucide-react";

export interface ConversationItem {
  id: string;
  title: string;
  skill_id: string | null;
  created_at: number;
  updated_at: number;
}

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  /** 由父组件触发刷新（如新发送消息后） */
  refreshKey?: number;
}

export default function ConversationsSidebar({
  collapsed,
  onToggleCollapsed,
  activeId,
  onSelect,
  onCreate,
  refreshKey,
}: Props) {
  const [items, setItems] = useState<ConversationItem[]>([]);

  async function load() {
    try {
      const r = await fetch("/api/conversations");
      const j = await r.json();
      setItems(j.conversations || []);
    } catch {}
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function remove(id: string) {
    if (!confirm("删除该会话？历史消息将不可恢复。")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) onCreate();
    await load();
  }

  async function rename(id: string, current: string) {
    const t = prompt("会话标题", current);
    if (t == null) return;
    const v = t.trim();
    if (!v) return;
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: v }),
    });
    await load();
  }

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 border-r border-slate-200 bg-white flex flex-col items-center py-2 gap-2">
        <button
          onClick={onToggleCollapsed}
          className="p-2 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100"
          title="展开会话列表"
        >
          <PanelLeftOpen size={16} />
        </button>
        <button
          onClick={onCreate}
          className="p-2 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100"
          title="新会话"
        >
          <Plus size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <header className="h-14 px-3 border-b border-slate-200 flex items-center gap-1.5">
        <MessageSquare size={14} className="text-slate-600" />
        <div className="text-sm font-medium text-slate-950">会话</div>
        <button
          onClick={onCreate}
          title="新会话"
          className="ml-auto p-1.5 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={onToggleCollapsed}
          title="收起"
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100"
        >
          <PanelLeftClose size={14} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">
        {items.length === 0 && (
          <div className="text-center text-slate-500 text-xs py-6">
            暂无会话
          </div>
        )}
        {items.map((it) => {
          const active = it.id === activeId;
          return (
            <div
              key={it.id}
              onClick={() => onSelect(it.id)}
              className={`group rounded-md px-2.5 py-2 cursor-pointer text-sm flex items-center gap-2 ${
                active
                  ? "bg-slate-100 text-slate-950 border border-slate-200"
                  : "text-slate-700 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <span className="truncate flex-1">{it.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  rename(it.id, it.title);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-slate-950"
                title="重命名"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(it.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500"
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
