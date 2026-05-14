"use client";
import { useEffect, useRef, useState } from "react";
import {
  X,
  Upload,
  Trash2,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
} from "lucide-react";

export interface FileRow {
  id: string;
  name: string;
  mime: string;
  size: number;
  modality: "text" | "image";
  status: "pending" | "indexing" | "ready" | "error";
  error: string | null;
  chunk_count: number;
  created_at: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 选中的文件 id 集合（用于检索过滤），受控 */
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
}

export default function FilesPanel({
  open,
  onClose,
  selectedIds,
  onSelectedChange,
}: Props) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/files");
      const j = await r.json();
      setFiles(j.files || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function upload(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      Array.from(fileList).forEach((f) => fd.append("files", f));
      const r = await fetch("/api/files", { method: "POST", body: fd });
      const j = await r.json();
      const failed = (j.results || []).filter((x: any) => !x.ok);
      if (failed.length) {
        setErr(
          failed
            .map((f: any) => `${f.name || f.id}: ${f.error}`)
            .join("\n"),
        );
      }
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm("确认删除此文件及其全部索引？")) return;
    await fetch(`/api/files/${id}`, { method: "DELETE" });
    onSelectedChange(selectedIds.filter((x) => x !== id));
    await refresh();
  }

  async function reindex(id: string) {
    await fetch(`/api/files/${id}?action=reindex`, { method: "POST" });
    await refresh();
  }

  function toggleSelected(id: string) {
    if (selectedIds.includes(id)) {
      onSelectedChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectedChange([...selectedIds, id]);
    }
  }

  return (
    <>
      {/* 遮罩 */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      {/* 抽屉 */}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[520px] bg-white border-l border-slate-200 z-50 shadow-2xl
          transform transition-transform ${open ? "translate-x-0" : "translate-x-full"}
          flex flex-col`}
      >
        <header className="h-14 px-4 border-b border-slate-200 flex items-center gap-2">
          <FileText size={16} className="text-slate-600" />
          <div>
            <div className="font-semibold text-slate-950">知识库文件</div>
            <div className="text-[11px] text-slate-500">上传、索引并选择检索范围</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100"
              title="刷新"
            >
              <RefreshCw
                size={15}
                className={loading ? "animate-spin" : ""}
              />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-950 hover:bg-slate-100"
              title="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* 上传区 */}
        <div
          className="m-4 border border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-slate-500 hover:bg-slate-50 transition"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-slate-700 text-sm">
              <Loader2 size={16} className="animate-spin" />
              上传并索引中…
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2 text-slate-700 text-sm">
                <Upload size={15} />
                点击或拖拽上传
              </div>
              <div className="text-[11px] text-slate-500">
                支持 PDF / DOCX / MD / TXT / 图片
              </div>
            </div>
          )}
        </div>

        {err && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-md border border-red-200 bg-red-50 text-xs text-red-700 whitespace-pre-wrap">
            {err}
          </div>
        )}

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1.5">
          {!loading && !files.length && (
            <div className="text-center text-slate-500 text-sm py-8">
              暂无文件
            </div>
          )}
          {files.map((f) => (
            <div
              key={f.id}
              className="group flex items-start gap-2 px-2 py-2 rounded-md hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="mt-1.5 accent-slate-950"
                checked={selectedIds.includes(f.id)}
                disabled={f.status !== "ready"}
                onChange={() => toggleSelected(f.id)}
              />
              <div className="mt-0.5 text-slate-500">
                {f.modality === "image" ? (
                  <ImageIcon size={15} />
                ) : (
                  <FileText size={15} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-950 truncate">
                  {f.name}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                  <StatusBadge status={f.status} />
                  <span>{prettySize(f.size)}</span>
                  {f.chunk_count > 0 && <span>· {f.chunk_count} chunks</span>}
                </div>
                {f.status === "error" && f.error && (
                  <div className="text-[11px] text-red-600 mt-1 flex gap-1">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span className="break-all">{f.error}</span>
                  </div>
                )}
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition">
                <button
                  onClick={() => reindex(f.id)}
                  className="p-1 rounded text-slate-400 hover:text-slate-950 hover:bg-slate-100"
                  title="重建索引"
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  onClick={() => remove(f.id)}
                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100"
                  title="删除"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {selectedIds.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
            已选中 <span className="text-slate-950 font-medium">{selectedIds.length}</span>{" "}
            个文件，将作为本次会话的检索范围
          </div>
        )}
      </aside>
    </>
  );
}

function StatusBadge({ status }: { status: FileRow["status"] }) {
  const color =
    status === "ready"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : status === "indexing"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : status === "error"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-slate-50 text-slate-500 border-slate-200";
  const label =
    status === "ready"
      ? "已索引"
      : status === "indexing"
        ? "索引中"
        : status === "error"
          ? "失败"
          : "待处理";
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] rounded border ${color}`}
    >
      {label}
    </span>
  );
}

function prettySize(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}
