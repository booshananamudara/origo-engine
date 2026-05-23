import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Zap } from "lucide-react"
import { dashboard } from "@/lib/api"
import type { ClientCostAverages } from "@/lib/api"
import { RunProgress } from "@/components/RunProgress"
import { SummaryCards } from "@/components/SummaryCards"
import { PromptTable } from "@/components/PromptTable"
import { PlatformErrorBanner } from "@/components/PlatformErrorBanner"
import { StatCard } from "@/components/stat-card"
import { BlurFade } from "@/components/magicui/blur-fade"
import { InteractiveHoverButton } from "@/components/magicui/interactive-hover-button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardSummary, RunSummaryResponse } from "@/lib/types"
import { cn } from "@/lib/utils"

const ACTIVE = new Set(["pending", "running"])

function timeUntil(iso: string | null): string | null {
  if (!iso) return null
  const diff = new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime() - Date.now()
  if (diff <= 0) return "now"
  const m = Math.floor(diff / 60000)
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h < 24) return rem > 0 ? `in ${h}h ${rem}m` : `in ${h}h`
  return `in ${Math.floor(h / 24)}d`
}

function VisibilityScoreCard({ score, summary }: { score: number | null; summary: DashboardSummary | undefined }) {
  if (score == null) return null

  const borderColor =
    score >= 60 ? "border-l-emerald-500" :
    score >= 35 ? "border-l-amber-500" :
    "border-l-red-500"

  const scoreColor =
    score >= 60 ? "text-emerald-600 dark:text-emerald-400" :
    score >= 35 ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400"

  const rel = timeUntil(summary?.next_scheduled_run_at ?? null)
  const showNextRun = summary?.schedule_enabled && summary?.schedule_cadence !== "manual" && rel

  return (
    <Card className={cn("w-full border-l-4", borderColor)}>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Visibility Score</p>
        <div className="flex items-end gap-1">
          <span className={cn("text-4xl font-bold tabular-nums", scoreColor)}>{score.toFixed(0)}</span>
          <span className="text-lg text-muted-foreground mb-0.5">/100</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Weighted: citation 40% · primary 25% · sentiment 20% · platform coverage 15%
        </p>
        {showNextRun && (
          <div className="flex items-center gap-1.5 mt-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="text-xs text-muted-foreground">
              Next auto-run <span className="text-primary font-medium">{rel}</span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OverviewCard({
  summary,
  costSummary,
}: {
  summary: DashboardSummary | undefined
  costSummary: ClientCostAverages | undefined
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        label="Total Prompts"
        value={summary?.total_prompts ?? 0}
        animate={!!summary}
      />
      <StatCard
        label="Total Runs"
        value={summary?.total_runs ?? 0}
        animate={!!summary}
      />
      {costSummary && costSummary.total_runs > 0 && (
        <>
          <StatCard
            label="Avg Cost / Run"
            value={costSummary.avg_cost_per_run_usd ?? 0}
            prefix="$"
            decimalPlaces={3}
            animate
          />
          <StatCard
            label="Total Cost"
            value={costSummary.total_cost_all_time_usd ?? 0}
            prefix="$"
            decimalPlaces={costSummary.total_cost_all_time_usd != null && costSummary.total_cost_all_time_usd >= 1 ? 2 : 3}
            animate
          />
        </>
      )}
    </div>
  )
}

export function DashboardHome() {
  const navigate = useNavigate()
  const [runId, setRunId] = useState<string | null>(null)
  const [autoLoaded, setAutoLoaded] = useState(false)

  const { data: latestRun, isSuccess: latestFetched } = useQuery({
    queryKey: ["latest-run"],
    queryFn: dashboard.getLatestRun,
    enabled: !autoLoaded,
  })

  useEffect(() => {
    if (!latestFetched) return
    setAutoLoaded(true)
    if (latestRun?.run?.id) setRunId(latestRun.run.id)
  }, [latestFetched, latestRun?.run?.id])

  const { data: runData } = useQuery<RunSummaryResponse>({
    queryKey: ["run", runId],
    queryFn: () => dashboard.getRunDetail(runId!),
    enabled: runId != null,
    refetchInterval: (q) => {
      const s = q.state.data?.run?.status
      return s && ACTIVE.has(s) ? 2000 : false
    },
  })

  const run = runData?.run

  const { data: runPrompts } = useQuery({
    queryKey: ["run-prompts", runId],
    queryFn: () => dashboard.getRunPrompts(runId!),
    enabled: run?.status === "completed",
  })

  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: dashboard.getSummary,
    refetchInterval: 60_000,
  })

  const { data: costSummary } = useQuery<ClientCostAverages>({
    queryKey: ["cost-summary"],
    queryFn: dashboard.getCostSummary,
  })

  if (!autoLoaded) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-36 w-full" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[68px]" />)}
          </div>
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (run && ACTIVE.has(run.status)) {
    return (
      <BlurFade>
        <div className="space-y-6">
          <RunProgress run={run} />
          <p className="text-sm text-muted-foreground text-center">
            Analysis in progress — results will appear automatically when complete.
          </p>
        </div>
      </BlurFade>
    )
  }

  if (run?.status === "failed") {
    return (
      <BlurFade>
        <RunProgress run={run} />
      </BlurFade>
    )
  }

  if (run?.status === "completed" && runData) {
    return (
      <BlurFade>
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <VisibilityScoreCard score={summary?.visibility_score ?? null} summary={summary} />
            <OverviewCard summary={summary} costSummary={costSummary} />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing latest run results
            </span>
            <InteractiveHoverButton
              text="View all runs"
              onClick={() => navigate("runs")}
              className="text-xs px-3 py-1"
            />
          </div>

          {Object.keys(runData.platform_errors ?? {}).length > 0 && (
            <PlatformErrorBanner errors={runData.platform_errors} />
          )}

          <SummaryCards summary={runData} />

          {runPrompts && runPrompts.length > 0 && (
            <PromptTable prompts={runPrompts} />
          )}
        </div>
      </BlurFade>
    )
  }

  return (
    <BlurFade>
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4 px-4">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Zap className="h-8 w-8 text-primary" />
        </div>
        <div>
          <p className="text-base font-semibold">Your AI visibility monitoring is being set up</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Your first report will appear here once the initial analysis runs.
          </p>
          {summary?.schedule_enabled && summary?.schedule_cadence !== "manual" && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="text-xs text-muted-foreground">
                Next auto-run{" "}
                <span className="text-primary font-medium">
                  {timeUntil(summary.next_scheduled_run_at)}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </BlurFade>
  )
}
