import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Building2, Clock, ExternalLink, Plus, Zap } from "lucide-react"
import { clientsApi } from "@/api/client"
import type { ClientSummary } from "@/types"
import { CreateClientModal } from "./CreateClientModal"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { BlurFade } from "@/components/magicui/blur-fade"
import { cn } from "@/lib/utils"

function pct(v: number | null) {
  if (v == null) return "—"
  return `${Math.round(v * 100)}%`
}

function relTime(iso: string | null) {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function relFuture(iso: string | null) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return "now"
  const m = Math.floor(diff / 60000)
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `in ${h}h`
  return `in ${Math.floor(h / 24)}d`
}

function citationClass(rate: number | null) {
  if (rate == null) return "text-muted-foreground"
  if (rate >= 0.5) return "text-emerald-600"
  if (rate >= 0.25) return "text-amber-600"
  return "text-red-600"
}

function ClientCard({ c, onClick }: { c: ClientSummary; onClick: () => void }) {
  const nextRun = c.schedule_enabled ? relFuture(c.next_scheduled_run_at) : null

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1 group"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-base truncate group-hover:text-primary transition-colors">
              {c.name}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{c.industry ?? c.slug}</p>
          </div>
          <StatusBadge status={c.status} />
        </div>
        {c.website && (
          <a
            href={c.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 w-fit transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
            {c.website.replace(/^https?:\/\//, "")}
          </a>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center">
            <p className={cn("text-lg font-bold tabular-nums", citationClass(c.latest_citation_rate))}>
              {pct(c.latest_citation_rate)}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Citation</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{c.total_prompts}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Prompts</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{c.total_competitors ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Competitors</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {relTime(c.last_run_at)}
          </span>
          {nextRun ? (
            <span className="flex items-center gap-1 text-blue-600">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              {nextRun}
            </span>
          ) : c.schedule_cadence === "manual" ? (
            <span className="text-muted-foreground">Manual</span>
          ) : (
            <span className="text-amber-600">Paused</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ClientCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="text-center space-y-1">
              <Skeleton className="h-6 w-10 mx-auto" />
              <Skeleton className="h-2 w-12 mx-auto" />
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t pt-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  )
}

export function ClientList() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState("active")
  const [showCreate, setShowCreate] = useState(false)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["admin-clients", statusFilter],
    queryFn: () => clientsApi.list(statusFilter),
  })

  return (
    <BlurFade>
      <PageHeader
        title="Clients"
        description={isLoading ? "Loading…" : `${clients.length} client${clients.length !== 1 ? "s" : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New Client
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ClientCardSkeleton key={i} />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Building2 className="h-12 w-12 opacity-40" />
          <p className="text-sm font-medium">No clients found</p>
          <p className="text-xs">Create your first client to get started.</p>
          <Button size="sm" onClick={() => setShowCreate(true)} className="mt-2">
            <Plus className="h-4 w-4" />
            New Client
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {clients.map((c: ClientSummary, i: number) => (
            <BlurFade key={c.id} delay={i * 0.04}>
              <ClientCard
                c={c}
                onClick={() => navigate(`/clients/${c.id}/overview`)}
              />
            </BlurFade>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateClientModal
          onClose={() => setShowCreate(false)}
          onCreated={(client) => {
            qc.invalidateQueries({ queryKey: ["admin-clients"] })
            setShowCreate(false)
            navigate(`/clients/${client.id}/overview`)
          }}
        />
      )}
    </BlurFade>
  )
}
