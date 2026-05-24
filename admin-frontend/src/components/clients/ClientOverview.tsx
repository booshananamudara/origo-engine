import { ChevronRight } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useParams, Link, useNavigate } from "react-router-dom"
import { clientsApi, runsApi, costApi } from "@/api/client"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { BlurFade } from "@/components/magicui/blur-fade"
import { InteractiveHoverButton } from "@/components/magicui/interactive-hover-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function timeUntil(iso: string | null) {
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

function fmtNextRun(iso: string) {
  const s = iso.endsWith("Z") ? iso : iso + "Z"
  return new Date(s).toLocaleString([], {
    weekday: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  })
}

function citationClass(rate: number | null) {
  if (rate == null) return "text-muted-foreground"
  if (rate >= 0.5) return "text-emerald-600 dark:text-emerald-400"
  if (rate >= 0.25) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

export function ClientOverview() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  })

  const { data: runs } = useQuery({
    queryKey: ["admin-runs", clientId],
    queryFn: () => runsApi.list(clientId!, 1, 5),
    enabled: !!clientId,
  })

  const { data: costSummary } = useQuery({
    queryKey: ["admin-client-cost-summary", clientId],
    queryFn: () => costApi.getClientCostSummary(clientId!),
    enabled: !!clientId,
  })

  if (!client) {
    return (
      <div className="space-y-5 max-w-3xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)}
        </div>
      </div>
    )
  }

  const lastRun = runs?.items[0]
  const schedEnabled = client.schedule_enabled
  const schedCadence = client.schedule_cadence
  const nextRun = client.next_scheduled_run_at

  return (
    <BlurFade>
      <div className="space-y-5 max-w-3xl">
        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <BlurFade delay={0.05}><StatCard label="Prompts" value={client.total_prompts} /></BlurFade>
          <BlurFade delay={0.1}><StatCard label="Competitors" value={client.total_competitors} /></BlurFade>
          <BlurFade delay={0.15}><StatCard label="Total Runs" value={runs?.total ?? 0} animate={!!runs} /></BlurFade>
          <BlurFade delay={0.2}>
            <StatCard
              label="Last Citation Rate"
              value={lastRun?.overall_citation_rate != null ? Math.round(lastRun.overall_citation_rate * 100) : 0}
              suffix={lastRun?.overall_citation_rate != null ? "%" : ""}
              animate={!!runs}
            />
          </BlurFade>
        </div>

        {/* Schedule status */}
        <Card className={cn(
          "border-2",
          schedEnabled ? "border-emerald-500/40 bg-emerald-500/5"
          : schedCadence === "manual" ? ""
          : "border-amber-500/40 bg-amber-500/5",
        )}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <span className={cn(
                "h-2.5 w-2.5 rounded-full shrink-0",
                schedEnabled ? "bg-emerald-500 animate-pulse"
                : schedCadence === "manual" ? "bg-muted-foreground/40"
                : "bg-amber-500",
              )} />
              <div className="flex-1 min-w-0">
                {schedEnabled ? (
                  <>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      Auto-runs active
                      <span className="text-muted-foreground font-normal capitalize ml-1">· {schedCadence}</span>
                    </p>
                    {nextRun && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Next run <span className="text-emerald-600 dark:text-emerald-400 font-medium">{timeUntil(nextRun)}</span>
                        <span className="text-muted-foreground ml-1">({fmtNextRun(nextRun)})</span>
                      </p>
                    )}
                  </>
                ) : schedCadence === "manual" ? (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Manual mode</p>
                    <p className="text-xs text-muted-foreground">Runs are triggered by admins only</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Schedule paused</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      Was set to {schedCadence} — resume to re-enable
                    </p>
                  </>
                )}
              </div>
              <InteractiveHoverButton
                text={schedEnabled ? "Edit" : schedCadence === "manual" ? "Enable" : "Resume"}
                onClick={() => navigate("schedule")}
                className="text-xs px-3 py-0.5 shrink-0"
              />
            </div>
          </CardContent>
        </Card>

        {/* Latest run */}
        {lastRun && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Latest Run
                </CardTitle>
                {lastRun.status === "completed" && (
                  <InteractiveHoverButton
                    text="View details"
                    onClick={() => navigate(`/clients/${clientId}/runs/${lastRun.id}`)}
                    className="text-xs px-3 py-0.5"
                  />
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="grid grid-cols-3 gap-4">
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Status</dt>
                  <dd><StatusBadge status={lastRun.status} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Progress</dt>
                  <dd className="text-sm font-medium tabular-nums">
                    {lastRun.completed_prompts}/{lastRun.total_prompts}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Citation Rate</dt>
                  <dd className={cn("text-sm font-semibold tabular-nums", citationClass(lastRun.overall_citation_rate ?? null))}>
                    {lastRun.overall_citation_rate != null
                      ? `${Math.round(lastRun.overall_citation_rate * 100)}%`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Usage & Cost */}
        {costSummary && costSummary.total_runs > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Usage &amp; Cost
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Avg Cost / Run</dt>
                  <dd className="text-lg font-mono font-bold text-primary">
                    {costSummary.avg_cost_per_run_usd != null ? `$${costSummary.avg_cost_per_run_usd.toFixed(3)}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Avg Tokens / Run</dt>
                  <dd className="text-lg font-mono font-bold">
                    {costSummary.avg_tokens_per_run != null ? costSummary.avg_tokens_per_run.toLocaleString() : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Total Cost</dt>
                  <dd className="text-lg font-mono font-bold">
                    {costSummary.total_cost_all_time_usd != null
                      ? costSummary.total_cost_all_time_usd >= 1
                        ? `$${costSummary.total_cost_all_time_usd.toFixed(2)}`
                        : `$${costSummary.total_cost_all_time_usd.toFixed(3)}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Completed Runs</dt>
                  <dd className="text-lg font-mono font-bold">{costSummary.total_runs}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { to: "prompts", label: "Manage Prompts", desc: `${client.total_prompts} prompts` },
            { to: "competitors", label: "Competitors", desc: `${client.total_competitors} tracked` },
            { to: "knowledge-base", label: "Knowledge Base", desc: "Brand context" },
            { to: "runs", label: "Run History", desc: `${runs?.total ?? 0} runs` },
            { to: "schedule", label: "Schedule", desc: schedEnabled ? "Active" : schedCadence === "manual" ? "Manual" : "Paused" },
            { to: "settings", label: "Settings", desc: "Edit client" },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="group flex items-center gap-2 rounded-lg border p-4 hover:bg-muted/50 hover:border-primary/30 transition-all"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold group-hover:text-primary transition-colors">{link.label}</p>
                <p className="text-xs text-muted-foreground">{link.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </BlurFade>
  )
}
