import { useState } from "react";
import type { CompetitorStats, Platform, PlatformStats, RunSummaryResponse } from "../lib/types";

const PLATFORM_META: Record<Platform, { label: string; border: string; dot: string; bar: string }> = {
  perplexity: { label: "Perplexity", border: "border-purple-500/30", dot: "bg-purple-400", bar: "bg-purple-400" },
  openai:     { label: "OpenAI",     border: "border-emerald-500/30", dot: "bg-emerald-400", bar: "bg-emerald-400" },
  anthropic:  { label: "Anthropic",  border: "border-orange-500/30", dot: "bg-orange-400", bar: "bg-orange-400" },
  gemini:     { label: "Gemini",     border: "border-blue-500/30",   dot: "bg-blue-400",   bar: "bg-blue-400"   },
};

function pct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function PlatformCard({ stats }: { stats: PlatformStats }) {
  const meta = PLATFORM_META[stats.platform] ?? {
    label: stats.platform, border: "border-gray-500/30", dot: "bg-gray-400", bar: "bg-gray-400",
  };
  const breakdown = stats.prominence_breakdown;
  const total = stats.total_responses;
  const citePct = Math.round(stats.citation_rate * 100);

  return (
    <div className={`bg-white dark:bg-gray-900 border ${meta.border} rounded-xl p-4 sm:p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${meta.dot} shrink-0`} />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{meta.label}</span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">{stats.cited_count}/{total}</span>
      </div>

      {/* Citation rate ring-like display */}
      <div className="flex items-end gap-2">
        <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white leading-none">{citePct}%</p>
        <p className="text-xs text-gray-400 mb-1">cited</p>
      </div>

      {total > 0 && (
        <div className="space-y-2">
          {(["primary", "secondary", "mentioned", "not_cited"] as const).map((key) => {
            const count = breakdown[key] ?? 0;
            const w = Math.round((count / total) * 100);
            if (count === 0) return null;
            return (
              <div key={key} className="space-y-0.5">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="capitalize">{key.replace("_", " ")}</span>
                  <span>{count}</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                  <div className={`${meta.bar} opacity-70 h-1.5 rounded-full transition-all`} style={{ width: `${w}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompetitorTable({ stats }: { stats: CompetitorStats[] }) {
  const [showAll, setShowAll] = useState(false);
  if (stats.length === 0) return null;

  const maxVoice = Math.max(...stats.map((s) => s.share_of_voice), 0.01);
  const visible = showAll ? stats : stats.slice(0, 5);
  const hidden = stats.length - 5;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 sm:p-5">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
        Competitor Share of Voice
      </h3>
      <div className="space-y-3">
        {visible.map((c) => (
          <div key={c.brand}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-800 dark:text-gray-200 font-medium truncate mr-2">{c.brand}</span>
              <span className="text-gray-500 dark:text-gray-400 shrink-0 font-mono text-xs">
                {pct(c.share_of_voice)} · {c.cited_count}
              </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
              <div
                className="bg-red-400/70 h-1.5 rounded-full"
                style={{ width: `${Math.round((c.share_of_voice / maxVoice) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {stats.length > 5 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 w-full text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
        >
          {showAll ? "Show less ▲" : `Show ${hidden} more ▼`}
        </button>
      )}
    </div>
  );
}

export function SummaryCards({ summary }: { summary: RunSummaryResponse }) {
  const overallPct = Math.round(summary.overall_citation_rate * 100);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top row: overall citation + competitor table */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Overall citation rate */}
        <div className="bg-white dark:bg-gray-900 border border-indigo-500/30 rounded-xl p-4 sm:p-5 flex sm:flex-col items-center sm:items-start gap-4 sm:gap-2">
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 sm:mx-auto">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor"
                strokeWidth="3" className="text-gray-100 dark:text-gray-800" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor"
                strokeWidth="3" strokeDasharray={`${overallPct} ${100 - overallPct}`}
                strokeLinecap="round" className="text-indigo-500 transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">{overallPct}%</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Overall Citation Rate</p>
            <p className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white sm:mt-1">{pct(summary.overall_citation_rate)}</p>
            <p className="text-xs text-gray-400 mt-1">across {summary.total_analyses} responses</p>
          </div>
        </div>

        {/* Competitor table spans 2 cols */}
        <div className="sm:col-span-2">
          <CompetitorTable stats={summary.competitor_stats} />
        </div>
      </div>

      {/* Platform cards */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          By Platform
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {summary.platform_stats.map((stats) => (
            <PlatformCard key={stats.platform} stats={stats} />
          ))}
        </div>
      </div>
    </div>
  );
}
