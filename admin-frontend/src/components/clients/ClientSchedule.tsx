import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { toast } from "sonner"
import { scheduleApi, clientsApi } from "@/api/client"
import type { ScheduleCadence, ScheduleConfig, SchedulerRunItem } from "@/types"
import { BlurFade } from "@/components/magicui/blur-fade"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const CADENCE_LABELS: Record<ScheduleCadence, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  manual: "Manual (never auto-run)",
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

function relTimePast(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return "now"
  const m = Math.floor(diff / 60000)
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h < 24) return rem > 0 ? `in ${h}h ${rem}m` : `in ${h}h`
  return `in ${Math.floor(h / 24)}d`
}

function fmtUtc(iso: string) {
  const s = iso.endsWith("Z") ? iso : iso + "Z"
  return new Date(s).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  })
}

function timeLabel(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export function ClientSchedule() {
  const { clientId } = useParams<{ clientId: string }>()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["admin-schedule", clientId],
    queryFn: () => scheduleApi.get(clientId!),
    refetchInterval: 30_000,
  })

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  })

  const clientTz = client?.timezone ?? "UTC"

  const [form, setForm] = useState<ScheduleConfig>({
    schedule_enabled: false,
    schedule_cadence: "daily",
    schedule_hour: 2,
    schedule_minute: 0,
    schedule_day_of_week: null,
  })
  const [dirty, setDirty] = useState(false)
  const [confirmPause, setConfirmPause] = useState(false)
  const [confirmResume, setConfirmResume] = useState(false)

  useEffect(() => {
    if (!data) return
    setForm({
      schedule_enabled: data.schedule_enabled,
      schedule_cadence: data.schedule_cadence,
      schedule_hour: data.schedule_hour,
      schedule_minute: data.schedule_minute,
      schedule_day_of_week: data.schedule_day_of_week,
    })
    setDirty(false)
  }, [data])

  function update<K extends keyof ScheduleConfig>(key: K, value: ScheduleConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  const saveMut = useMutation({
    mutationFn: () => scheduleApi.update(clientId!, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] })
      setDirty(false)
      toast.success("Schedule saved")
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to save schedule")
    },
  })

  const pauseMut = useMutation({
    mutationFn: () => scheduleApi.pause(clientId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] })
      setConfirmPause(false)
      toast.success("Schedule paused")
    },
  })

  const resumeMut = useMutation({
    mutationFn: () => scheduleApi.resume(clientId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] })
      setConfirmResume(false)
      toast.success("Schedule resumed")
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to resume schedule")
      setConfirmResume(false)
    },
  })

  const isEnabled = data?.schedule_enabled ?? false
  const nextRunAt = data?.next_scheduled_run_at

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  return (
    <BlurFade>
      <div className="space-y-6 max-w-2xl">
        {/* Status banner */}
        <Card className={cn(
          "border-2",
          isEnabled
            ? "border-emerald-500/40 bg-emerald-500/5"
            : data?.schedule_cadence === "manual"
            ? ""
            : "border-amber-500/40 bg-amber-500/5",
        )}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <span className={cn(
                "h-2.5 w-2.5 rounded-full shrink-0",
                isEnabled
                  ? "bg-emerald-500 animate-pulse"
                  : data?.schedule_cadence === "manual"
                  ? "bg-muted-foreground/40"
                  : "bg-amber-500",
              )} />
              <div className="flex-1 min-w-0">
                {isEnabled ? (
                  <>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      Schedule active
                    </p>
                    {nextRunAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Next run{" "}
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {timeUntil(nextRunAt)}
                        </span>{" "}
                        <span className="text-muted-foreground">({fmtUtc(nextRunAt)})</span>
                      </p>
                    )}
                  </>
                ) : data?.schedule_cadence === "manual" ? (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Manual mode</p>
                    <p className="text-xs text-muted-foreground">Runs only when triggered by admin</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      Schedule paused
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      Was set to {data?.schedule_cadence} — resume to re-enable
                    </p>
                  </>
                )}
              </div>
              {isEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmPause(true)}
                  className="shrink-0 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                >
                  Pause
                </Button>
              )}
              {!isEnabled && data?.schedule_cadence !== "manual" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmResume(true)}
                  className="shrink-0 border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10"
                >
                  Resume
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Configuration form */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Schedule Configuration
              </CardTitle>
              <Link
                to="../settings"
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                {clientTz}
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Master toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable automated runs</p>
                <p className="text-xs text-muted-foreground">
                  When enabled, runs fire automatically on the chosen cadence
                </p>
              </div>
              <button
                type="button"
                onClick={() => update("schedule_enabled", !form.schedule_enabled)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  form.schedule_enabled ? "bg-primary" : "bg-muted-foreground/40",
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  form.schedule_enabled ? "translate-x-6" : "translate-x-1",
                )} />
              </button>
            </div>

            {/* Cadence */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Cadence
              </Label>
              <div className="flex flex-wrap gap-2">
                {(["hourly", "daily", "weekly", "manual"] as ScheduleCadence[]).map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant={form.schedule_cadence === c ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      update("schedule_cadence", c)
                      if (c === "manual") update("schedule_enabled", false)
                    }}
                  >
                    {CADENCE_LABELS[c].split(" ")[0]}
                  </Button>
                ))}
              </div>
            </div>

            {/* Time selectors */}
            {form.schedule_cadence !== "manual" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {form.schedule_cadence !== "hourly" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hour (UTC)</Label>
                    <Select
                      value={String(form.schedule_hour)}
                      onValueChange={(v) => update("schedule_hour", Number(v))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {String(i).padStart(2, "0")}:00
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Minute</Label>
                  <Select
                    value={String(form.schedule_minute)}
                    onValueChange={(v) => update("schedule_minute", Number(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {String(m).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.schedule_cadence === "weekly" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Day of week</Label>
                    <Select
                      value={String(form.schedule_day_of_week ?? 0)}
                      onValueChange={(v) => update("schedule_day_of_week", Number(v))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS.map((d, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Time preview */}
            {form.schedule_cadence !== "manual" && (
              <p className="text-xs text-muted-foreground">
                {form.schedule_cadence === "hourly"
                  ? `Runs every hour at :${String(form.schedule_minute).padStart(2, "0")} — in ${clientTz}`
                  : form.schedule_cadence === "weekly"
                  ? `Runs every ${DAYS[form.schedule_day_of_week ?? 0]} at ${timeLabel(form.schedule_hour, form.schedule_minute)} — in ${clientTz}`
                  : `Runs daily at ${timeLabel(form.schedule_hour, form.schedule_minute)} — in ${clientTz}`}
              </p>
            )}

            {/* Save */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={!dirty || saveMut.isPending}
              >
                {saveMut.isPending ? "Saving…" : "Save Changes"}
              </Button>
              {!dirty && !saveMut.isPending && data && (
                <span className="text-xs text-muted-foreground">No unsaved changes</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent scheduled runs */}
        {data && data.recent_runs.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent Scheduled Runs
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Triggered</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Cadence</TableHead>
                    <TableHead className="text-xs">Retries</TableHead>
                    <TableHead className="text-xs">Pipeline Run</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent_runs.map((r: SchedulerRunItem) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {relTimePast(r.triggered_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">
                        {r.cadence}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.retry_count}
                      </TableCell>
                      <TableCell>
                        {r.run_id ? (
                          <Link
                            to={`/clients/${clientId}/runs/${r.run_id}`}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            View →
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Pause confirmation */}
        <Dialog open={confirmPause} onOpenChange={setConfirmPause}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pause Schedule?</DialogTitle>
              <DialogDescription>
                Automated runs will stop. Your configuration is preserved — you can resume at any time.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmPause(false)}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => pauseMut.mutate()}
                disabled={pauseMut.isPending}
                className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
              >
                {pauseMut.isPending ? "Pausing…" : "Pause Schedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Resume confirmation */}
        <Dialog open={confirmResume} onOpenChange={setConfirmResume}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resume Schedule?</DialogTitle>
              <DialogDescription>
                Automated runs will resume on the current cadence. The next run will be computed from now.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmResume(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => resumeMut.mutate()}
                disabled={resumeMut.isPending}
              >
                {resumeMut.isPending ? "Resuming…" : "Resume Schedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BlurFade>
  )
}
