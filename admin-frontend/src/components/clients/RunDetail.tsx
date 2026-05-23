import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { Download, ChevronDown, ChevronUp, CheckCircle2, XCircle } from "lucide-react"
import { runsApi, costApi } from "@/api/client"
import type { Platform, PromptAnalysisItem, PromptDetail, RunCostSummary } from "@/types"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { PlatformIcon } from "@/components/platform-icon"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

// ── helpers ──────────────────────────────────────────────────────────────────

const ACTIVE = new Set(["pending", "running"])

const PLATFORM_ORDER: Platform[] = ["perplexity", "openai", "anthropic", "gemini"]

function fmtCost(usd: number | null | undefined, d = 3) {
  if (usd == null) return "—"
  return `$${usd.toFixed(d)}`
}
function fmtTokens(n: number | null | undefined) {
  if (n == null) return "—"
  return n.toLocaleString()
}

function citationStatus(rate: number): "success" | "warning" | "danger" {
  if (rate >= 0.5) return "success"
  if (rate >= 0.25) return "warning"
  return "danger"
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Prominence stacked bar ────────────────────────────────────────────────────

const PROMINENCE_COLORS = {
  primary: "bg-emerald-500",
  secondary: "bg-blue-500",
  mentioned: "bg-amber-500",
  not_cited: "bg-zinc-300 dark:bg-zinc-600",
}

function ProminenceBar({
  breakdown,
  total,
}: {
  breakdown: Record<string, number>
  total: number
}) {
  if (total === 0) return <div className="h-4 bg-muted rounded" />
  const segments = ["primary", "secondary", "mentioned", "not_cited"].map((key) => ({
    key,
    count: breakdown[key] ?? 0,
    pct: ((breakdown[key] ?? 0) / total) * 100,
  }))

  return (
    <div className="flex h-4 rounded overflow-hidden gap-px">
      {segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <Tooltip key={s.key}>
            <TooltipTrigger asChild>
              <div
                className={cn("transition-all", PROMINENCE_COLORS[s.key as keyof typeof PROMINENCE_COLORS] ?? "bg-muted")}
                style={{ width: `${s.pct}%` }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs capitalize">
                {s.key.replace("_", " ")}: {s.count} ({Math.round(s.pct)}%)
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
    </div>
  )
}

// ── Cost section ──────────────────────────────────────────────────────────────

function CostSection({ clientId, runId }: { clientId: string; runId: string }) {
  const [open, setOpen] = useState(false)

  const { data: cost } = useQuery<RunCostSummary>({
    queryKey: ["admin-run-costs", clientId, runId],
    queryFn: () => costApi.getRunCosts(clientId, runId),
    enabled: !!clientId && !!runId,
  })

  if (!cost) return null

  const mon = cost.breakdown?.monitoring
  const gen = cost.breakdown?.generation
  const totalCalls = (mon?.api_calls ?? 0) + (gen?.api_calls ?? 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-base">Cost &amp; Usage</CardTitle>
          <CardDescription>Token consumption and API costs</CardDescription>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Cost</p>
          <p className="text-2xl font-bold tabular-nums">{fmtCost(cost.total_cost_usd)}</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wide">Phase</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-right">API Calls</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-right">Tokens</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mon && (
              <TableRow>
                <TableCell className="py-2">Monitoring</TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">{mon.api_calls}</TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">{fmtTokens(mon.tokens)}</TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">{fmtCost(mon.cost_usd)}</TableCell>
              </TableRow>
            )}
            {gen && (
              <TableRow>
                <TableCell className="py-2">Generation</TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">{gen.api_calls}</TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">—</TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">{fmtCost(gen.cost_usd)}</TableCell>
              </TableRow>
            )}
            <TableRow className="font-semibold bg-muted/30">
              <TableCell className="py-2">Total</TableCell>
              <TableCell className="py-2 text-right font-mono text-xs">{totalCalls}</TableCell>
              <TableCell className="py-2 text-right font-mono text-xs">{fmtTokens(cost.total_tokens)}</TableCell>
              <TableCell className="py-2 text-right font-mono text-xs">{fmtCost(cost.total_cost_usd)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {Object.keys(cost.cost_by_platform).length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Per-platform breakdown
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs uppercase tracking-wide">Platform</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">Tokens</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(cost.cost_by_platform).map(([platform, d]) => (
                    <TableRow key={platform}>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={platform} size="sm" />
                          <span className="capitalize text-sm">{platform}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs">{fmtTokens(d.tokens)}</TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs">{fmtCost(d.cost_usd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}

// ── Response analysis table ───────────────────────────────────────────────────

const SENTIMENT_CLASS: Record<string, string> = {
  positive: "text-emerald-600",
  negative: "text-red-600",
  neutral: "text-muted-foreground",
  not_cited: "text-muted-foreground",
}

const OPP_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  high: "default",
  medium: "outline",
  low: "secondary",
}

function AnalysisRow({
  item,
  promptText,
}: {
  item: PromptAnalysisItem
  promptText: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="max-w-[200px]">
          <p className="text-xs text-muted-foreground truncate">{promptText}</p>
        </TableCell>
        <TableCell>
          {item.client_cited == null ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : item.client_cited ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          {item.client_prominence && item.client_prominence !== "not_cited" ? (
            <Badge variant="outline" className="text-xs capitalize">
              {item.client_prominence}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <span className={cn("text-xs capitalize font-medium", SENTIMENT_CLASS[item.client_sentiment ?? "not_cited"])}>
            {item.client_sentiment && item.client_sentiment !== "not_cited"
              ? item.client_sentiment
              : "—"}
          </span>
        </TableCell>
        <TableCell>
          {item.citation_opportunity ? (
            <Badge variant={OPP_VARIANT[item.citation_opportunity] ?? "secondary"} className="text-xs capitalize">
              {item.citation_opportunity}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="max-w-[120px]">
          <span className="text-xs text-muted-foreground truncate">
            {item.competitors_cited.length > 0
              ? item.competitors_cited.map((c) => c.brand).join(", ")
              : "—"}
          </span>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 py-3 px-4">
            <div className="space-y-2">
              <p className="text-xs font-medium">Full prompt:</p>
              <p className="text-xs text-muted-foreground">{promptText}</p>
              {item.raw_response && (
                <>
                  <p className="text-xs font-medium mt-2">Response (truncated):</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.raw_response.slice(0, 400)}
                    {item.raw_response.length > 400 && "…"}
                  </p>
                </>
              )}
              {item.reasoning && (
                <>
                  <p className="text-xs font-medium mt-2">Reasoning:</p>
                  <p className="text-xs text-muted-foreground italic">{item.reasoning}</p>
                </>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function AnalysisTable({
  prompts,
  platform,
}: {
  prompts: PromptDetail[]
  platform: string | "all"
}) {
  const rows = prompts.flatMap((p) =>
    p.results
      .filter((r) => platform === "all" || r.platform === platform)
      .map((r) => ({ item: r, promptText: p.prompt_text })),
  )

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No results for this platform.
      </p>
    )
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs uppercase tracking-wide w-[200px]">Prompt</TableHead>
            <TableHead className="text-xs uppercase tracking-wide w-[60px]">Cited</TableHead>
            <TableHead className="text-xs uppercase tracking-wide">Prominence</TableHead>
            <TableHead className="text-xs uppercase tracking-wide">Sentiment</TableHead>
            <TableHead className="text-xs uppercase tracking-wide">Opportunity</TableHead>
            <TableHead className="text-xs uppercase tracking-wide">Competitors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <AnalysisRow
              key={`${row.item.response_id}-${i}`}
              item={row.item}
              promptText={row.promptText}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Main RunDetail ─────────────────────────────────────────────────────────────

export function RunDetail() {
  const { clientId, runId } = useParams<{ clientId: string; runId: string }>()
  const [downloading, setDownloading] = useState<"json" | "pdf" | null>(null)

  const { data: summary, isLoading } = useQuery({
    queryKey: ["admin-run-detail", clientId, runId],
    queryFn: () => runsApi.get(clientId!, runId!),
    enabled: !!clientId && !!runId,
    refetchInterval: (q) => (ACTIVE.has(q.state.data?.run?.status ?? "") ? 2000 : false),
  })

  const { data: prompts } = useQuery({
    queryKey: ["admin-run-prompts", clientId, runId],
    queryFn: () => runsApi.getPrompts(clientId!, runId!),
    enabled: summary?.run?.status === "completed",
  })

  const run = summary?.run
  const displayId = (run as { display_id?: string } | undefined)?.display_id ?? runId?.slice(0, 8) + "…"
  const overallPct = summary ? Math.round(summary.overall_citation_rate * 100) : 0

  async function handleDownload(format: "json" | "pdf") {
    if (!clientId || !runId) return
    setDownloading(format)
    try {
      const blob =
        format === "json"
          ? await runsApi.downloadJson(clientId, runId)
          : await runsApi.downloadPdf(clientId, runId)
      triggerDownload(blob, `${displayId}-report.${format}`)
    } finally {
      setDownloading(null)
    }
  }

  const availablePlatforms = summary?.platform_stats.map((ps) => ps.platform) ?? []

  return (
    <BlurFade>
      <PageHeader
        breadcrumbs={[
          { label: "Clients", href: "/clients" },
          { label: "Client", href: `/clients/${clientId}/overview` },
          { label: "Runs", href: `/clients/${clientId}/runs` },
          { label: displayId },
        ]}
        title="Run Detail"
        description={displayId}
        actions={
          run?.status === "completed" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!!downloading}
                onClick={() => handleDownload("json")}
              >
                <Download className="h-3.5 w-3.5" />
                JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!downloading}
                onClick={() => handleDownload("pdf")}
              >
                <Download className="h-3.5 w-3.5" />
                PDF
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {/* In-progress */}
        {run && ACTIVE.has(run.status) && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <p className="text-sm font-semibold">Run in progress</p>
                </div>
                <StatusBadge status={run.status} />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{run.completed_prompts} / {run.total_prompts} tasks</span>
                  <span className="font-semibold">
                    {run.total_prompts > 0
                      ? Math.round((run.completed_prompts / run.total_prompts) * 100)
                      : 0}%
                  </span>
                </div>
                <Progress
                  value={run.total_prompts > 0 ? (run.completed_prompts / run.total_prompts) * 100 : 0}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Platform errors */}
        {summary && Object.keys(summary.platform_errors ?? {}).length > 0 && (
          <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="p-4 space-y-1">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                {Object.keys(summary.platform_errors).length} platform{Object.keys(summary.platform_errors).length !== 1 ? "s" : ""} failed — results are partial
              </p>
              {Object.entries(summary.platform_errors).map(([p, msg]) => (
                <p key={p} className="text-xs text-amber-600 dark:text-amber-300">
                  <span className="font-semibold capitalize">{p}:</span> {msg}
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Section 1 — Citation Overview */}
        {summary && run?.status === "completed" && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              label="Overall Citation Rate"
              value={overallPct}
              suffix="%"
              subtitle={`${summary.total_analyses} responses`}
              status={citationStatus(summary.overall_citation_rate)}
              animate
            />
            {PLATFORM_ORDER.filter((p) => availablePlatforms.includes(p)).map((platform) => {
              const ps = summary.platform_stats.find((s) => s.platform === platform)
              if (!ps) return null
              const pct = Math.round(ps.citation_rate * 100)
              return (
                <StatCard
                  key={platform}
                  label={platform.charAt(0).toUpperCase() + platform.slice(1)}
                  value={pct}
                  suffix="%"
                  subtitle={`${ps.cited_count}/${ps.total_responses}`}
                  status={citationStatus(ps.citation_rate)}
                  statusLabel={ps.model_used}
                  animate
                />
              )
            })}
          </div>
        )}

        {/* Section 2 — Prominence Breakdown */}
        {summary && run?.status === "completed" && summary.platform_stats.length > 0 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Prominence Breakdown</CardTitle>
              <CardDescription>Citation prominence distribution per platform</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary.platform_stats.map((ps) => (
                <div key={ps.platform} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={ps.platform} size="sm" />
                      <span className="text-sm font-medium capitalize">{ps.platform}</span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(ps.citation_rate * 100)}% cited
                    </span>
                  </div>
                  <ProminenceBar
                    breakdown={ps.prominence_breakdown}
                    total={ps.total_responses}
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-3 pt-2">
                {Object.entries(PROMINENCE_COLORS).map(([key, cls]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={cn("h-3 w-3 rounded", cls)} />
                    <span className="text-xs text-muted-foreground capitalize">{key.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 3 — Cost & Usage */}
        {run?.status === "completed" && clientId && runId && (
          <CostSection clientId={clientId} runId={runId} />
        )}

        {/* Section 4 — Response Analysis (tabbed) */}
        {run?.status === "completed" && prompts && prompts.length > 0 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Response Analysis</CardTitle>
              <CardDescription>Click any row to expand the full response and reasoning.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Tabs defaultValue="all">
                <TabsList className="mb-4">
                  <TabsTrigger value="all">All ({prompts.flatMap((p) => p.results).length})</TabsTrigger>
                  {PLATFORM_ORDER.filter((p) => availablePlatforms.includes(p)).map((platform) => {
                    const count = prompts.flatMap((p) =>
                      p.results.filter((r) => r.platform === platform),
                    ).length
                    return (
                      <TabsTrigger key={platform} value={platform} className="capitalize">
                        {platform} ({count})
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
                <TabsContent value="all">
                  <AnalysisTable prompts={prompts} platform="all" />
                </TabsContent>
                {PLATFORM_ORDER.filter((p) => availablePlatforms.includes(p)).map((platform) => (
                  <TabsContent key={platform} value={platform}>
                    <AnalysisTable prompts={prompts} platform={platform} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Competitor SoV */}
        {summary && summary.competitor_stats.length > 0 && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Competitor Share of Voice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {summary.competitor_stats.slice(0, 8).map((c) => {
                const maxSoV = Math.max(...summary.competitor_stats.map((x) => x.share_of_voice), 0.01)
                return (
                  <div key={c.brand}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{c.brand}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {Math.round(c.share_of_voice * 100)}% · {c.cited_count}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-red-400/80 h-2 rounded-full"
                        style={{ width: `${Math.round((c.share_of_voice / maxSoV) * 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading run data…</div>
        )}
      </div>
    </BlurFade>
  )
}
