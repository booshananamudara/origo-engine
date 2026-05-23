import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, AlertTriangle, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { scheduleApi } from "@/api/client"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

function relTime(iso: string | null) {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function lastRefreshedLabel(tsMs: number): string {
  if (!tsMs) return "—"
  const s = Math.floor((Date.now() - tsMs) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

export function SchedulerHealth() {
  const qc = useQueryClient()
  const [pauseReason, setPauseReason] = useState("")
  const [pauseConfirmText, setPauseConfirmText] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["scheduler-health"],
    queryFn: () => scheduleApi.health(),
    refetchInterval: 10_000,
  })

  const pauseAllMut = useMutation({
    mutationFn: () => scheduleApi.pauseAll(pauseReason),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["scheduler-health"] })
      setDialogOpen(false)
      setPauseReason("")
      setPauseConfirmText("")
      toast.success(`Paused ${res.paused_count} client schedule${res.paused_count !== 1 ? "s" : ""}`)
    },
    onError: () => {
      toast.error("Failed to pause schedules")
    },
  })

  const healthy = data?.is_healthy ?? false
  const today = data?.scheduled_runs_today ?? {}

  const statCards = [
    { label: "Active Clients", value: data?.active_clients_count ?? 0 },
    { label: "Enqueued Today", value: (today as Record<string, number>).enqueued ?? 0 },
    { label: "Completed Today", value: (today as Record<string, number>).completed ?? 0 },
    {
      label: "Failed Today",
      value: (today as Record<string, number>).failed ?? 0,
      status: ((today as Record<string, number>).failed ?? 0) > 0 ? ("danger" as const) : ("success" as const),
      statusLabel: ((today as Record<string, number>).failed ?? 0) > 0 ? "failures" : "clean",
    },
  ]

  return (
    <BlurFade>
      <PageHeader
        title="Scheduler"
        description={`Last refreshed: ${lastRefreshedLabel(dataUpdatedAt)}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Health status card */}
        {!isLoading && (
          <Card className={cn(
            "border-2",
            healthy
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-red-500/40 bg-red-500/5",
          )}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "h-3 w-3 rounded-full shrink-0 animate-pulse",
                  healthy ? "bg-emerald-500" : "bg-red-500",
                )} />
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-lg font-semibold",
                    healthy ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                  )}>
                    {healthy ? "Healthy" : "Unhealthy"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Last tick: {relTime(data?.last_tick_at ?? null)}
                    {data?.last_tick_age_seconds != null && (
                      <span className={cn(
                        "ml-2 font-mono text-xs",
                        data.last_tick_age_seconds > 120 ? "text-red-500" : "text-muted-foreground",
                      )}>
                        ({data.last_tick_age_seconds}s)
                      </span>
                    )}
                  </p>
                </div>
                {(data?.consecutive_failures ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs font-semibold text-red-500">
                      {data?.consecutive_failures} failures
                    </span>
                  </div>
                )}
              </div>
              {data?.last_error && (
                <div className="mt-3 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">
                  <p className="text-xs font-mono text-red-500">{data.last_error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card, i) => (
            <BlurFade key={card.label} delay={i * 0.05}>
              <StatCard
                label={card.label}
                value={card.value}
                status={card.status}
                statusLabel={card.statusLabel}
                animate={!isLoading}
              />
            </BlurFade>
          ))}
        </div>

        {/* Last tick details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Last Tick Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <div>
                <dt className="text-xs text-muted-foreground mb-0.5">Clients evaluated</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {data?.last_tick_clients_evaluated ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground mb-0.5">Runs enqueued</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {data?.last_tick_runs_enqueued ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground mb-0.5">Tick time</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {data?.last_tick_at
                    ? new Date(data.last_tick_at).toLocaleTimeString()
                    : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Emergency controls */}
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-destructive flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Emergency Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Pause All Schedules</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Immediately disable automated runs for every client. Use during API outages or runaway cost events.
                </p>
              </div>

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="shrink-0">
                    Pause All
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Pause All Schedules</DialogTitle>
                    <DialogDescription>
                      This will disable automated runs for every active client immediately.
                      Manual triggers will still work.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="pause-reason">Reason (required)</Label>
                      <Input
                        id="pause-reason"
                        value={pauseReason}
                        onChange={(e) => setPauseReason(e.target.value)}
                        placeholder="e.g., API outage, cost spike detected…"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pause-confirm">
                        Type <span className="font-mono text-destructive">PAUSE ALL</span> to confirm
                      </Label>
                      <Input
                        id="pause-confirm"
                        value={pauseConfirmText}
                        onChange={(e) => setPauseConfirmText(e.target.value)}
                        placeholder="PAUSE ALL"
                        className="font-mono"
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDialogOpen(false)
                        setPauseReason("")
                        setPauseConfirmText("")
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={
                        pauseConfirmText !== "PAUSE ALL" ||
                        !pauseReason.trim() ||
                        pauseAllMut.isPending
                      }
                      onClick={() => pauseAllMut.mutate()}
                    >
                      {pauseAllMut.isPending ? "Pausing…" : "Pause All Schedules"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </BlurFade>
  )
}
