import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { PromptCategory, PromptCreate, PromptRead } from "../lib/types";
import { AddPromptForm } from "./prompts/AddPromptForm";
import { CsvUpload } from "./prompts/CsvUpload";
import { AuditPanel } from "./prompts/AuditPanel";

const CATEGORIES: PromptCategory[] = ["awareness", "evaluation", "comparison", "recommendation", "brand"];

const CAT_BADGE: Record<PromptCategory, string> = {
  awareness:      "bg-blue-900/50 text-blue-300",
  evaluation:     "bg-purple-900/50 text-purple-300",
  comparison:     "bg-amber-900/50 text-amber-300",
  recommendation: "bg-teal-900/50 text-teal-300",
  brand:          "bg-green-900/50 text-green-300",
};

function relDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Props { clientId: string }

export function PromptManager({ clientId }: Props) {
  const qc = useQueryClient();
  const [filterCat, setFilterCat] = useState<PromptCategory | "">("");
  const [filterActive, setFilterActive] = useState<"true" | "false" | "">( "true");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"none" | "add" | "csv">("none");
  const [showAudit, setShowAudit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editCat, setEditCat] = useState<PromptCategory | "">("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(rawSearch); setPage(1); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawSearch]);

  const filters = {
    category: filterCat || undefined,
    is_active: filterActive === "" ? undefined : filterActive === "true",
    search: search || undefined,
    page,
    per_page: 50,
  };

  const queryKey = ["prompts", clientId, filters] as const;

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => api.listPrompts(clientId, filters),
    placeholderData: (prev) => prev,
  });

  function invalidate() { qc.invalidateQueries({ queryKey: ["prompts", clientId] }); }
  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); }

  // ── Create ──────────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (d: PromptCreate) => api.createPrompt(clientId, d),
    onSuccess: () => { invalidate(); setMode("none"); flash("Prompt added"); },
  });

  // ── Update ──────────────────────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<PromptCreate & { is_active: boolean }> }) =>
      api.updatePrompt(clientId, id, body),
    onSuccess: () => { invalidate(); setEditId(null); flash("Prompt updated"); },
  });

  // ── Toggle (optimistic) ─────────────────────────────────────────────────────
  const toggleMut = useMutation<unknown, unknown, { id: string; active: boolean }, { prev: unknown }>({
    mutationFn: ({ id, active }) =>
      active ? api.activatePrompt(clientId, id) : api.deactivatePrompt(clientId, id),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData(queryKey);
      qc.setQueryData(queryKey, (old: typeof data) =>
        old ? { ...old, items: old.items.map((p) => p.id === id ? { ...p, is_active: active } : p) } : old
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev); },
    onSettled: () => invalidate(),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  // ── Stats bar ───────────────────────────────────────────────────────────────
  const activeCount = items.filter((p) => p.is_active).length;
  const catCounts = CATEGORIES.reduce((acc, c) => {
    acc[c] = items.filter((p) => p.category === c).length;
    return acc;
  }, {} as Record<PromptCategory, number>);

  function startEdit(p: PromptRead) { setEditId(p.id); setEditText(p.text); setEditCat(p.category); }
  function saveEdit() {
    if (!editId || !editCat) return;
    const orig = items.find((p) => p.id === editId);
    if (!orig) return;
    const body: Record<string, unknown> = {};
    if (editText !== orig.text) body.text = editText;
    if (editCat !== orig.category) body.category = editCat;
    if (Object.keys(body).length) updateMut.mutate({ id: editId, body });
    else setEditId(null);
  }

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-gray-400">Total: <strong className="text-white">{total}</strong></span>
        <span className="text-gray-400">Active: <strong className="text-green-400">{activeCount}</strong></span>
        {CATEGORIES.map((c) => (
          <span key={c} className="text-gray-400">
            {c.charAt(0).toUpperCase() + c.slice(1)}: <strong className="text-white">{catCounts[c]}</strong>
          </span>
        ))}
      </div>

      {/* Filter bar + action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search prompts…"
          value={rawSearch}
          onChange={(e) => setRawSearch(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
            placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-56"
        />
        <select value={filterCat} onChange={(e) => { setFilterCat(e.target.value as PromptCategory | ""); setPage(1); }}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select value={filterActive} onChange={(e) => { setFilterActive(e.target.value as "true" | "false" | ""); setPage(1); }}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="">All</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setMode(mode === "add" ? "none" : "add")}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
            Add prompt
          </button>
          <button onClick={() => setMode(mode === "csv" ? "none" : "csv")}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors">
            Upload CSV
          </button>
          <button onClick={() => setShowAudit((v) => !v)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors
              ${showAudit ? "bg-indigo-800 text-white" : "bg-gray-700 hover:bg-gray-600 text-white"}`}>
            Audit log
          </button>
        </div>
      </div>

      {successMsg && <p className="text-sm text-green-400">{successMsg}</p>}

      {/* Inline panels */}
      {mode === "add" && (
        <AddPromptForm
          onSubmit={async (d) => { await createMut.mutateAsync(d); }}
          onCancel={() => setMode("none")}
        />
      )}
      {mode === "csv" && (
        <CsvUpload
          onUpload={(file) => api.uploadCsvPrompts(clientId, file).then((r) => { invalidate(); return r; })}
          onCancel={() => setMode("none")}
        />
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        {(isLoading || isFetching) && (
          <div className="h-0.5 bg-indigo-600 animate-pulse" />
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-700 uppercase tracking-wider">
                <th className="text-left px-5 py-3 w-1/2">Text</th>
                <th className="text-left px-5 py-3">Category</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Created</th>
                <th className="text-left px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">No prompts found.</td></tr>
              ) : items.map((p) => {
                const isEditing = editId === p.id;
                return (
                  <tr key={p.id} className={`border-b border-gray-800 ${!p.is_active ? "opacity-50" : ""}`}>
                    <td className="px-5 py-3 max-w-md">
                      {isEditing ? (
                        <textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
                      ) : (
                        <span title={p.text}>{p.text.slice(0, 80)}{p.text.length > 80 ? "…" : ""}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <select value={editCat} onChange={(e) => setEditCat(e.target.value as PromptCategory)}
                          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500">
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CAT_BADGE[p.category as PromptCategory] ?? ""}`}>
                          {p.category}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                          ${p.is_active ? "bg-indigo-600" : "bg-gray-600"}`}
                        title={p.is_active ? "Deactivate" : "Activate"}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
                          ${p.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{relDate(p.created_at)}</td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button onClick={saveEdit} className="text-xs text-indigo-400 hover:text-indigo-300">Save</button>
                          <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-300">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(p)} className="text-xs text-gray-400 hover:text-gray-200" title="Edit">
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 flex items-center gap-4 text-sm text-gray-400 border-t border-gray-700">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="disabled:opacity-40 hover:text-white transition-colors">Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="disabled:opacity-40 hover:text-white transition-colors">Next</button>
          </div>
        )}
      </div>

      {/* Audit panel */}
      {showAudit && <AuditPanel clientId={clientId} />}
    </div>
  );
}
