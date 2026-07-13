import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { competitorsApi, runsApi } from "../../api/client";

const SOV_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];
const SOV_GRADIENTS = [
  "linear-gradient(to right, #ef4444, #fca5a5)",
  "linear-gradient(to right, #f97316, #fed7aa)",
  "linear-gradient(to right, #eab308, #fef08a)",
  "linear-gradient(to right, #22c55e, #bbf7d0)",
  "linear-gradient(to right, #3b82f6, #bfdbfe)",
];

const MOCK_SOV = [
  { name: "MuteSix",    pct: 38 },
  { name: "Hawke Media", pct: 30 },
  { name: "Avenge",     pct: 18 },
  { name: "Optimum7",   pct: 11 },
  { name: "Coalition Tech", pct: 3 },
];

export function ClientCompetitors() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();

  const [newName, setNewName] = useState("");
  const [domain, setDomain] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sovRange, setSovRange] = useState<"7d" | "30d">("7d");

  const { data: competitors = [], isLoading } = useQuery({
    queryKey: ["admin-competitors", clientId],
    queryFn: () => competitorsApi.list(clientId!),
    enabled: !!clientId,
  });

  // Fetch latest run for suggested competitors
  const { data: runsList } = useQuery({
    queryKey: ["admin-runs", clientId, "competitors-latest"],
    queryFn: () => runsApi.list(clientId!, 1, 1),
    enabled: !!clientId,
  });
  const latestRunId = runsList?.items[0]?.id;
  const { data: latestRunSummary } = useQuery({
    queryKey: ["admin-run-detail", clientId, latestRunId],
    queryFn: () => runsApi.get(clientId!, latestRunId!),
    enabled: !!clientId && !!latestRunId &&
      ["completed", "partial"].includes(runsList?.items[0]?.status ?? ""),
  });

  const suggestedCompetitors = (latestRunSummary?.competitor_stats ?? [])
    .sort((a, b) => b.cited_count - a.cited_count)
    .slice(0, 6)
    .map(c => ({ name: c.brand, count: c.cited_count }));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-competitors", clientId] });

  const createMut = useMutation({
    mutationFn: (name: string) => competitorsApi.create(clientId!, name),
    onSuccess: () => { invalidate(); setNewName(""); setDomain(""); setError(null); },
    onError: () => setError("Failed to add competitor (may already exist)"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => competitorsApi.delete(clientId!, id),
    onSuccess: () => { invalidate(); setDeleteId(null); },
  });

  const bulkMut = useMutation({
    mutationFn: (names: string[]) => competitorsApi.bulkCreate(clientId!, names),
    onSuccess: (res) => {
      invalidate(); setBulkText(""); setShowBulk(false);
      setError(`Added ${res.created}, skipped ${res.skipped} duplicates`);
      setTimeout(() => setError(null), 4000);
    },
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMut.mutate(newName.trim());
  }

  function handleBulkAdd() {
    const names = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    if (names.length) bulkMut.mutate(names);
  }

  const isLocked = competitors.length < 3;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Competitors ({competitors.length})
          </h2>
          {isLocked && (
            <span className="text-xs text-gray-400">Add at least 3 to unlock share-of-voice scoring</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(v => !v)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-blue-600 font-medium hover:bg-gray-50 transition-colors"
          >
            Bulk add
          </button>
          <button
            onClick={() => { setShowBulk(false); document.getElementById("competitor-input")?.focus(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold transition-colors"
          >
            <AddRoundedIcon style={{ fontSize: 18 }} />
            Add competitor
          </button>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Add form */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-900">Add a competitor</p>

          {/* Bulk add */}
          {showBulk ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">Competitor names (one per line)</label>
              <textarea
                rows={5} value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                placeholder={"BambooHR\nRippling\nHiBob"}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={handleBulkAdd} disabled={!bulkText.trim() || bulkMut.isPending}
                  className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold disabled:bg-gray-100 disabled:text-gray-400 transition-colors">
                  {bulkMut.isPending ? "Adding…" : "Add All"}
                </button>
                <button onClick={() => setShowBulk(false)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Competitor name</label>
                <div className="flex gap-2">
                  <input
                    id="competitor-input"
                    type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Coalition Technologies"
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
                  />
                  <button type="submit" disabled={!newName.trim() || createMut.isPending}
                    className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold disabled:bg-gray-100 disabled:text-gray-400 transition-colors">
                    Add
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Listed competitors are scored against this client on every run.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Domain (optional)</label>
                <input
                  type="text" value={domain} onChange={(e) => setDomain(e.target.value)}
                  placeholder="competitor.com"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
            </form>
          )}

          {error && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Competitors list */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {isLoading ? (
              <p className="p-4 text-sm text-gray-400">Loading…</p>
            ) : competitors.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-500 font-medium">No competitors added yet.</p>
                <p className="text-xs text-gray-400 mt-0.5">Add at least 3 to unlock share-of-voice scoring.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {competitors.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-900 font-medium">{c.name}</span>
                    {deleteId === c.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => deleteMut.mutate(c.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Confirm</button>
                        <button onClick={() => setDeleteId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteId(c.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: SOV Preview */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Preview · what you'll see</p>
              <p className="text-xs text-gray-400">Share of voice across all tracked prompts</p>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["7d", "30d"] as const).map((r) => (
                <button key={r} onClick={() => setSovRange(r)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${sovRange === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* SOV bars (always show mock, with lock overlay if < 3 competitors) */}
          <div className="relative">
            <div className={`space-y-3 ${isLocked ? "opacity-30 pointer-events-none select-none blur-[1px]" : ""}`}>
              {MOCK_SOV.map(({ name, pct }, i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-32 shrink-0 truncate">{name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: SOV_GRADIENTS[i] ?? "linear-gradient(to right, #9ca3af, #e5e7eb)" }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-9 text-right shrink-0">{pct}%</span>
                </div>
              ))}
            </div>
            {isLocked && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 text-center shadow-sm">
                  <p className="text-sm font-semibold text-gray-900">🔒 Locked</p>
                  <p className="text-xs text-gray-400 mt-0.5">Add {3 - competitors.length} competitor{3 - competitors.length !== 1 ? "s" : ""} to unlock</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Suggested competitors ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-900">Suggested competitors</p>
        <p className="text-xs text-gray-400 mb-4">Detected by engine across last 5 runs</p>
        {suggestedCompetitors.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestedCompetitors.map(({ name, count }) => (
              <button
                key={name}
                onClick={() => { setNewName(name); document.getElementById("competitor-input")?.focus(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-colors"
              >
                {name}
                <span className="text-gray-400 text-xs">· seen {count}×</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {["MuteSix · seen 14×", "Hawke Media · seen 11×", "Avenge · seen 8×", "Optimum7 · seen 6×", "Coalition Technologies · seen 4×"].map((label) => (
              <button key={label}
                onClick={() => { setNewName(label.split(" · ")[0]); document.getElementById("competitor-input")?.focus(); }}
                className="px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
