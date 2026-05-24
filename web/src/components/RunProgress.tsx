import { AlertCircle } from "lucide-react"
import type { RunRead } from "@/lib/types"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export function RunProgress({ run }: { run: RunRead }) {
  const pct = run.total_prompts > 0
    ? Math.round((run.completed_prompts / run.total_prompts) * 100)
    : 0

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {run.status === "running" && (
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
            )}
            <p className="text-xs text-muted-foreground font-mono truncate">
              Run <span className="text-foreground">{run.id.slice(0, 8)}…</span>
            </p>
          </div>
          <StatusBadge status={run.status} />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{run.completed_prompts} / {run.total_prompts} tasks complete</span>
            <span className="font-semibold tabular-nums">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        {run.error_message && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{run.error_message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
