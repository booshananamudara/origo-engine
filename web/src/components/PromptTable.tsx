import { useState } from "react"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import type { Platform, PromptAnalysisItem, PromptDetail } from "@/lib/types"
import { PlatformIcon } from "@/components/platform-icon"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const PLATFORM_DOTS: Record<Platform, string> = {
  perplexity: "bg-purple-400",
  openai:     "bg-emerald-400",
  anthropic:  "bg-amber-500",
  gemini:     "bg-blue-400",
}

const PROMINENCE_CLASS: Record<string, string> = {
  primary:   "bg-primary/15 text-primary border-primary/30",
  secondary: "bg-muted text-muted-foreground border-border",
  mentioned: "bg-muted text-muted-foreground border-border",
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive:  "text-emerald-600 dark:text-emerald-400",
  neutral:   "text-muted-foreground",
  negative:  "text-red-600 dark:text-red-400",
  not_cited: "text-muted-foreground/50",
}

function PlatformResult({ item }: { item: PromptAnalysisItem }) {
  const [showFull, setShowFull] = useState(false)
  const truncated = item.raw_response.length > 280 && !showFull
  const displayText = truncated ? item.raw_response.slice(0, 280) + "…" : item.raw_response

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
        <PlatformIcon platform={item.platform} size="sm" />
        <span className="text-xs font-semibold capitalize">{item.platform}</span>
        {item.model_used && (
          <span className="text-xs text-muted-foreground truncate">{item.model_used}</span>
        )}
        {item.latency_ms != null && (
          <span className="ml-auto text-xs text-muted-foreground shrink-0">{item.latency_ms}ms</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x">
        <div className="p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Response</p>
          <p className="text-xs text-foreground/70 leading-relaxed">
            {displayText}
            {item.raw_response.length > 280 && (
              <button
                onClick={() => setShowFull(!showFull)}
                className="ml-1 inline-flex items-center text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded px-1.5 py-0.5 transition-colors"
              >
                {showFull ? "show less" : "show more"}
              </button>
            )}
          </p>
        </div>

        <div className="p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Analysis</p>
          {item.client_cited == null ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              Analyzing…
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap gap-1.5">
                <span className={cn(
                  "px-2 py-0.5 rounded-full font-semibold border text-xs",
                  item.client_cited
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border",
                )}>
                  {item.client_cited ? "✓ Cited" : "Not cited"}
                </span>
                {item.client_prominence && item.client_prominence !== "not_cited" && (
                  <span className={cn(
                    "px-2 py-0.5 rounded-full capitalize border text-xs",
                    PROMINENCE_CLASS[item.client_prominence] ?? "bg-muted text-muted-foreground border-border",
                  )}>
                    {item.client_prominence}
                  </span>
                )}
                {item.citation_opportunity && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {item.citation_opportunity} opp.
                  </Badge>
                )}
              </div>

              {item.client_sentiment && item.client_sentiment !== "not_cited" && (
                <p className={cn("capitalize font-medium", SENTIMENT_COLOR[item.client_sentiment])}>
                  {item.client_sentiment} sentiment
                </p>
              )}

              {item.client_characterization && (
                <p className="text-muted-foreground italic leading-relaxed">
                  "{item.client_characterization}"
                </p>
              )}

              {item.reasoning && (
                <p className="text-muted-foreground/70 leading-relaxed border-l-2 border-border pl-2">
                  {item.reasoning}
                </p>
              )}

              {item.competitors_cited.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1">Competitors cited:</p>
                  <div className="flex flex-wrap gap-1">
                    {item.competitors_cited.map((c, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-destructive/10 text-destructive rounded text-[10px] border border-destructive/20">
                        {c.brand}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {item.content_gaps.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1">Gaps:</p>
                  <ul className="space-y-0.5">
                    {item.content_gaps.slice(0, 2).map((gap, i) => (
                      <li key={i} className="text-muted-foreground/70">· {gap}</li>
                    ))}
                    {item.content_gaps.length > 2 && (
                      <li className="text-muted-foreground/50">+{item.content_gaps.length - 2} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PromptRow({ detail }: { detail: PromptDetail }) {
  const [expanded, setExpanded] = useState(false)
  const citedCount = detail.results.filter((r) => r.client_cited).length
  const total = detail.results.length
  const allCited = citedCount === total
  const noneCited = citedCount === 0

  return (
    <Card className="overflow-hidden hover:shadow-sm transition-shadow">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground/60 shrink-0 transition-transform" />
          : <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground/40 shrink-0 transition-transform" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug">{detail.prompt_text}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {detail.category}
            </Badge>
            <span className={cn("text-xs font-medium",
              allCited ? "text-emerald-600 dark:text-emerald-400"
              : noneCited ? "text-muted-foreground"
              : "text-amber-600 dark:text-amber-400"
            )}>
              {citedCount}/{total} cited
            </span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0 mt-0.5">
          {detail.results.map((r) => (
            <span
              key={r.platform}
              title={`${r.platform}: ${r.client_cited == null ? "pending" : r.client_cited ? "cited" : "not cited"}`}
              className={cn(
                "h-2.5 w-2.5 rounded-full border-2",
                r.client_cited == null
                  ? "bg-muted border-muted"
                  : r.client_cited
                  ? cn(PLATFORM_DOTS[r.platform] ?? "bg-primary", "border-transparent")
                  : "bg-transparent border-muted-foreground/30",
              )}
            />
          ))}
        </div>
      </button>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-4 border-t space-y-3 bg-muted/20">
          <div className="pt-3 space-y-3">
            {detail.results.map((item) => (
              <PlatformResult key={item.response_id} item={item} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export function PromptTable({ prompts }: { prompts: PromptDetail[] }) {
  const [filter, setFilter] = useState<"all" | "cited" | "not_cited">("all")

  const filtered = prompts.filter((p) => {
    if (filter === "cited") return p.results.some((r) => r.client_cited)
    if (filter === "not_cited") return p.results.every((r) => !r.client_cited)
    return true
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Prompt Drill-Down
        </h2>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {(["all", "cited", "not_cited"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                filter === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
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
          <p className="text-center py-8 text-sm text-muted-foreground">No prompts match this filter.</p>
        )}
      </div>
    </div>
  )
}
