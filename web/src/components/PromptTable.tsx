import { useState } from "react";
import type { Platform, PromptAnalysisItem, PromptDetail } from "../lib/types";

const PLATFORM_META: Record<Platform, { label: string; dot: string; bg: string }> = {
  perplexity: { label: "Perplexity", dot: "bg-purple-400",  bg: "bg-purple-50 dark:bg-purple-950/30" },
  openai:     { label: "OpenAI",     dot: "bg-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  anthropic:  { label: "Anthropic",  dot: "bg-orange-400",  bg: "bg-orange-50 dark:bg-orange-950/30" },
  gemini:     { label: "Gemini",     dot: "bg-blue-400",    bg: "bg-blue-50 dark:bg-blue-950/30" },
};

const OPP_PILL: Record<string, string> = {
  high:   "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
  low:    "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30",
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive:  "text-green-600 dark:text-green-400",
  neutral:   "text-gray-500",
  negative:  "text-red-600 dark:text-red-400",
  not_cited: "text-gray-400 dark:text-gray-600",
};

const PROMINENCE_PILL: Record<string, string> = {
  primary:   "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
  secondary: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
  mentioned: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
};

function PlatformResult({ item }: { item: PromptAnalysisItem }) {
  const [showFull, setShowFull] = useState(false);
  const meta = PLATFORM_META[item.platform] ?? { label: item.platform, dot: "bg-gray-400", bg: "bg-gray-50 dark:bg-gray-900" };
  const truncated = item.raw_response.length > 280 && !showFull;
  const displayText = truncated ? item.raw_response.slice(0, 280) + "…" : item.raw_response;

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      {/* Platform header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${meta.bg} border-b border-gray-100 dark:border-gray-800`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{meta.label}</span>
        {item.model_used && (
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.model_used}</span>
        )}
        {item.latency_ms != null && (
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0">{item.latency_ms}ms</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-800">
        {/* Response */}
        <div className="p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Response</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {displayText}
            {item.raw_response.length > 280 && (
              <button
                onClick={() => setShowFull(!showFull)}
                className="ml-1 text-indigo-500 hover:text-indigo-400 font-medium"
              >
                {showFull ? "show less" : "more"}
              </button>
            )}
          </p>
        </div>

        {/* Analysis */}
        <div className="p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Analysis</p>
          {item.client_cited == null ? (
            <p className="text-xs text-gray-400 dark:text-gray-600 italic">Pending…</p>
          ) : (
            <div className="space-y-2 text-xs">
              {/* Citation status */}
              <div className="flex flex-wrap gap-1.5">
                <span className={`px-2 py-0.5 rounded-full font-semibold ${
                  item.client_cited
                    ? "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                }`}>
                  {item.client_cited ? "✓ Cited" : "Not cited"}
                </span>
                {item.client_prominence && item.client_prominence !== "not_cited" && (
                  <span className={`px-2 py-0.5 rounded-full capitalize ${PROMINENCE_PILL[item.client_prominence] ?? "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                    {item.client_prominence}
                  </span>
                )}
                {item.citation_opportunity && (
                  <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${OPP_PILL[item.citation_opportunity] ?? ""}`}>
                    {item.citation_opportunity} opp.
                  </span>
                )}
              </div>

              {item.client_sentiment && item.client_sentiment !== "not_cited" && (
                <p className={`${SENTIMENT_COLOR[item.client_sentiment]} capitalize font-medium`}>
                  {item.client_sentiment} sentiment
                </p>
              )}

              {item.client_characterization && (
                <p className="text-gray-500 dark:text-gray-400 italic leading-relaxed">
                  "{item.client_characterization}"
                </p>
              )}

              {item.reasoning && (
                <p className="text-gray-500 dark:text-gray-500 leading-relaxed border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                  {item.reasoning}
                </p>
              )}

              {item.competitors_cited.length > 0 && (
                <div>
                  <p className="text-gray-400 dark:text-gray-500 mb-1">Competitors cited:</p>
                  <div className="flex flex-wrap gap-1">
                    {item.competitors_cited.map((c, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded text-[10px] border border-red-200/50 dark:border-red-900/50">
                        {c.brand}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {item.content_gaps.length > 0 && (
                <div>
                  <p className="text-gray-400 dark:text-gray-500 mb-1">Gaps:</p>
                  <ul className="space-y-0.5">
                    {item.content_gaps.slice(0, 2).map((gap, i) => (
                      <li key={i} className="text-gray-500 dark:text-gray-500">· {gap}</li>
                    ))}
                    {item.content_gaps.length > 2 && (
                      <li className="text-gray-400 dark:text-gray-600">+{item.content_gaps.length - 2} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PromptRow({ detail }: { detail: PromptDetail }) {
  const [expanded, setExpanded] = useState(false);
  const citedCount = detail.results.filter((r) => r.client_cited).length;
  const total = detail.results.length;
  const allCited = citedCount === total;
  const noneCited = citedCount === 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-sm dark:hover:shadow-none">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-left"
      >
        <span className="mt-0.5 text-gray-300 dark:text-gray-600 text-xs shrink-0">
          {expanded ? "▼" : "▶"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{detail.prompt_text}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wide font-medium">
              {detail.category}
            </span>
            <span className={`text-xs font-medium ${
              allCited ? "text-green-600 dark:text-green-400"
              : noneCited ? "text-gray-400"
              : "text-amber-600 dark:text-amber-400"
            }`}>
              {citedCount}/{total} cited
            </span>
          </div>
        </div>
        {/* Platform dots */}
        <div className="flex gap-1 shrink-0 mt-0.5">
          {detail.results.map((r) => {
            const meta = PLATFORM_META[r.platform];
            return (
              <span
                key={r.platform}
                title={`${meta?.label ?? r.platform}: ${
                  r.client_cited == null ? "pending" : r.client_cited ? "cited" : "not cited"
                }`}
                className={`w-2.5 h-2.5 rounded-full border-2 ${
                  r.client_cited == null
                    ? "bg-gray-200 dark:bg-gray-700 border-gray-200 dark:border-gray-700"
                    : r.client_cited
                    ? `${meta?.dot ?? "bg-green-400"} border-transparent`
                    : "bg-transparent border-gray-300 dark:border-gray-600"
                }`}
              />
            );
          })}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 p-3 sm:p-4 space-y-3">
          {detail.results.map((item) => (
            <PlatformResult key={item.response_id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PromptTable({ prompts }: { prompts: PromptDetail[] }) {
  const [filter, setFilter] = useState<"all" | "cited" | "not_cited">("all");

  const filtered = prompts.filter((p) => {
    if (filter === "cited") return p.results.some((r) => r.client_cited);
    if (filter === "not_cited") return p.results.every((r) => !r.client_cited);
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Prompt Drill-Down
        </h2>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(["all", "cited", "not_cited"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === f
                  ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {f === "all" ? `All (${prompts.length})` : f === "cited" ? "Cited" : "Not cited"}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map((p) => (
          <PromptRow key={p.prompt_id} detail={p} />
        ))}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">No prompts match this filter.</p>
        )}
      </div>
    </div>
  );
}
