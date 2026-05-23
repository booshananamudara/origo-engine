import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { Play, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { runsApi, costApi } from "@/api/client"
import type { RunSummaryItem } from "@/types"
import { StatCard } from "@/components/stat-card"
import { DataTable } from "@/components/data-table"
import { StatusBadge } from "@/components/status-badge"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ACTIVE = new Set(["pending", "running"])

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function citationClass(rate: number | null) {
  if (rate == null) return "text-muted-foreground"
  if (rate >= 0.5) return "text-emerald-600"
  if (rate >= 0.25) return "text-amber-600"
  return "text-red-600"
}

export function ClientRuns() {
  const { clientId } = useParams<{ clientId: string }>()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-runs", clientId, page],
    queryFn: () => runsApi.list(clientId!, page),
    refetchInterval: (query) => {
      const items: RunSummaryItem[] = query.state.data?.items ?? []
      return items.some((r) => ACTIVE.has(r.status)) ? 3000 : false
    },
  })

  const { data: costSummary } = useQuery({
    queryKey: ["admin-client-costs", clientId],
    queryFn: () => costApi.getClientCostSummary(clientId!),
    enabled: !!clientId,
  })

  const triggerMut = useMutation({
    mutationFn: () => runsApi.trigger(clientId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-runs", clientId] })
      toast.success("Run triggered successfully")
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to start run")
    },
  })

  const totalPages = data ? Math.ceil(data.total / 20) : 1
  const hasActive = (data?.items ?? []).some((r) => ACTIVE.has(r.status))

  const columns = [
    {
      key: "display_id",
      header: "Run ID",
      cell: (run: RunSummaryItem) => (
        <span className="font-mono text-xs text-muted-foreground">
          {run.display_id ?? run.id.slice(0, 8) + "…"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (run: RunSummaryItem) => <StatusBadge status={run.status} />,
    },
    {
      key: "progress",
      header: "Progress",
      cell: (run: RunSummaryItem) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {run.completed_prompts}/{run.total_prompts}
        </span>
      ),
    },
    {
      key: "citation",
      header: "Citation",
      cell: (run: RunSummaryItem) => (
        <span className={cn("font-mono text-sm font-semibold tabular-nums", citationClass(run.overall_citation_rate))}>
          {run.overall_citation_rate != null ? `${Math.round(run.overall_citation_rate * 100)}%` : "—"}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      cell: (run: RunSummaryItem) => (
        <span className="font-mono text-xs text-muted-foreground">
          {run.cost_usd != null ? `$${run.cost_usd.toFixed(3)}` : "—"}
        </span>
      ),
    },
    {
      key: "started",
      header: "Started",
      cell: (run: RunSummaryItem) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{relTime(run.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (run: RunSummaryItem) =>
        run.status === "completed" ? (
          <Link
            to={`/clients/${clientId}/runs/${run.id}`}
            className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
          >
            View →
          </Link>
        ) : null,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Runs"
          value={costSummary?.total_runs ?? data?.total ?? 0}
          animate={!!costSummary}
        />
        <StatCard
          label="Avg Citation Rate"
          value={0}
          suffix="%"
          subtitle="from latest runs"
          animate={false}
        />
        <StatCard
          label="Avg Cost per Run"
          value={costSummary?.avg_cost_per_run_usd ?? 0}
          prefix="$"
          decimalPlaces={3}
          animate={!!costSummary}
        />
        <StatCard
          label="Active Prompts"
          value={0}
          subtitle="across all categories"
          animate={false}
        />
      </div>

      {/* Run history */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            Run History
            {data && (
              <span className="text-sm font-normal text-muted-foreground ml-2">({data.total})</span>
            )}
          </h2>
          <ShimmerButton
            onClick={() => triggerMut.mutate()}
            disabled={triggerMut.isPending || hasActive}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium",
              (triggerMut.isPending || hasActive) && "opacity-50 cursor-not-allowed",
            )}
          >
            <Play className="h-3.5 w-3.5" />
            {hasActive ? "Run in progress…" : "Trigger New Run"}
          </ShimmerButton>
        </div>

        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          emptyMessage="No runs yet"
          emptyDescription="Trigger the first run to see results."
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
