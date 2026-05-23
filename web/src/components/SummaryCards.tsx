import { useState } from "react"
import type { CompetitorStats, Platform, PlatformStats, RunSummaryResponse } from "@/lib/types"
import { PlatformIcon } from "@/components/platform-icon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function pct(rate: number) {
  return `${Math.round(rate * 100)}%`
}

const PLATFORM_BARS: Record<Platform, string> = {
  perplexity: "bg-purple-500",
  openai:     "bg-emerald-500",
  anthropic:  "bg-amber-500",
  gemini:     "bg-blue-500",
}

function PlatformCard({ stats }: { stats: PlatformStats }) {
  const barColor = PLATFORM_BARS[stats.platform] ?? "bg-primary"
  const breakdown = stats.prominence_breakdown
  const total = stats.total_responses
  const citePct = Math.round(stats.citation_rate * 100)

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <PlatformIcon platform={stats.platform} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold capitalize">{stats.platform}</p>
              {stats.model_used && (
                <p className="text-[11px] text-muted-foreground truncate">{stats.model_used}</p>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{stats.cited_count}/{total}</span>
        </div>

        <div className="flex items-end gap-2">
          <p className="text-3xl sm:text-4xl font-bold leading-none tabular-nums">{citePct}%</p>
          <p className="text-xs text-muted-foreground mb-1">cited</p>
        </div>

        {total > 0 && (
          <div className="space-y-2">
            {(["primary", "secondary", "mentioned", "not_cited"] as const).map((key) => {
              const count = breakdown[key] ?? 0
              const w = Math.round((count / total) * 100)
              if (count === 0) return null
              return (
                <div key={key} className="space-y-0.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="capitalize">{key.replace("_", " ")}</span>
                    <span>{count}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={cn(barColor, "opacity-70 h-1.5 rounded-full transition-all")}
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CompetitorTable({ stats }: { stats: CompetitorStats[] }) {
  const [showAll, setShowAll] = useState(false)
  if (stats.length === 0) return null

  const maxVoice = Math.max(...stats.map((s) => s.share_of_voice), 0.01)
  const visible = showAll ? stats : stats.slice(0, 5)
  const hidden = stats.length - 5

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Competitor Share of Voice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visible.map((c) => (
          <div key={c.brand}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium truncate mr-2">{c.brand}</span>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {pct(c.share_of_voice)} · {c.cited_count}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-red-400/70 h-1.5 rounded-full"
                style={{ width: `${Math.round((c.share_of_voice / maxVoice) * 100)}%` }}
              />
            </div>
          </div>
        ))}

        {stats.length > 5 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
            className="w-full text-xs text-primary"
          >
            {showAll ? "Show less ▲" : `Show ${hidden} more ▼`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function SummaryCards({ summary }: { summary: RunSummaryResponse }) {
  const overallPct = Math.round(summary.overall_citation_rate * 100)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top row: overall citation + competitor table */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-primary/30">
          <CardContent className="p-4 sm:p-5 flex sm:flex-col items-center sm:items-start gap-4 sm:gap-2">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 sm:mx-auto">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor"
                  strokeWidth="3" className="text-muted" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeDasharray={`${overallPct} ${100 - overallPct}`}
                  strokeLinecap="round" className="text-primary transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm sm:text-base font-bold tabular-nums">{overallPct}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Overall Citation Rate</p>
              <p className="text-2xl sm:text-4xl font-bold sm:mt-1 tabular-nums">{pct(summary.overall_citation_rate)}</p>
              <p className="text-xs text-muted-foreground mt-1">across {summary.total_analyses} responses</p>
            </div>
          </CardContent>
        </Card>

        <div className="sm:col-span-2">
          <CompetitorTable stats={summary.competitor_stats} />
        </div>
      </div>

      {/* Platform cards */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          By Platform
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {summary.platform_stats.map((stats) => (
            <PlatformCard key={stats.platform} stats={stats} />
          ))}
        </div>
      </div>
    </div>
  )
}
