import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { dashboard } from "@/lib/api"
import type { RunListItem } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { DataTable } from "@/components/data-table"
import { StatusBadge } from "@/components/status-badge"
import { BlurFade } from "@/components/magicui/blur-fade"
import { InteractiveHoverButton } from "@/components/magicui/interactive-hover-button"
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
  if (rate >= 0.5) return "text-emerald-600 dark:text-emerald-400"
  if (rate >= 0.25) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

export function RunHistoryPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-runs", page],
    queryFn: () => dashboard.getRuns(page),
    refetchInterval: (q) => {
      const runs: RunListItem[] = q.state.data?.runs ?? []
      return runs.some((r) => ACTIVE.has(r.status)) ? 3000 : false
    },
  })

  const totalPages = data ? Math.ceil(data.total / 20) : 1

  const columns = [
    {
      key: "id",
      header: "Run",
      cell: (run: RunListItem) => (
        <span className="font-mono text-xs text-muted-foreground">
          {(run as RunListItem & { display_id?: string }).display_id ?? run.id.slice(0, 8) + "…"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (run: RunListItem) => <StatusBadge status={run.status} />,
    },
    {
      key: "progress",
      header: "Progress",
      cell: (run: RunListItem) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          {run.completed_prompts}/{run.total_prompts}
        </span>
      ),
    },
    {
      key: "citation",
      header: "Citation",
      cell: (run: RunListItem) => (
        <span className={cn("font-mono text-sm font-semibold tabular-nums", citationClass(run.overall_citation_rate ?? null))}>
          {run.overall_citation_rate != null ? `${Math.round(run.overall_citation_rate * 100)}%` : "—"}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      cell: (run: RunListItem) => (
        <span className="font-mono text-xs text-muted-foreground">
          {run.cost_usd != null ? `$${run.cost_usd.toFixed(3)}` : "—"}
        </span>
      ),
      headerClassName: "hidden md:table-cell",
      className: "hidden md:table-cell",
    },
    {
      key: "date",
      header: "Date",
      cell: (run: RunListItem) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{relTime(run.created_at)}</span>
      ),
      headerClassName: "hidden sm:table-cell",
      className: "hidden sm:table-cell",
    },
    {
      key: "actions",
      header: "",
      cell: (run: RunListItem) =>
        run.status === "completed" ? (
          <InteractiveHoverButton
            text="View"
            onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/runs/${run.id}`) }}
            className="text-xs px-3 py-0.5"
          />
        ) : null,
    },
  ]

  return (
    <BlurFade>
      <PageHeader
        title="Run History"
        description="All analysis runs for your account"
      />

      <DataTable
        columns={columns}
        data={data?.runs ?? []}
        isLoading={isLoading}
        emptyMessage="No runs yet"
        emptyDescription="Your first run will appear here once triggered."
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
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
    </BlurFade>
  )
}
