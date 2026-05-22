import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { promptsApi } from "../../api/client";
import type { Prompt, PromptCategory } from "../../types";

const CATEGORIES: PromptCategory[] = [
  "awareness", "evaluation", "comparison", "recommendation", "brand",
];
const VALID_CATEGORIES = new Set(CATEGORIES);
const MAX_JSON_BYTES = 2 * 1024 * 1024; // 2 MB

// ── JSON upload types ─────────────────────────────────────────────────────────

interface ParsedPrompt {
  text: string;
  category: string;
}

interface ParsedRow {
  index: number;
  prompt: ParsedPrompt;
  errors: string[];
}

function validateRow(p: unknown, index: number): ParsedRow {
  const errors: string[] = [];
  const raw = p as Record<string, unknown>;
  const text = typeof raw?.text === "string" ? raw.text.trim() : "";
  const category = typeof raw?.category === "string" ? raw.category.trim() : "";
  if (!text || text.length < 10) errors.push("Text must be at least 10 characters");
  else if (text.length > 500) errors.push("Text must be at most 500 characters");
  if (!category) errors.push("Category is required");
  else if (!VALID_CATEGORIES.has(category as PromptCategory)) errors.push(`Invalid category "${category}"`);
  return { index, prompt: { text, category }, errors };
}

function downloadJsonTemplate() {
  const template = [
    { text: "What is the best [product category] for [use case]?", category: "evaluation" },
    { text: "[Brand A] vs [Brand B]", category: "comparison" },
    { text: "What is [product category]?", category: "awareness" },
    { text: "Best [product category] tools", category: "recommendation" },
    { text: "[Brand name] reviews", category: "brand" },
  ];
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "prompt_template.json";
  a.click();
  URL.revokeObjectURL(url);
}

// ── JSON uploader component ───────────────────────────────────────────────────

function JsonUploader({
  clientId,
  onClose,
  onSuccess,
}: {
  clientId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importMut = useMutation({
    mutationFn: (prompts: ParsedPrompt[]) =>
      promptsApi.bulkCreate(clientId, prompts as { text: string; category: string }[]),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["admin-prompts", clientId] });
      setTimeout(() => {
        onSuccess(`Created ${data.created} prompt${data.created !== 1 ? "s" : ""}${data.skipped ? `, skipped ${data.skipped} duplicates` : ""}`);
        onClose();
      }, 3000);
    },
  });

  function processFile(file: File) {
    setParseError(null);
    setRows(null);
    setResult(null);
    if (file.size > MAX_JSON_BYTES) {
      setParseError("File exceeds 2 MB limit.");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target!.result as string);
        const arr: unknown[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.prompts)
          ? parsed.prompts
          : null!;
        if (!Array.isArray(arr)) {
          setParseError('Expected a JSON array or an object with a "prompts" array.');
          return;
        }
        setRows(arr.map((item, i) => validateRow(item, i)));
      } catch {
        setParseError("This file is not valid JSON. Please check the format.");
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  const validRows = rows?.filter((r) => r.errors.length === 0) ?? [];
  const invalidCount = (rows?.length ?? 0) - validRows.length;

  const inputCls = "bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors";

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Upload JSON</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
      </div>

      {/* Drop zone */}
      {!rows && !parseError && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragOver ? "border-indigo-500 bg-indigo-950/30" : "border-gray-700 hover:border-gray-600"
          }`}
          onClick={() => fileRef.current?.click()}
        >
          <p className="text-sm text-gray-400">Drag &amp; drop a <span className="font-mono">.json</span> file here</p>
          <p className="text-xs text-gray-600 mt-1">or <span className="text-indigo-400 hover:text-indigo-300">browse files</span></p>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-lg p-3 text-sm text-red-300">
          {parseError}
          <button onClick={() => { setParseError(null); setFileName(null); }} className="ml-3 underline text-red-400 text-xs">Try again</button>
        </div>
      )}

      {/* Preview table */}
      {rows && !result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                <span className="font-mono text-white">{rows.length}</span> prompts in <span className="font-mono text-gray-300">{fileName}</span>
              </span>
              {invalidCount > 0 && (
                <span className="text-xs bg-red-950/50 text-red-400 border border-red-800/50 px-2 py-0.5 rounded-full">
                  {invalidCount} error{invalidCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <button onClick={() => { setRows(null); setFileName(null); }} className="text-xs text-gray-500 hover:text-gray-300">← Change file</button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-800">
            <table className="w-full text-xs">
              <thead className="bg-gray-800/60 sticky top-0">
                <tr className="text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-3 py-2 w-8">#</th>
                  <th className="text-left px-3 py-2">Text</th>
                  <th className="text-left px-3 py-2 w-28">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.slice(0, 15).map((row) => (
                  <tr key={row.index} className={row.errors.length ? "bg-red-950/20" : ""}>
                    <td className="px-3 py-2 text-gray-600 font-mono">{row.index + 1}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <span className="text-gray-300 leading-snug line-clamp-2">
                        {row.prompt.text || <span className="italic text-gray-600">empty</span>}
                      </span>
                      {row.errors.length > 0 && (
                        <p className="text-red-400 text-[10px] mt-0.5">{row.errors.join("; ")}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.prompt.category ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          VALID_CATEGORIES.has(row.prompt.category as PromptCategory)
                            ? "bg-indigo-900/50 text-indigo-300"
                            : "bg-red-900/50 text-red-400"
                        }`}>
                          {row.prompt.category}
                        </span>
                      ) : <span className="text-gray-600 italic text-[10px]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 15 && (
              <p className="text-center text-xs text-gray-600 py-2 border-t border-gray-800">
                …and {rows.length - 15} more
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => importMut.mutate(validRows.map((r) => r.prompt))}
              disabled={validRows.length === 0 || importMut.isPending}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:bg-gray-700 disabled:text-gray-400 transition-colors"
            >
              {importMut.isPending ? "Importing…" : `Import ${validRows.length} Prompt${validRows.length !== 1 ? "s" : ""}`}
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg transition-colors">
              Cancel
            </button>
            {importMut.isError && (
              <p className="text-xs text-red-400">Upload failed. Please try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-200 space-y-1">
          <p>
            <span className="text-green-400">✓ Created: {result.created}</span>
            {result.skipped > 0 && <span className="ml-3 text-gray-400">⏭ Skipped (duplicates): {result.skipped}</span>}
            {result.errors.length > 0 && <span className="ml-3 text-red-400">✗ Errors: {result.errors.length}</span>}
          </p>
        </div>
      )}

      {/* Template download */}
      <p className="text-xs text-gray-600">
        Need the format?{" "}
        <button onClick={downloadJsonTemplate} className="text-indigo-400 hover:text-indigo-300 underline">
          Download JSON template
        </button>
      </p>
    </div>
  );
}

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
  const [showJsonUpload, setShowJsonUpload] = useState(false);
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
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setShowJsonUpload((v) => !v); setShowAdd(false); }}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload JSON
            </button>
            <button
              onClick={() => { setShowAdd((v) => !v); setShowJsonUpload(false); }}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Add prompt
            </button>
          </div>
        </div>
      </div>

      {showJsonUpload && clientId && (
        <JsonUploader
          clientId={clientId}
          onClose={() => setShowJsonUpload(false)}
          onSuccess={(msg) => { setShowJsonUpload(false); flash(msg); }}
        />
      )}

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
