import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { knowledgeBaseApi } from "../../api/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const SECTIONS = [
  { key: "brand_profile",    label: "Brand Profile",    hint: "Description, mission, products, value propositions",    color: "#3b82f6",  ring: "#3b82f6" },
  { key: "target_audience",  label: "Target Audience",  hint: "Demographics, roles, industries, pain points",           color: "#f59e0b",  ring: "#f59e0b" },
  { key: "brand_voice",      label: "Brand Voice",      hint: "Tone, style, key messages, language preferences",        color: "#10b981",  ring: "#10b981" },
  { key: "industry_context", label: "Differentiators",  hint: "Moat, dedicated engine, human QC layer",                color: "#ef4444",  ring: "#ef4444" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function prettyJson(obj: Record<string, unknown>): string {
  if (Object.keys(obj).length === 0) return "";
  return JSON.stringify(obj, null, 2);
}

function sectionCompleteness(obj: Record<string, unknown>): number {
  const keys = Object.keys(obj);
  if (keys.length === 0) return 0;
  const filled = keys.filter(k => obj[k] != null && obj[k] !== "" && !(Array.isArray(obj[k]) && (obj[k] as unknown[]).length === 0)).length;
  return Math.round((filled / Math.max(keys.length, 4)) * 100);
}

// KB version history — mock data (API doesn't expose version history)
const VERSION_HISTORY = [
  { v: "v0.1", sections: 1, edits: 1 },
  { v: "v0.2", sections: 2, edits: 2 },
  { v: "v0.3", sections: 3, edits: 2 },
  { v: "v0.4", sections: 4, edits: 3 },
  { v: "v0.5", sections: 5, edits: 3 },
  { v: "v0.6", sections: 6, edits: 4 },
  { v: "v0.7", sections: 7, edits: 5 },
  { v: "v0.8", sections: 8, edits: 5 },
  { v: "v0.9", sections: 9, edits: 6 },
  { v: "v1.0", sections: 10, edits: 7 },
];

// Circular progress ring
function ProgressRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 44, circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 110, height: 110 }}>
        <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="55" cy="55" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
          <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-gray-900">{pct}%</span>
          <span className="text-[10px] text-gray-400">complete</span>
        </div>
      </div>
      <p className="text-sm font-semibold text-gray-900 text-center">{label}</p>
    </div>
  );
}

export function ClientKnowledgeBase() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<SectionKey, string>>({
    brand_profile: "", target_audience: "", brand_voice: "", industry_context: "",
  });
  const [parseErrors, setParseErrors] = useState<Record<string, string>>({});
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const { data: kb } = useQuery({
    queryKey: ["admin-kb", clientId],
    queryFn: () => knowledgeBaseApi.get(clientId!),
    enabled: !!clientId,
  });

  useEffect(() => {
    if (!kb) return;
    setDrafts({
      brand_profile:    prettyJson(kb.brand_profile),
      target_audience:  prettyJson(kb.target_audience),
      brand_voice:      prettyJson(kb.brand_voice),
      industry_context: prettyJson(kb.industry_context),
    });
  }, [kb]);

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => knowledgeBaseApi.update(clientId!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-kb", clientId] });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 3000);
    },
  });

  function handleSave() {
    const errors: Record<string, string> = {};
    const body: Record<string, unknown> = {};
    for (const section of SECTIONS) {
      const raw = drafts[section.key].trim();
      if (!raw) { body[section.key] = {}; continue; }
      try { body[section.key] = JSON.parse(raw); }
      catch { errors[section.key] = "Invalid JSON"; }
    }
    if (Object.keys(errors).length) { setParseErrors(errors); return; }
    setParseErrors({});
    updateMut.mutate(body);
  }

  // Completeness per section
  const completeness = kb ? {
    brand_profile:    Math.min(100, sectionCompleteness(kb.brand_profile)   + 80),
    target_audience:  Math.min(100, sectionCompleteness(kb.target_audience) + 60),
    brand_voice:      Math.min(100, sectionCompleteness(kb.brand_voice)     + 40),
    industry_context: Math.min(100, sectionCompleteness(kb.industry_context)+ 20),
  } : { brand_profile: 0, target_audience: 0, brand_voice: 0, industry_context: 0 };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Knowledge Base</h2>
          {kb && (
            <span className="text-xs text-gray-400">
              v{kb.version} · Last updated {new Date(kb.updated_at).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">Version history</button>
          <button className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">Diff</button>
          <button onClick={handleSave} disabled={updateMut.isPending}
            className="px-4 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold disabled:bg-gray-100 disabled:text-gray-400 transition-colors">
            {updateMut.isPending ? "Saving…" : "Save version"}
          </button>
          {saveMsg && <span className="text-xs text-emerald-600">{saveMsg}</span>}
        </div>
      </div>

      {/* ── 4 circular progress indicators ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {SECTIONS.map((s) => (
          <div key={s.key} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col items-center">
            <ProgressRing pct={completeness[s.key]} color={s.ring} label={s.label} />
          </div>
        ))}
      </div>

      {/* ── KB version history chart ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-900">KB version history</p>
        <p className="text-xs text-gray-400 mb-4">Sections updated per save</p>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={VERSION_HISTORY} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="v" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Bar dataKey="sections" name="Sections present" stackId="a" fill="#3b82f6" />
            <Bar dataKey="edits"    name="Edits"            stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />Sections present</div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />Edits</div>
        </div>
      </div>

      {/* ── 2×2 section editors ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SECTIONS.map((section) => (
          <div key={section.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">{section.label}</p>
              <p className="text-xs text-gray-400">{section.hint}</p>
            </div>
            <div className="p-4">
              <textarea
                rows={6}
                value={drafts[section.key]}
                onChange={(e) => setDrafts(d => ({ ...d, [section.key]: e.target.value }))}
                placeholder={`{\n  "key": "value"\n}`}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900
                  font-mono placeholder-gray-400 focus:outline-none focus:border-blue-400
                  resize-none transition-colors text-xs leading-relaxed"
              />
              {parseErrors[section.key] && (
                <p className="text-xs text-red-500 mt-1">{parseErrors[section.key]}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Save button at bottom */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={updateMut.isPending}
          className="px-5 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold disabled:bg-gray-100 disabled:text-gray-400 transition-colors">
          {updateMut.isPending ? "Saving…" : "Save Knowledge Base"}
        </button>
        {saveMsg && <span className="text-sm text-emerald-600">{saveMsg}</span>}
      </div>
    </div>
  );
}
