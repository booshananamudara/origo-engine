import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams, useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { recommendations } from "@/lib/api"
import type { ClientRecommendationListItem, ClientRecommendationDetail } from "@/lib/api"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const TYPE_LABEL: Record<string, string> = {
  content_brief:       "Content Brief",
  schema_markup:       "Schema Markup",
  llms_txt:            "LLMs.txt",
  on_page_optimization: "On-Page Optimization",
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function ContentSection({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      {Object.entries(content).map(([key, value]) => (
        <div key={key}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {key.replace(/_/g, " ")}
          </p>
          {Array.isArray(value) ? (
            <ul className="list-disc list-inside space-y-1">
              {value.map((item, i) => (
                <li key={i} className="text-sm">{String(item)}</li>
              ))}
            </ul>
          ) : typeof value === "object" && value !== null ? (
            <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
              {JSON.stringify(value, null, 2)}
            </pre>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{String(value)}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function RecDetailPanel({ recId, onClose }: { recId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<ClientRecommendationDetail>({
    queryKey: ["client-rec", recId],
    queryFn: () => recommendations.get(recId),
  })

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto" side="right">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-sm font-semibold truncate pr-6">
            {data?.title ?? "Loading…"}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={data.status} />
              <Badge variant="outline" className="text-xs capitalize">{data.priority} priority</Badge>
              <Badge variant="secondary" className="text-xs">
                {TYPE_LABEL[data.type] ?? data.type}
              </Badge>
              {data.platform && (
                <Badge variant="secondary" className="text-xs capitalize">{data.platform}</Badge>
              )}
            </div>

            {data.target_query && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Target Query
                </p>
                <p className="text-sm italic text-muted-foreground">"{data.target_query}"</p>
              </div>
            )}

            {/* Content */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Recommendation
              </p>
              <ContentSection content={data.content} />
            </div>

            {/* History */}
            {data.history.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Activity
                </p>
                <div className="space-y-2">
                  {data.history.map((h) => (
                    <div key={h.id} className="flex items-start gap-2 text-xs">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div>
                        <span className="text-foreground/80">
                          {h.old_status ? `${h.old_status} → ` : ""}
                          <span className="font-semibold">{h.new_status}</span>
                        </span>
                        <span className="text-muted-foreground ml-2">{relTime(h.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Created {relTime(data.created_at)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Recommendation not found.</p>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function RecommendationsPage() {
  const { recId } = useParams<{ recId?: string }>()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("")

  const { data: summary } = useQuery({
    queryKey: ["client-rec-summary"],
    queryFn: () => recommendations.getSummary(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["client-recs", page, statusFilter, priorityFilter],
    queryFn: () => recommendations.list({
      page,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
    }),
  })

  const totalPages = data ? Math.ceil(data.total / 20) : 1

  function openRec(id: string) {
    navigate(`/dashboard/recommendations/${id}`)
  }

  function closeRec() {
    navigate("/dashboard/recommendations")
  }

  return (
    <BlurFade>
      {recId && <RecDetailPanel recId={recId} onClose={closeRec} />}

      <PageHeader
        title="Recommendations"
        description="GEO recommendations from your latest analysis"
      />

      <div className="space-y-5">
        {/* High-priority alert */}
        {summary && summary.pending_high_priority > 0 && (
          <Card className="border-red-500/30 bg-red-50 dark:bg-red-950/20">
            <CardContent className="py-3 px-4">
              <p className="text-sm text-red-700 dark:text-red-400">
                <span className="font-semibold">{summary.pending_high_priority}</span> high-priority recommendation{summary.pending_high_priority !== 1 ? "s" : ""} pending review.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter || "_all"} onValueChange={(v) => { setStatusFilter(v === "_all" ? "" : v); setPage(1) }}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="revision_requested">Revision Requested</SelectItem>
              <SelectItem value="implemented">Implemented</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priorityFilter || "_all"} onValueChange={(v) => { setPriorityFilter(v === "_all" ? "" : v); setPage(1) }}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          {(statusFilter || priorityFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStatusFilter(""); setPriorityFilter(""); setPage(1) }}
              className="gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}

          <span className="ml-auto text-xs text-muted-foreground self-center">
            {data?.total ?? 0} result{(data?.total ?? 0) !== 1 ? "s" : ""}
          </span>
        </div>

        {/* List */}
        <div className="rounded-md border overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !data?.items.length ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              No recommendations yet.
            </div>
          ) : (
            <div className="divide-y">
              {data.items.map((rec: ClientRecommendationListItem) => (
                <button
                  key={rec.id}
                  onClick={() => openRec(rec.id)}
                  className={cn(
                    "w-full text-left px-4 py-4 hover:bg-muted/50 transition-colors",
                    recId === rec.id && "bg-muted/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <StatusBadge status={rec.status} />
                        <span className={cn("text-xs font-medium", {
                          "text-red-600 dark:text-red-400": rec.priority === "high",
                          "text-amber-600 dark:text-amber-400": rec.priority === "medium",
                          "text-muted-foreground": rec.priority === "low",
                        })}>
                          {rec.priority}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABEL[rec.type] ?? rec.type}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium truncate">{rec.title}</p>
                      {rec.target_query && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">"{rec.target_query}"</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {relTime(rec.created_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
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
      </div>
    </BlurFade>
  )
}
