import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { promptsApi, runsApi, settingsApi } from "../../api/client";
import type { Prompt, PromptCategoryConfig } from "../../types";
import { PieChart, Pie, Cell } from "recharts";

// ── Constants & helpers ──────────────────────────────────────────────────────

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const FALLBACK_COLOR = "#9ca3af";

/** Soft background tint from a category hex color, for badges. */
function tint(hex: string | undefined, alpha = 0.14): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex ?? "");
  if (!m) return `rgba(156,163,175,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Colored-dot + name badge for a (possibly empty) category. */
function CategoryBadge({ category, colorByName }: { category: string; colorByName: Map<string, string> }) {
  if (!category) return <span className="text-gray-400 text-xs">—</span>;
  const color = colorByName.get(category) ?? FALLBACK_COLOR;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: tint(color), color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {category}
    </span>
  );
}

// ── JSON upload types & helpers ───────────────────────────────────────────────

interface ParsedPrompt { text: string; category: string; }
interface ParsedRow {
  index: number;
  prompt: ParsedPrompt;
  rawCategory: string;
  unknownCategory: boolean;
  errors: string[];
}

function validateRow(p: unknown, index: number, validNames: Map<string, string>): ParsedRow {
  const errors: string[] = [];
  const raw = p as Record<string, unknown>;
  const text = typeof raw?.text === "string" ? raw.text.trim() : "";
  const rawCategory = typeof raw?.category === "string" ? raw.category.trim() : "";
  if (!text || text.length < 10) errors.push("Text must be at least 10 characters");
  else if (text.length > 500) errors.push("Text must be at most 500 characters");
  // Category is optional; an unknown category is imported blank (not an error).
  const canonical = rawCategory ? validNames.get(rawCategory.toLowerCase()) : undefined;
  return {
    index,
    prompt: { text, category: canonical ?? "" },
    rawCategory,
    unknownCategory: !!rawCategory && !canonical,
    errors,
  };
}

function downloadJsonTemplate(categoryNames: string[]) {
  const examples = [
    "What is the best [product category] for [use case]?",
    "[Brand A] vs [Brand B]",
    "What should I look for when choosing a [product category]?",
    "Best [product category] for [specific use case]",
    "Most trusted [product category] providers",
  ];
  const template = examples.map((text, i) => ({
    text,
    category: categoryNames.length ? categoryNames[i % categoryNames.length] : "",
  }));
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "prompt_template.json"; a.click();
  URL.revokeObjectURL(url);
}

// ── JSON uploader ─────────────────────────────────────────────────────────────

function JsonUploader({ clientId, categories, onClose, onSuccess }: {
  clientId: string; categories: PromptCategoryConfig[]; onClose: () => void; onSuccess: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const validNames = useMemo(
    () => new Map(categories.map((c) => [c.name.toLowerCase(), c.name])),
    [categories],
  );
  const colorByName = useMemo(
    () => new Map(categories.map((c) => [c.name, c.color])),
    [categories],
  );
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
    setParseError(null); setRows(null); setResult(null);
    if (file.size > MAX_JSON_BYTES) { setParseError("File exceeds 2 MB limit."); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target!.result as string);
        const arr: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.prompts) ? parsed.prompts : null!;
        if (!Array.isArray(arr)) { setParseError('Expected a JSON array or an object with a "prompts" array.'); return; }
        setRows(arr.map((item, i) => validateRow(item, i, validNames)));
      } catch { setParseError("This file is not valid JSON."); }
    };
    reader.readAsText(file);
  }

  const validRows = rows?.filter((r) => r.errors.length === 0) ?? [];
  const invalidCount = (rows?.length ?? 0) - validRows.length;
  const inputCls = "bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Upload JSON</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
      </div>
      {!rows && !parseError && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
          onClick={() => fileRef.current?.click()}
        >
          <p className="text-sm text-gray-400">Drag &amp; drop a <span className="font-mono">.json</span> file here</p>
          <p className="text-xs text-gray-400 mt-1">or <span className="text-blue-600">browse files</span></p>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
        </div>
      )}
      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {parseError}
          <button onClick={() => { setParseError(null); setFileName(null); }} className="ml-3 underline text-red-500 text-xs">Try again</button>
        </div>
      )}
      {rows && !result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600"><span className="font-mono font-semibold">{rows.length}</span> prompts in <span className="font-mono">{fileName}</span></span>
              {invalidCount > 0 && (
                <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">{invalidCount} error{invalidCount !== 1 ? "s" : ""}</span>
              )}
            </div>
            <button onClick={() => { setRows(null); setFileName(null); }} className="text-xs text-gray-500 hover:text-gray-700">← Change file</button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-3 py-2 w-8">#</th>
                  <th className="text-left px-3 py-2">Text</th>
                  <th className="text-left px-3 py-2 w-28">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, 15).map((row) => (
                  <tr key={row.index} className={row.errors.length ? "bg-red-50" : ""}>
                    <td className="px-3 py-2 text-gray-500 font-mono">{row.index + 1}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <span className="text-gray-700 leading-snug line-clamp-2">{row.prompt.text || <span className="italic text-gray-400">empty</span>}</span>
                      {row.errors.length > 0 && <p className="text-red-500 text-[10px] mt-0.5">{row.errors.join("; ")}</p>}
                    </td>
                    <td className="px-3 py-2">
                      {row.prompt.category ? (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{ backgroundColor: tint(colorByName.get(row.prompt.category)), color: colorByName.get(row.prompt.category) ?? FALLBACK_COLOR }}
                        >
                          {row.prompt.category}
                        </span>
                      ) : row.unknownCategory ? (
                        <span className="text-[10px] text-amber-600" title={`Unknown category "${row.rawCategory}" — will import blank`}>
                          {row.rawCategory} → blank
                        </span>
                      ) : <span className="text-gray-400 italic text-[10px]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 15 && <p className="text-center text-xs text-gray-400 py-2 border-t border-gray-100">…and {rows.length - 15} more</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => importMut.mutate(validRows.map((r) => r.prompt))}
              disabled={validRows.length === 0 || importMut.isPending}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg disabled:bg-gray-100 disabled:text-gray-400 transition-colors">
              {importMut.isPending ? "Importing…" : `Import ${validRows.length} Prompt${validRows.length !== 1 ? "s" : ""}`}
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition-colors">Cancel</button>
            {importMut.isError && <p className="text-xs text-red-500">Upload failed.</p>}
          </div>
        </div>
      )}
      {result && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 space-y-1">
          <p><span className="text-emerald-600">✓ Created: {result.created}</span>
          {result.skipped > 0 && <span className="ml-3 text-gray-500">⏭ Skipped: {result.skipped}</span>}</p>
        </div>
      )}
      <p className="text-xs text-gray-500">Need the format? <button onClick={() => downloadJsonTemplate(categories.map((c) => c.name))} className="text-blue-600 hover:text-blue-800 underline">Download JSON template</button></p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const [addCat, setAddCat] = useState<string>("");
  const [addErr, setAddErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editCat, setEditCat] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(rawSearch); setPage(1); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawSearch]);

  // Filtered query (table)
  const filters = { category: filterCat || undefined, is_active: filterActive === "" ? undefined : filterActive === "true", search: search || undefined, page, per_page: 50 };
  const qKey = ["admin-prompts", clientId, filters] as const;
  const { data, isLoading, isFetching } = useQuery({ queryKey: qKey, queryFn: () => promptsApi.list(clientId!, filters), placeholderData: (prev) => prev });

  // All prompts (for stats & charts)
  const { data: allData } = useQuery({
    queryKey: ["admin-prompts", clientId, "all"],
    queryFn: () => promptsApi.list(clientId!, { per_page: 200 }),
    enabled: !!clientId,
  });

  // Admin-configured categories (drive dropdowns, badges, filters, charts).
  const { data: categories = [] } = useQuery({
    queryKey: ["prompt-categories"],
    queryFn: () => settingsApi.getPromptCategories(),
  });
  const categoryNames = categories.map((c) => c.name);
  const colorByName = useMemo(
    () => new Map(categories.map((c) => [c.name, c.color])),
    [categories],
  );

  // Latest run → prompt cite rates
  const { data: runsList } = useQuery({
    queryKey: ["admin-runs", clientId, "prompts-latest"],
    queryFn: () => runsApi.list(clientId!, 1, 1),
    enabled: !!clientId,
  });
  const latestRun = runsList?.items[0];
  const { data: runPrompts } = useQuery({
    queryKey: ["admin-run-prompts", clientId, latestRun?.id],
    queryFn: () => runsApi.getPrompts(clientId!, latestRun!.id),
    enabled: !!clientId && !!latestRun?.id &&
      ["completed", "partial"].includes(latestRun.status),
  });

  function invalidate() { qc.invalidateQueries({ queryKey: ["admin-prompts", clientId] }); }
  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); }

  const createMut = useMutation({
    mutationFn: () => promptsApi.create(clientId!, addText, addCat),
    onSuccess: () => { invalidate(); setShowAdd(false); setAddText(""); setAddCat(""); setAddErr(null); flash("Prompt added"); },
    onError: () => setAddErr("Failed to add prompt (may already exist)"),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => promptsApi.update(clientId!, id, body),
    onSuccess: () => { invalidate(); setEditId(null); flash("Prompt updated"); },
  });
  const toggleMut = useMutation<unknown, unknown, { id: string; active: boolean }, { prev: unknown }>({
    mutationFn: ({ id, active }) => active ? promptsApi.activate(clientId!, id) : promptsApi.deactivate(clientId!, id),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: qKey });
      const prev = qc.getQueryData(qKey);
      qc.setQueryData(qKey, (old: typeof data) => old ? { ...old, items: old.items.map((p) => p.id === id ? { ...p, is_active: active } : p) } : old);
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
    if (!editId) return;
    const orig = items.find((p) => p.id === editId);
    if (!orig) return;
    const body: Record<string, unknown> = {};
    if (editText !== orig.text) body.text = editText;
    if (editCat !== orig.category) body.category = editCat;
    if (Object.keys(body).length) updateMut.mutate({ id: editId, body });
    else setEditId(null);
  }

  // ── Stats computations ────────────────────────────────────────────────────
  const allPrompts = allData?.items ?? [];
  const totalAll   = allData?.total ?? 0;
  const activeAll  = allPrompts.filter(p => p.is_active).length;

  const catCounts = categoryNames.reduce((acc, cat) => {
    acc[cat] = allPrompts.filter(p => p.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  // Per-prompt cite rates from latest run
  const promptCiteRates = new Map<string, number>();
  (runPrompts ?? []).forEach(pd => {
    const cited = pd.results.filter(r => r.client_cited === true).length;
    const rate  = pd.results.length > 0 ? Math.round((cited / pd.results.length) * 100) : 0;
    promptCiteRates.set(pd.prompt_id, rate);
  });

  // Top 5 performing prompts (by cite rate)
  const topPrompts = (runPrompts ?? [])
    .map(pd => ({
      text: pd.prompt_text.length > 28 ? pd.prompt_text.slice(0, 26) + "…" : pd.prompt_text,
      rate: promptCiteRates.get(pd.prompt_id) ?? 0,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  const maxRate = topPrompts.length ? Math.max(...topPrompts.map(p => p.rate), 1) : 1;

  // Category mix for donut
  const donutData = categories
    .filter(c => (catCounts[c.name] ?? 0) > 0)
    .map(c => ({ name: c.name, value: catCounts[c.name], color: c.color }));

  const inputCls = "bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-colors";

  return (
    <div className="space-y-5">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full bg-blue-500" /><p className="text-xs text-gray-500 font-medium">Prompts total</p></div>
          <p className="text-2xl font-bold text-gray-900">{totalAll}</p>
          <p className="text-xs text-gray-400 mt-1">{activeAll} active</p>
        </div>
        {categories.slice(0, 3).map((c) => (
          <div key={c.name} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} /><p className="text-xs text-gray-500 font-medium truncate" title={c.name}>{c.name}</p></div>
            <p className="text-2xl font-bold text-gray-900">{catCounts[c.name] ?? 0}</p>
            <p className="text-xs text-gray-400 mt-1">{totalAll > 0 ? Math.round(((catCounts[c.name] ?? 0) / totalAll) * 100) : 0}% of library</p>
          </div>
        ))}
      </div>

      {/* ── Top performing + Category mix ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* Top performing prompts */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Top performing prompts</p>
          <p className="text-xs text-gray-400 mb-5">Citation rate over last 5 runs</p>
          {topPrompts.length > 0 ? (
            <div className="space-y-3.5">
              {topPrompts.map(({ text, rate }) => (
                <div key={text} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-44 shrink-0 truncate" title={text}>{text}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(rate / maxRate) * 100}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-9 text-right shrink-0">{rate}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-sm text-gray-400">
              {latestRun ? "Loading citation data…" : "Run the engine to see top prompts"}
            </div>
          )}
        </div>

        {/* Category mix donut */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Category mix</p>
          <p className="text-xs text-gray-400 mb-4"> </p>
          {donutData.length > 0 ? (
            <div className="flex items-center gap-5">
              <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
                <PieChart width={140} height={140}>
                  <Pie data={donutData} cx={66} cy={66} innerRadius={48} outerRadius={66}
                    dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                    {donutData.map((_, i) => <Cell key={i} fill={donutData[i].color} />)}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold text-gray-900">{totalAll}</span>
                  <span className="text-[10px] text-gray-400">prompts</span>
                </div>
              </div>
              <div className="space-y-2">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-gray-600 text-xs capitalize w-24">{d.name}</span>
                    <span className="text-xs font-semibold text-gray-900">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-sm text-gray-400">No prompts yet</div>
          )}
        </div>
      </div>

      {/* ── Prompt library header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">Prompt library</p>
          <span className="text-xs text-gray-400">{totalAll} prompts · {activeAll} active</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowJsonUpload((v) => !v); setShowAdd(false); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload JSON
          </button>
          <button
            onClick={() => { setShowAdd((v) => !v); setShowJsonUpload(false); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold transition-colors"
          >
            <AddRoundedIcon style={{ fontSize: 18 }} />
            Add prompt
          </button>
        </div>
      </div>

      {showJsonUpload && clientId && (
        <JsonUploader clientId={clientId} categories={categories} onClose={() => setShowJsonUpload(false)} onSuccess={(msg) => { setShowJsonUpload(false); flash(msg); }} />
      )}
      {successMsg && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{successMsg}</div>
      )}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Add Prompt</h3>
          <textarea rows={2} value={addText} onChange={(e) => setAddText(e.target.value)}
            placeholder="Enter prompt text (10–500 chars)…"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 resize-none"
          />
          <p className="text-xs text-gray-400 text-right">{addText.length}/500</p>
          <select value={addCat} onChange={(e) => setAddCat(e.target.value)} className={inputCls}>
            <option value="">No category</option>
            {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {addErr && <p className="text-xs text-red-500">{addErr}</p>}
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate()} disabled={addText.length < 10 || createMut.isPending}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg disabled:bg-gray-100 disabled:text-gray-400 transition-colors">
              {createMut.isPending ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddErr(null); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Filter row ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <input type="text" placeholder="Search prompts…" value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 w-52"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
        {/* Category filter */}
        <select
          value={filterCat}
          onChange={(e) => { setFilterCat(e.target.value); setPage(1); }}
          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:border-blue-400 transition-colors"
        >
          <option value="">All categories</option>
          {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* Active/All pills */}
        <div className="flex items-center gap-0 border border-gray-200 rounded-lg overflow-hidden bg-white">
          {[{ label: "Active", val: "true" as const }, { label: "Inactive", val: "false" as const }, { label: "All", val: "" as const }].map(({ label, val }, i) => (
            <button key={val}
              onClick={() => { setFilterActive(val); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? "border-l border-gray-200" : ""} ${filterActive === val ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isFetching && <div className="h-0.5 bg-blue-500 animate-pulse" />}
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">No prompts found.</p>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-semibold">Prompt</th>
                    <th className="text-left px-4 py-3 w-36 font-semibold">Category</th>
                    <th className="text-left px-4 py-3 w-48 font-semibold">Cite Rate</th>
                    <th className="text-left px-4 py-3 w-20 font-semibold">Active</th>
                    <th className="text-left px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const isEditing = editId === p.id;
                    const citeRate  = promptCiteRates.get(p.id);
                    return (
                      <tr key={p.id} className={`border-b border-gray-100 last:border-0 transition-colors ${!p.is_active ? "opacity-50" : "hover:bg-gray-50"}`}>
                        <td className="px-5 py-3.5 max-w-sm">
                          {isEditing ? (
                            <textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-400 resize-none" />
                          ) : (
                            <span className="text-gray-700 leading-snug">{p.text.length > 80 ? p.text.slice(0, 78) + "…" : p.text}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {isEditing ? (
                            <select value={editCat} onChange={(e) => setEditCat(e.target.value)}
                              className="bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-blue-400">
                              <option value="">No category</option>
                              {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : (
                            <CategoryBadge category={p.category} colorByName={colorByName} />
                          )}
                        </td>
                        {/* Cite Rate + bar */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 w-9 shrink-0">
                              {citeRate != null ? `${citeRate}%` : "—"}
                            </span>
                            {citeRate != null && (
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[100px]">
                                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(citeRate, 100)}%` }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <button onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${p.is_active ? "bg-blue-600" : "bg-gray-300"}`}>
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${p.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3.5">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button onClick={saveEdit} className="text-xs font-medium text-blue-600 hover:text-blue-800">Save</button>
                              <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => startEdit(p)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-gray-100">
              {items.map((p) => {
                const isEditing = editId === p.id;
                const citeRate  = promptCiteRates.get(p.id);
                return (
                  <div key={p.id} className={`px-4 py-3.5 space-y-2 ${!p.is_active ? "opacity-50" : ""}`}>
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-400 resize-none" />
                        <select value={editCat} onChange={(e) => setEditCat(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-400">
                          <option value="">No category</option>
                          {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} className="text-xs font-medium text-blue-600 hover:text-blue-800">Save</button>
                          <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-700 leading-snug">{p.text.length > 100 ? p.text.slice(0, 100) + "…" : p.text}</p>
                        <div className="flex items-center gap-3">
                          <CategoryBadge category={p.category} colorByName={colorByName} />
                          {citeRate != null && <span className="text-xs font-semibold text-gray-700">{citeRate}%</span>}
                          <button onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${p.is_active ? "bg-blue-600" : "bg-gray-300"}`}>
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${p.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                          <button onClick={() => startEdit(p)} className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
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
          <div className="px-5 py-3 flex items-center justify-between border-t border-gray-100">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="disabled:opacity-40 hover:text-gray-900 text-gray-500 transition-colors px-2 py-1 rounded hover:bg-gray-100 text-sm">← Prev</button>
            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="disabled:opacity-40 hover:text-gray-900 text-gray-500 transition-colors px-2 py-1 rounded hover:bg-gray-100 text-sm">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
