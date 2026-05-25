import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { FileJson, FileText, ChevronDown, ChevronRight } from "lucide-react"
import { dashboard } from "@/lib/api"
import type { RunCostSummary } from "@/lib/api"
import { SummaryCards } from "@/components/SummaryCards"
import { PromptTable } from "@/components/PromptTable"
import { PlatformErrorBanner } from "@/components/PlatformErrorBanner"
import { RunProgress } from "@/components/RunProgress"
import { PageHeader } from "@/components/page-header"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function fmtTokens(n: number | null | undefined) {
  if (n == null) return "—"
  return n.toLocaleString()
}

function fmtCost(usd: number | null | undefined) {
  if (usd == null) return "—"
  return `$${usd.toFixed(3)}`
}

function RunCostSection({ runId }: { runId: string }) {
  const [platformOpen, setPlatformOpen] = useState(false)

  const { data: cost } = useQuery<RunCostSummary>({
    queryKey: ["run-costs", runId],
    queryFn: () => dashboard.getRunCosts(runId),
    enabled: !!runId,
  })

  if (!cost || cost.total_cost_usd == null) return null

  const mon = cost.breakdown?.monitoring
  const gen = cost.breakdown?.generation
  const totalCalls = (mon?.api_calls ?? 0) + (gen?.api_calls ?? 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cost &amp; Usage
          </CardTitle>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-[10px] text-muted-foreground">Tokens</p>
              <p className="text-sm font-mono font-semibold">{fmtTokens(cost.total_tokens)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Total Cost</p>
              <p className="text-sm font-mono font-semibold text-primary">{fmtCost(cost.total_cost_usd)}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs py-2">Phase</TableHead>
              <TableHead className="text-xs py-2 text-right">API Calls</TableHead>
              <TableHead className="text-xs py-2 text-right">Tokens</TableHead>
              <TableHead className="text-xs py-2 text-right">Cost</TableHead>
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
                <TableCell className="py-2 text-right font-mono text-xs text-muted-foreground">—</TableCell>
                <TableCell className="py-2 text-right font-mono text-xs">{fmtCost(gen.cost_usd)}</TableCell>
              </TableRow>
            )}
            <TableRow className="font-semibold">
              <TableCell className="py-2">Total</TableCell>
              <TableCell className="py-2 text-right font-mono text-xs">{totalCalls}</TableCell>
              <TableCell className="py-2 text-right font-mono text-xs">{fmtTokens(cost.total_tokens)}</TableCell>
              <TableCell className="py-2 text-right font-mono text-xs text-primary">{fmtCost(cost.total_cost_usd)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {Object.keys(cost.cost_by_platform).length > 0 && (
          <Collapsible open={platformOpen} onOpenChange={setPlatformOpen}>
            <CollapsibleTrigger asChild>
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                {platformOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Per-platform breakdown
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-2">Platform</TableHead>
                    <TableHead className="text-xs py-2 text-right">Tokens</TableHead>
                    <TableHead className="text-xs py-2 text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(cost.cost_by_platform).map(([platform, data]) => (
                    <TableRow key={platform}>
                      <TableCell className="py-2 capitalize">{platform}</TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs">{fmtTokens(data.tokens)}</TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs">{fmtCost(data.cost_usd)}</TableCell>
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

const ACTIVE = new Set(["pending", "running"])

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const [downloading, setDownloading] = useState<"json" | "pdf" | null>(null)

  const { data: runData, isLoading } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => dashboard.getRunDetail(runId!),
    enabled: !!runId,
    refetchInterval: (q) => {
      const s = q.state.data?.run?.status
      return s && ACTIVE.has(s) ? 2000 : false
    },
  })

  const { data: prompts } = useQuery({
    queryKey: ["run-prompts", runId],
    queryFn: () => dashboard.getRunPrompts(runId!),
    enabled: runData?.run?.status === "completed",
  })

  async function handleDownload(format: "json" | "pdf") {
    if (!runId) return
    setDownloading(format)
    try {
      const blob = format === "json"
        ? await dashboard.downloadRunJson(runId)
        : await dashboard.downloadRunPdf(runId)
      const run = runData?.run
      const base = (run as Record<string, unknown> | undefined)?.display_id ?? runId.slice(0, 8)
      triggerDownload(blob, `${base}-report.${format}`)
    } finally {
      setDownloading(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!runData) {
    return <div className="text-center py-20 text-muted-foreground">Run not found.</div>
  }

  const run = runData.run
  const displayId = (run as unknown as { display_id?: string }).display_id ?? run.id.slice(0, 8) + "…"

  return (
    <BlurFade>
      <PageHeader
        breadcrumbs={[
          { label: "Run History", href: "/dashboard/runs" },
          { label: displayId },
        ]}
        title={`Run ${displayId}`}
        actions={
          run.status === "completed" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload("json")}
                disabled={!!downloading}
                className="gap-2"
              >
                <FileJson className="h-3.5 w-3.5" />
                {downloading === "json" ? "…" : "JSON"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload("pdf")}
                disabled={!!downloading}
                className="gap-2"
              >
                <FileText className="h-3.5 w-3.5" />
                {downloading === "pdf" ? "…" : "PDF"}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {ACTIVE.has(run.status) && <RunProgress run={run} />}

        {Object.keys(runData.platform_errors ?? {}).length > 0 && (
          <PlatformErrorBanner errors={runData.platform_errors} />
        )}

        {run.status === "completed" && (
          <>
            <SummaryCards summary={runData} />
            <RunCostSection runId={run.id} />
            {prompts && prompts.length > 0 && <PromptTable prompts={prompts} />}
          </>
        )}
      </div>
    </BlurFade>
  )
}
