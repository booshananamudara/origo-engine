import type { CompetitorStats, Platform, PlatformStats, RunSummaryResponse } from "../lib/types";

const PLATFORM_META: Record<Platform, { label: string; color: string; dot: string }> = {
  perplexity: { label: "Perplexity", color: "border-purple-500/40", dot: "bg-purple-400" },
  openai:     { label: "OpenAI",     color: "border-green-500/40",  dot: "bg-green-400"  },
  anthropic:  { label: "Anthropic",  color: "border-orange-500/40", dot: "bg-orange-400" },
  gemini:     { label: "Gemini",     color: "border-blue-500/40",   dot: "bg-blue-400"   },
};

const OPP_COLORS: Record<string, string> = {
  high:   "text-green-400",
  medium: "text-yellow-400",
  low:    "text-red-400",
};

function pct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function PlatformCard({ stats }: { stats: PlatformStats }) {
  const meta = PLATFORM_META[stats.platform];
  const breakdown = stats.prominence_breakdown;
  const total = stats.total_responses;

  return (
    <div className={`bg-gray-900 border ${meta.color} rounded-xl p-5 space-y-4`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
        <span className="font-semibold text-gray-200">{meta.label}</span>
      </div>

      <div>
        <p className="text-4xl font-bold text-white">{pct(stats.citation_rate)}</p>
        <p className="text-xs text-gray-400 mt-1">
          citation rate · {stats.cited_count}/{total} responses
        </p>
      </div>

      {/* Prominence breakdown bar */}
      {total > 0 && (
        <div className="space-y-1.5">
          {(["primary", "secondary", "mentioned", "not_cited"] as const).map((key) => {
            const count = breakdown[key] ?? 0;
            const w = Math.round((count / total) * 100);
            if (count === 0) return null;
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-gray-500 capitalize">
                  {key.replace("_", " ")}
                </span>
                <div className="flex-1 bg-gray-800 rounded h-1.5">
                  <div
                    className="bg-indigo-400 h-1.5 rounded"
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span className="w-6 text-right text-gray-400">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompetitorTable({ stats }: { stats: CompetitorStats[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">
        Competitor Share of Voice
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-800">
            <th className="text-left pb-2 font-medium">Brand</th>
            <th className="text-right pb-2 font-medium">Mentions</th>
            <th className="text-right pb-2 font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((c) => (
            <tr key={c.brand} className="border-b border-gray-800/50 last:border-0">
              <td className="py-2 text-gray-200">{c.brand}</td>
              <td className="py-2 text-right text-gray-400">{c.cited_count}</td>
              <td className="py-2 text-right font-mono text-gray-300">
                {pct(c.share_of_voice)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SummaryCardsProps {
  summary: RunSummaryResponse;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="space-y-6">
      {/* Overall stat */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 col-span-1">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
            Overall Citation Rate
          </p>
          <p className="text-5xl font-bold text-white">
            {pct(summary.overall_citation_rate)}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            across {summary.total_analyses} responses
          </p>
        </div>

        <div className="col-span-2">
          <CompetitorTable stats={summary.competitor_stats} />
        </div>
      </div>

      {/* Per-platform cards — grid grows automatically with platform count */}
      <div className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${summary.platform_stats.length}, minmax(0, 1fr))` }}>
        {summary.platform_stats.map((stats) => (
          <PlatformCard key={stats.platform} stats={stats} />
        ))}
      </div>
    </div>
  );
}
