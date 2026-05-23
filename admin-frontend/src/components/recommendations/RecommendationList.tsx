import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { clientsApi, recommendationsApi } from "@/api/client"
import type { RecommendationListItem } from "@/types"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { DataTable } from "@/components/data-table"
import { PlatformIcon } from "@/components/platform-icon"
import { BorderBeam } from "@/components/magicui/border-beam"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const TYPE_LABELS: Record<string, string> = {
  content_brief: "Content Brief",
  schema_markup: "Schema Markup",
  llms_txt: "llms.txt",
  on_page_optimization: "On-Page",
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function RecommendationList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const clientId = searchParams.get("client_id") ?? ""
  const statusFilter = searchParams.get("status") ?? "pending"
  const typeFilter = searchParams.get("type") ?? ""
  const priorityFilter = searchParams.get("priority") ?? ""
  const page = parseInt(searchParams.get("page") ?? "1", 10)

  function setFilter(key: string, val: string) {
    const next = new URLSearchParams(searchParams)
    if (val) {
      next.set(key, val)
    } else {
      next.delete(key)
    }
    next.set("page", "1")
    setSearchParams(next)
  }

  const { data: clients } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: () => clientsApi.list("active"),
  })

  const { data: summary } = useQuery({
    queryKey: ["rec-summary", clientId],
    queryFn: () => recommendationsApi.summary(clientId),
    enabled: !!clientId,
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["recommendations", clientId, statusFilter, typeFilter, priorityFilter, page],
    queryFn: () =>
      recommendationsApi.list(clientId, {
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        priority: priorityFilter || undefined,
        page,
        per_page: 20,
      }),
    enabled: !!clientId,
  })

  const totalPages = data ? Math.ceil(data.total / 20) : 1
  const pendingCount = summary?.by_status?.pending ?? 0

  const summaryCards = [
    { label: "Pending", status: "pending", count: pendingCount },
    { label: "Approved", status: "approved", count: summary?.by_status?.approved ?? 0 },
    { label: "Rejected", status: "rejected", count: summary?.by_status?.rejected ?? 0 },
    { label: "Implemented", status: "implemented", count: summary?.by_status?.implemented ?? 0 },
  ]

  const columns = [
    {
      key: "priority",
      header: "",
      cell: (rec: RecommendationListItem) => (
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            rec.priority === "high" ? "bg-red-500" :
            rec.priority === "medium" ? "bg-amber-500" : "bg-blue-400",
          )}
          title={rec.priority}
        />
      ),
      headerClassName: "w-8",
      className: "w-8",
    },
    {
      key: "type",
      header: "Type",
      cell: (rec: RecommendationListItem) => (
        <Badge variant="outline" className="text-xs whitespace-nowrap">
          {TYPE_LABELS[rec.type] ?? rec.type}
        </Badge>
      ),
    },
    {
      key: "title",
      header: "Title",
      cell: (rec: RecommendationListItem) => (
        <div className="min-w-0 max-w-xs">
          <p className="font-medium text-sm truncate">{rec.title}</p>
          {rec.target_query && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{rec.target_query}</p>
          )}
        </div>
      ),
    },
    {
      key: "platform",
      header: "Platform",
      cell: (rec: RecommendationListItem) =>
        rec.platform ? (
          <div className="flex items-center gap-1.5">
            <PlatformIcon platform={rec.platform} size="sm" />
            <span className="text-xs capitalize">{rec.platform}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      headerClassName: "hidden md:table-cell",
      className: "hidden md:table-cell",
    },
    {
      key: "status",
      header: "Status",
      cell: (rec: RecommendationListItem) => <StatusBadge status={rec.status} />,
    },
    {
      key: "created",
      header: "Created",
      cell: (rec: RecommendationListItem) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {fmtDate(rec.created_at)}
        </span>
      ),
      headerClassName: "hidden lg:table-cell",
      className: "hidden lg:table-cell",
    },
  ]

  return (
    <BlurFade>
      <PageHeader
        title="Recommendations"
        description="GEO recommendations awaiting review"
      />

      <div className="space-y-6">
        {/* Client selector */}
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="client-select">Client</Label>
          <Select
            value={clientId || undefined}
            onValueChange={(val) => {
              const next = new URLSearchParams()
              next.set("client_id", val)
              next.set("status", "pending")
              setSearchParams(next)
            }}
          >
            <SelectTrigger id="client-select" className="w-full">
              <SelectValue placeholder="Select a client…" />
            </SelectTrigger>
            <SelectContent>
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!clientId && (
          <p className="text-sm text-muted-foreground">Select a client to view recommendations.</p>
        )}

        {clientId && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {summaryCards.map((card) => {
                const isSelected = statusFilter === card.status
                return (
                  <div key={card.status} className="relative">
                    <Card
                      className={cn(
                        "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm overflow-hidden",
                        isSelected ? "ring-1 ring-primary/60 shadow-sm" : "hover:border-border/60",
                      )}
                      onClick={() => setFilter("status", card.status)}
                    >
                      <CardContent className="p-5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                          {card.label}
                        </p>
                        <p className={cn(
                          "text-3xl font-bold tabular-nums",
                          isSelected && "text-primary",
                        )}>
                          {card.count}
                        </p>
                      </CardContent>
                      {isSelected && (
                        <BorderBeam colorFrom="#4A90D9" colorTo="#10B981" duration={12} borderWidth={1.5} />
                      )}
                    </Card>
                  </div>
                )
              })}
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter || "_all"} onValueChange={(v) => setFilter("type", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All types</SelectItem>
                  <SelectItem value="content_brief">Content Brief</SelectItem>
                  <SelectItem value="schema_markup">Schema Markup</SelectItem>
                  <SelectItem value="llms_txt">llms.txt</SelectItem>
                  <SelectItem value="on_page_optimization">On-Page</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter || "_all"} onValueChange={(v) => setFilter("priority", v === "_all" ? "" : v)}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              {(typeFilter || priorityFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setFilter("type", ""); setFilter("priority", "") }}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              )}

              <span className="ml-auto text-xs text-muted-foreground">
                {data?.total ?? 0} result{(data?.total ?? 0) !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Table */}
            <div className={cn("transition-opacity", isFetching && !isLoading && "opacity-70")}>
              <DataTable
                columns={columns}
                data={data?.items ?? []}
                isLoading={isLoading}
                emptyMessage="No recommendations found"
                emptyDescription="Try changing the filters above."
                onRowClick={(rec) =>
                  navigate(`/recommendations/${rec.id}?client_id=${clientId}`)
                }
              />
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setFilter("page", String(page - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setFilter("page", String(page + 1))}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </BlurFade>
  )
}
