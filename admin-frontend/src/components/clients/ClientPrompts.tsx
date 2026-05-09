import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { promptsApi } from "../../api/client";
import type { Prompt, PromptCategory } from "../../types";

const CATEGORIES: PromptCategory[] = [
  "awareness", "evaluation", "comparison", "recommendation", "brand",
];

const CAT_BADGE: Record<PromptCategory, string> = {
  awareness: "bg-blue-500/20 text-blue-300",
  evaluation: "bg-purple-500/20 text-purple-300",
  comparison: "bg-amber-500/20 text-amber-300",
  recommendation: "bg-teal-500/20 text-teal-300",
  brand: "bg-green-500/20 text-green-300",
};

export function ClientPrompts() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();

  const [filterCat, setFilterCat] = useState("");
  const [filterActive, setFilterActive] = useState<"true" | "false" | "">("true");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState("");
  const [addCat, setAddCat] = useState<PromptCategory | "">("");
  const [addErr, setAddErr] = useState<string | null>(null);
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

  const qKey = ["admin-prompts", clientId, filters] as const;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: qKey,
    queryFn: () => promptsApi.list(clientId!, filters),
    placeholderData: (prev) => prev,
  });

  function invalidate() { qc.invalidateQueries({ queryKey: ["admin-prompts", clientId] }); }
  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); }

  const createMut = useMutation({
    mutationFn: () => promptsApi.create(clientId!, addText, addCat as PromptCategory),
    onSuccess: () => { invalidate(); setShowAdd(false); setAddText(""); setAddCat(""); setAddErr(null); flash("Prompt added"); },
    onError: () => setAddErr("Failed to add prompt (may already exist)"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      promptsApi.update(clientId!, id, body),
    onSuccess: () => { invalidate(); setEditId(null); flash("Prompt updated"); },
  });

  const toggleMut = useMutation<unknown, unknown, { id: string; active: boolean }, { prev: unknown }>({
    mutationFn: ({ id, active }) =>
      active ? promptsApi.activate(clientId!, id) : promptsApi.deactivate(clientId!, id),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: qKey });
      const prev = qc.getQueryData(qKey);
      qc.setQueryData(qKey, (old: typeof data) =>
        old ? { ...old, items: old.items.map((p) => p.id === id ? { ...p, is_active: active } : p) } : old
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(qKey, ctx.prev); },
    onSettled: () => invalidate(),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  function startEdit(p: Prompt) { setEditId(p.id); setEditText(p.text); setEditCat(p.category); }
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

  const inputCls = "bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors";

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex gap-2 flex-wrap">
        <span className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-400">
          Total <span className="text-white font-semibold ml-1">{total}</span>
        </span>
        <span className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1" />
          Active <span className="text-green-400 font-semibold ml-1">{items.filter((p) => p.is_active).length}</span>
        </span>
      </div>

      {/* Controls */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search prompts…"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              className={`${inputCls} w-full pl-8`}
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(1); }} className={inputCls}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <select value={filterActive} onChange={(e) => { setFilterActive(e.target.value as "true" | "false" | ""); setPage(1); }} className={inputCls}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="">All</option>
          </select>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="ml-auto px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Add prompt
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="text-sm text-green-400 bg-green-950/30 border border-green-900 rounded-lg px-3 py-2">{successMsg}</div>
      )}

      {showAdd && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Add Prompt</h3>
          <textarea rows={2} value={addText} onChange={(e) => setAddText(e.target.value)}
            placeholder="Enter prompt text (10–500 chars)…"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
          <p className="text-xs text-gray-500 text-right">{addText.length}/500</p>
          <select value={addCat} onChange={(e) => setAddCat(e.target.value as PromptCategory)} className={inputCls}>
            <option value="">Select category…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          {addErr && <p className="text-xs text-red-400">{addErr}</p>}
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate()} disabled={addText.length < 10 || !addCat || createMut.isPending}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:bg-gray-700 disabled:text-gray-400 transition-colors">
              {createMut.isPending ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddErr(null); }} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isFetching && <div className="h-0.5 bg-indigo-600 animate-pulse" />}
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No prompts found.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 bg-gray-800/50">
                    <th className="text-left px-5 py-3">Prompt</th>
                    <th className="text-left px-4 py-3 w-32">Category</th>
                    <th className="text-left px-4 py-3 w-20">Active</th>
                    <th className="text-left px-4 py-3 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const isEditing = editId === p.id;
                    return (
                      <tr key={p.id} className={`border-b border-gray-800 last:border-0 transition-colors ${!p.is_active ? "opacity-50" : "hover:bg-gray-800/20"}`}>
                        <td className="px-5 py-3 max-w-sm">
                          {isEditing ? (
                            <textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
                          ) : (
                            <span className="text-gray-200 leading-snug" title={p.text}>
                              {p.text.length > 90 ? p.text.slice(0, 90) + "…" : p.text}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select value={editCat} onChange={(e) => setEditCat(e.target.value as PromptCategory)}
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none">
                              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${CAT_BADGE[p.category as PromptCategory] ?? ""}`}>
                              {p.category}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${p.is_active ? "bg-indigo-600" : "bg-gray-600"}`}>
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${p.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button onClick={saveEdit} className="text-xs font-medium text-indigo-400 hover:text-indigo-300">Save</button>
                              <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => startEdit(p)} className="text-xs text-gray-500 hover:text-gray-200 font-medium">Edit</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-800">
              {items.map((p) => {
                const isEditing = editId === p.id;
                return (
                  <div key={p.id} className={`px-4 py-3 space-y-2 ${!p.is_active ? "opacity-50" : ""}`}>
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
                        <select value={editCat} onChange={(e) => setEditCat(e.target.value as PromptCategory)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none">
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} className="text-xs font-medium text-indigo-400 hover:text-indigo-300">Save</button>
                          <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-200 leading-snug">
                          {p.text.length > 100 ? p.text.slice(0, 100) + "…" : p.text}
                        </p>
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${CAT_BADGE[p.category as PromptCategory] ?? ""}`}>
                            {p.category}
                          </span>
                          <button onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${p.is_active ? "bg-indigo-600" : "bg-gray-600"}`}>
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${p.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                          <button onClick={() => startEdit(p)} className="ml-auto text-xs text-indigo-400 hover:text-indigo-300 font-medium">Edit</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="px-4 sm:px-5 py-3 flex items-center justify-between border-t border-gray-800 text-sm text-gray-500">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="disabled:opacity-40 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800">← Prev</button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="disabled:opacity-40 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
