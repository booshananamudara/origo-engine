import { useState } from "react";
import type { Platform, PromptAnalysisItem, PromptDetail } from "../lib/types";

const PLATFORM_LABEL: Record<Platform, string> = {
  perplexity: "Perplexity",
  openai:     "OpenAI",
  anthropic:  "Anthropic",
  gemini:     "Gemini",
};

const PLATFORM_DOT: Record<Platform, string> = {
  perplexity: "bg-purple-400",
  openai:     "bg-green-400",
  anthropic:  "bg-orange-400",
  gemini:     "bg-blue-400",
};

const OPP_PILL: Record<string, string> = {
  high:   "bg-green-500/20 text-green-600 dark:text-green-300",
  medium: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-300",
  low:    "bg-red-500/20 text-red-600 dark:text-red-300",
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "text-green-600 dark:text-green-400",
  neutral:  "text-gray-500",
  negative: "text-red-600 dark:text-red-400",
  not_cited:"text-gray-400 dark:text-gray-600",
};

function PlatformResult({ item }: { item: PromptAnalysisItem }) {
  const [showFull, setShowFull] = useState(false);
  const truncated = item.raw_response.length > 300 && !showFull;
  const displayText = truncated ? item.raw_response.slice(0, 300) + "…" : item.raw_response;

  return (
    <div className="grid grid-cols-2 gap-4 py-4 border-b border-gray-100 dark:border-gray-800/60 last:border-0">
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2 h-2 rounded-full ${PLATFORM_DOT[item.platform] ?? "bg-gray-400"}`} />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {PLATFORM_LABEL[item.platform] ?? item.platform}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-600">{item.model_used}</span>
          {item.latency_ms != null && (
            <span className="text-xs text-gray-400 dark:text-gray-600">{item.latency_ms}ms</span>
          )}
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
          {displayText}
          {item.raw_response.length > 300 && (
            <button onClick={() => setShowFull(!showFull)} className="ml-1 text-indigo-500 hover:text-indigo-400">
              {showFull ? "show less" : "show more"}
            </button>
          )}
        </p>
      </div>

      <div className="space-y-2 text-xs">
        {item.client_cited == null ? (
          <p className="text-gray-400 dark:text-gray-600 italic">Analysis pending…</p>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-semibold ${
                item.client_cited ? "bg-green-500/20 text-green-600 dark:text-green-300" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              }`}>
                {item.client_cited ? "Cited" : "Not cited"}
              </span>
              {item.client_prominence && item.client_prominence !== "not_cited" && (
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300 capitalize">
                  {item.client_prominence}
                </span>
              )}
              {item.citation_opportunity && (
                <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${OPP_PILL[item.citation_opportunity] ?? ""}`}>
                  {item.citation_opportunity} opportunity
                </span>
              )}
            </div>

            {item.client_characterization && (
              <p className="text-gray-600 dark:text-gray-300 italic">"{item.client_characterization}"</p>
            )}

            {item.client_sentiment && item.client_sentiment !== "not_cited" && (
              <p className={`${SENTIMENT_COLOR[item.client_sentiment]} capitalize`}>
                Sentiment: {item.client_sentiment}
              </p>
            )}

            {item.reasoning && (
              <p className="text-gray-500 leading-relaxed">{item.reasoning}</p>
            )}

            {item.competitors_cited.length > 0 && (
              <div>
                <p className="text-gray-500 mb-1">Competitors cited:</p>
                <div className="flex flex-wrap gap-1">
                  {item.competitors_cited.map((c, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400">
                      {c.brand}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {item.content_gaps.length > 0 && (
              <div>
                <p className="text-gray-500 mb-1">Content gaps:</p>
                <ul className="space-y-0.5">
                  {item.content_gaps.slice(0, 3).map((gap, i) => (
                    <li key={i} className="text-gray-500">· {gap}</li>
                  ))}
                  {item.content_gaps.length > 3 && (
                    <li className="text-gray-400 dark:text-gray-600">+{item.content_gaps.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PromptRow({ detail }: { detail: PromptDetail }) {
  const [expanded, setExpanded] = useState(false);
  const citedCount = detail.results.filter((r) => r.client_cited).length;
  const total = detail.results.length;

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <span className="mt-0.5 text-gray-400 dark:text-gray-500 text-xs font-mono select-none">
          {expanded ? "▼" : "▶"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{detail.prompt_text}</p>
          <p className="text-xs text-gray-500 mt-1 capitalize">{detail.category}</p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{citedCount}/{total} cited</span>
          <div className="flex gap-1">
            {detail.results.map((r) => (
              <span
                key={r.platform}
                className={`w-2 h-2 rounded-full ${
                  r.client_cited == null ? "bg-gray-300 dark:bg-gray-700"
                    : r.client_cited ? "bg-green-400" : "bg-gray-300 dark:bg-gray-600"
                }`}
                title={`${PLATFORM_LABEL[r.platform] ?? r.platform}: ${
                  r.client_cited == null ? "pending" : r.client_cited ? "cited" : "not cited"
                }`}
              />
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 px-6 py-2">
          <div className="grid grid-cols-2 gap-4 py-2 text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800/60">
            <span className="font-medium uppercase tracking-wider">Platform Response</span>
            <span className="font-medium uppercase tracking-wider">Analysis</span>
          </div>
          {detail.results.map((item) => (
            <PlatformResult key={item.response_id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PromptTable({ prompts }: { prompts: PromptDetail[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
        Prompt Drill-Down
      </h2>
      {prompts.map((p) => (
        <PromptRow key={p.prompt_id} detail={p} />
      ))}
    </div>
  );
}
