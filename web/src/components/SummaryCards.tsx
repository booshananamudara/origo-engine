import { useEffect, useState } from "react"
import type { CompetitorStats, Platform, PlatformStats, RunSummaryResponse } from "@/lib/types"
import { PlatformIcon } from "@/components/platform-icon"
import { BorderBeam } from "@/components/magicui/border-beam"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

function pct(rate: number) {
  return `${Math.round(rate * 100)}%`
}

const PLATFORM_COLORS: Record<Platform, { bar: string; beam: { from: string; to: string } }> = {
  perplexity: { bar: "bg-purple-500",  beam: { from: "#a855f7", to: "#7c3aed" } },
  openai:     { bar: "bg-emerald-500", beam: { from: "#10b981", to: "#059669" } },
  anthropic:  { bar: "bg-amber-500",   beam: { from: "#f59e0b", to: "#d97706" } },
  gemini:     { bar: "bg-blue-500",    beam: { from: "#3b82f6", to: "#2563eb" } },
}

function AnimatedBar({ width, className }: { width: number; className: string }) {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(width), 60)
    return () => clearTimeout(t)
  }, [width])

  return (
    <div className="w-full bg-muted rounded-full h-1.5">
      <div
        className={cn(className, "opacity-80 h-1.5 rounded-full transition-[width] duration-700 ease-out")}
        style={{ width: `${animated}%` }}
      />
    </div>
  )
}

function PlatformCard({ stats }: { stats: PlatformStats }) {
  const colors = PLATFORM_COLORS[stats.platform] ?? { bar: "bg-primary", beam: { from: "#4A90D9", to: "#10B981" } }
  const breakdown = stats.prominence_breakdown
  const total = stats.total_responses
  const citePct = Math.round(stats.citation_rate * 100)
  const [accordionOpen, setAccordionOpen] = useState<string>("")

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-3">
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
          <Accordion
            type="single"
            collapsible
            value={accordionOpen}
            onValueChange={setAccordionOpen}
          >
            <AccordionItem value="breakdown" className="border-0">
              <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:text-foreground hover:no-underline">
                Breakdown
              </AccordionTrigger>
              <AccordionContent className="pt-1">
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
                        <AnimatedBar
                          width={accordionOpen === "breakdown" ? w : 0}
                          className={colors.bar}
                        />
                      </div>
                    )
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
      <BorderBeam
        colorFrom={colors.beam.from}
        colorTo={colors.beam.to}
        duration={20}
        borderWidth={1}
      />
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
        {visible.map((c) => {
          const w = Math.round((c.share_of_voice / maxVoice) * 100)
          return (
            <div key={c.brand}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium truncate mr-2">{c.brand}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">
                  {pct(c.share_of_voice)} · {c.cited_count}
                </span>
              </div>
              <AnimatedBar width={w} className="bg-red-400" />
            </div>
          )
        })}

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="relative overflow-hidden border-primary/30">
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
          <BorderBeam colorFrom="#4A90D9" colorTo="#10B981" duration={18} borderWidth={1} />
        </Card>

        <div className="sm:col-span-2">
          <CompetitorTable stats={summary.competitor_stats} />
        </div>
      </div>

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
