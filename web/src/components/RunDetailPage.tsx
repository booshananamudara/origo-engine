import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import { dashboard } from "../lib/api";
import type { RunCostSummary } from "../lib/api";
import { SummaryCards } from "./SummaryCards";
import { PromptTable } from "./PromptTable";
import { PlatformErrorBanner } from "./PlatformErrorBanner";
import { RunProgress } from "./RunProgress";

function fmtTokens(n: number | null | undefined) {
  if (n == null) return "-";
  return n.toLocaleString();
}
function fmtCost(usd: number | null | undefined) {
  if (usd == null) return "-";
  return `$${usd.toFixed(3)}`;
}

function RunCostSection({ runId }: { runId: string }) {
  const [showPlatform, setShowPlatform] = useState(false);
  const { data: cost } = useQuery<RunCostSummary>({
    queryKey: ["run-costs", runId],
    queryFn: () => dashboard.getRunCosts(runId),
    enabled: !!runId,
  });

  if (!cost || cost.total_cost_usd == null) return null;

  const mon = cost.breakdown?.monitoring;
  const ana = cost.breakdown?.analysis;
  const gen = cost.breakdown?.generation;
  const totalCalls = (mon?.api_calls ?? 0) + (ana?.api_calls ?? 0) + (gen?.api_calls ?? 0);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost &amp; Usage</h3>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-[10px] text-gray-400">Tokens</p>
            <p className="text-sm font-mono font-semibold text-gray-800 dark:text-white">{fmtTokens(cost.total_tokens)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400">Total Cost</p>
            <p className="text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-300">{fmtCost(cost.total_cost_usd)}</p>
          </div>
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
            <th className="text-left py-1.5 pr-4">Phase</th>
            <th className="text-right py-1.5 px-3">API Calls</th>
            <th className="text-right py-1.5 px-3">Tokens</th>
            <th className="text-right py-1.5 pl-3">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {mon && (
            <tr>
              <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">Response collection</td>
              <td className="text-right px-3 font-mono text-gray-500">{mon.api_calls}</td>
              <td className="text-right px-3 font-mono text-gray-500">{fmtTokens(mon.tokens)}</td>
              <td className="text-right pl-3 font-mono text-gray-700 dark:text-gray-300">{fmtCost(mon.cost_usd)}</td>
            </tr>
          )}
          {ana && (
            <tr>
              <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">Analysis</td>
              <td className="text-right px-3 font-mono text-gray-500">{ana.api_calls}</td>
              <td className="text-right px-3 font-mono text-gray-500">{fmtTokens(ana.tokens)}</td>
              <td className="text-right pl-3 font-mono text-gray-700 dark:text-gray-300">{fmtCost(ana.cost_usd)}</td>
            </tr>
          )}
          {gen && (
            <tr>
              <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">Recommendations</td>
              <td className="text-right px-3 font-mono text-gray-500">{gen.api_calls}</td>
              <td className="text-right px-3 font-mono text-gray-500">{fmtTokens(gen.tokens)}</td>
              <td className="text-right pl-3 font-mono text-gray-700 dark:text-gray-300">{fmtCost(gen.cost_usd)}</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td className="py-2 pr-4 text-gray-900 dark:text-white">Total</td>
            <td className="text-right px-3 font-mono text-gray-600 dark:text-gray-300">{totalCalls}</td>
            <td className="text-right px-3 font-mono text-gray-600 dark:text-gray-300">{fmtTokens(cost.total_tokens)}</td>
            <td className="text-right pl-3 font-mono text-indigo-600 dark:text-indigo-300">{fmtCost(cost.total_cost_usd)}</td>
          </tr>
        </tbody>
      </table>
      {Object.keys(cost.cost_by_platform).length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowPlatform((v) => !v)} className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            {showPlatform
              ? <KeyboardArrowDownRoundedIcon style={{ fontSize: 14 }} />
              : <KeyboardArrowRightRoundedIcon style={{ fontSize: 14 }} />} Per-platform
          </button>
          {showPlatform && (
            <table className="w-full text-xs mt-2">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-1.5 pr-4">Platform</th>
                  <th className="text-right py-1.5 px-3">Tokens</th>
                  <th className="text-right py-1.5 pl-3">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {Object.entries(cost.cost_by_platform).map(([platform, data]) => (
                  <tr key={platform}>
                    <td className="py-1.5 pr-4 capitalize text-gray-700 dark:text-gray-300">{platform}</td>
                    <td className="text-right px-3 font-mono text-gray-500">{fmtTokens(data.tokens)}</td>
                    <td className="text-right pl-3 font-mono text-gray-700 dark:text-gray-300">{fmtCost(data.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const ACTIVE = new Set(["pending", "running"]);
// Terminal statuses that carry viewable results (partial = finished with drops).
const HAS_RESULTS = new Set(["completed", "partial"]);

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [downloading, setDownloading] = useState<"json" | "pdf" | null>(null);

  const { data: runData, isLoading } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => dashboard.getRunDetail(runId!),
    enabled: !!runId,
    refetchInterval: (q) => {
      const s = q.state.data?.run?.status;
      return s && ACTIVE.has(s) ? 2000 : false;
    },
  });

  const { data: prompts } = useQuery({
    queryKey: ["run-prompts", runId],
    queryFn: () => dashboard.getRunPrompts(runId!),
    enabled: HAS_RESULTS.has(runData?.run?.status ?? ""),
  });

  async function handleDownload(format: "json" | "pdf") {
    if (!runId) return;
    setDownloading(format);
    try {
      const blob = format === "json"
        ? await dashboard.downloadRunJson(runId)
        : await dashboard.downloadRunPdf(runId);
      const run = runData?.run;
      const base = (run as any)?.display_id ?? runId.slice(0, 8);
      triggerDownload(blob, `${base}-report.${format}`);
    } finally {
      setDownloading(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!runData) {
    return (
      <div className="text-center py-20 text-gray-500">Run not found.</div>
    );
  }

  const run = runData.run;
  const displayId = (run as any).display_id ?? run.id.slice(0, 8) + "...";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Link to="/dashboard/runs" className="inline-flex items-center gap-0.5 hover:text-gray-800 dark:hover:text-gray-200"><ArrowBackRoundedIcon style={{ fontSize: 13 }} /> Run History</Link>
          <span>/</span>
          <span className="font-mono text-gray-700 dark:text-gray-300">{displayId}</span>
        </div>

        {HAS_RESULTS.has(run.status) && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownload("json")}
              disabled={!!downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {downloading === "json" ? "..." : <><FileDownloadRoundedIcon style={{ fontSize: 14 }} /> JSON</>}
            </button>
            <button
              onClick={() => handleDownload("pdf")}
              disabled={!!downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {downloading === "pdf" ? "..." : <><FileDownloadRoundedIcon style={{ fontSize: 14 }} /> PDF</>}
            </button>
          </div>
        )}
      </div>

      {ACTIVE.has(run.status) && <RunProgress run={run} />}

      {Object.keys(runData.platform_errors ?? {}).length > 0 && (
        <PlatformErrorBanner errors={runData.platform_errors} />
      )}

      {HAS_RESULTS.has(run.status) && (
        <>
          <SummaryCards summary={runData} />
          <RunCostSection runId={run.id} />
          {prompts && prompts.length > 0 && <PromptTable prompts={prompts} />}
        </>
      )}
    </div>
  );
}
