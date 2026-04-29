import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { PromptCategory, PromptCreate, PromptRead } from "../lib/types";
import { AddPromptForm } from "./prompts/AddPromptForm";
import { CsvUpload } from "./prompts/CsvUpload";
import { AuditPanel } from "./prompts/AuditPanel";

const CATEGORIES: PromptCategory[] = ["awareness", "evaluation", "comparison", "recommendation", "brand"];

const CAT_BADGE: Record<PromptCategory, string> = {
  awareness:      "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  evaluation:     "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  comparison:     "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  recommendation: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300",
  brand:          "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
};

function relDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const inputCls =
  "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors";

export function PromptManager({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [filterCat, setFilterCat] = useState<PromptCategory | "">("");
  const [filterActive, setFilterActive] = useState<"true" | "false" | "">("true");
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

  const createMut = useMutation({
    mutationFn: (d: PromptCreate) => api.createPrompt(clientId, d),
    onSuccess: () => { invalidate(); setMode("none"); flash("Prompt added"); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<PromptCreate & { is_active: boolean }> }) =>
      api.updatePrompt(clientId, id, body),
    onSuccess: () => { invalidate(); setEditId(null); flash("Prompt updated"); },
  });

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
  const activeCount = items.filter((p) => p.is_active).length;

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
    <div className="space-y-5">
      {/* Stats chips */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-xs">
          <span className="text-gray-400">Total</span>
          <span className="font-semibold text-gray-900 dark:text-white">{total}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-gray-400">Active</span>
          <span className="font-semibold text-green-600 dark:text-green-400">{activeCount}</span>
        </div>
      </div>

      {/* Filter + action bar */}
      <div className="space-y-3">
        {/* Search row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search prompts…"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              className={`${inputCls} w-full pl-8`}
            />
          </div>
        </div>

        {/* Filters + actions */}
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={filterCat}
            onChange={(e) => { setFilterCat(e.target.value as PromptCategory | ""); setPage(1); }}
            className={`${inputCls} flex-1 min-w-[120px]`}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>

          <select
            value={filterActive}
            onChange={(e) => { setFilterActive(e.target.value as "true" | "false" | ""); setPage(1); }}
            className={`${inputCls} flex-1 min-w-[100px]`}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="">All</option>
          </select>

          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setMode(mode === "add" ? "none" : "add")}
              className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                mode === "add"
                  ? "bg-indigo-700 text-white"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span className="hidden sm:inline">Add prompt</span>
              <span className="sm:hidden">Add</span>
            </button>
            <button
              onClick={() => setMode(mode === "csv" ? "none" : "csv")}
              className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-white transition-colors"
            >
              CSV
            </button>
            <button
              onClick={() => setShowAudit((v) => !v)}
              className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                showAudit
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-white"
              }`}
            >
              Log
            </button>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-lg px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
          {successMsg}
        </div>
      )}

      {mode === "add" && (
        <AddPromptForm onSubmit={async (d) => { await createMut.mutateAsync(d); }} onCancel={() => setMode("none")} />
      )}
      {mode === "csv" && (
        <CsvUpload
          onUpload={(file) => api.uploadCsvPrompts(clientId, file).then((r) => { invalidate(); return r; })}
          onCancel={() => setMode("none")}
        />
      )}

      {/* Prompt list — card layout on all screens, table on lg+ */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {isFetching && <div className="h-0.5 bg-indigo-500 animate-pulse" />}

        {/* Desktop table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-5 py-3">Prompt</th>
                <th className="text-left px-4 py-3 w-32">Category</th>
                <th className="text-left px-4 py-3 w-20">Status</th>
                <th className="text-left px-4 py-3 w-28">Created</th>
                <th className="text-left px-4 py-3 w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">No prompts found.</td></tr>
              ) : items.map((p) => {
                const isEditing = editId === p.id;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${
                      !p.is_active ? "opacity-50" : "hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
                    }`}
                  >
                    <td className="px-5 py-3 max-w-sm">
                      {isEditing ? (
                        <textarea
                          rows={2}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
                        />
                      ) : (
                        <span className="text-gray-800 dark:text-gray-200 text-sm leading-snug" title={p.text}>
                          {p.text.length > 90 ? p.text.slice(0, 90) + "…" : p.text}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editCat}
                          onChange={(e) => setEditCat(e.target.value as PromptCategory)}
                          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none"
                        >
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${CAT_BADGE[p.category as PromptCategory] ?? ""}`}>
                          {p.category}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30
                          ${p.is_active ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"}`}
                        title={p.is_active ? "Deactivate" : "Activate"}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
                          ${p.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {relDate(p.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button onClick={saveEdit} className="text-xs font-medium text-indigo-500 hover:text-indigo-400">Save</button>
                          <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(p)} className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium">
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

        {/* Mobile card layout */}
        <div className="lg:hidden">
          {isLoading ? (
            <p className="px-4 py-10 text-center text-gray-400 text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-gray-400 text-sm">No prompts found.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map((p) => {
                const isEditing = editId === p.id;
                return (
                  <div key={p.id} className={`p-4 space-y-2 ${!p.is_active ? "opacity-50" : ""}`}>
                    {isEditing ? (
                      <textarea
                        rows={3}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
                      />
                    ) : (
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{p.text}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isEditing ? (
                        <select
                          value={editCat}
                          onChange={(e) => setEditCat(e.target.value as PromptCategory)}
                          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none"
                        >
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${CAT_BADGE[p.category as PromptCategory] ?? ""}`}>
                          {p.category}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-gray-500">{relDate(p.created_at)}</span>

                      <div className="ml-auto flex items-center gap-3">
                        <button
                          onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                            ${p.is_active ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
                            ${p.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                        {isEditing ? (
                          <>
                            <button onClick={saveEdit} className="text-xs font-medium text-indigo-500">Save</button>
                            <button onClick={() => setEditId(null)} className="text-xs text-gray-400">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => startEdit(p)} className="text-xs font-medium text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="px-4 sm:px-5 py-3 flex items-center justify-between text-sm text-gray-500 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 disabled:opacity-40 hover:text-gray-900 dark:hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
              Prev
            </button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 disabled:opacity-40 hover:text-gray-900 dark:hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Next
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        )}
      </div>

      {showAudit && <AuditPanel clientId={clientId} />}
    </div>
  );
}
