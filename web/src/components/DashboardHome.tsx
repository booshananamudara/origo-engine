import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { dashboard } from "../lib/api";
import { RunProgress } from "./RunProgress";
import { SummaryCards } from "./SummaryCards";
import { PromptTable } from "./PromptTable";
import { PlatformErrorBanner } from "./PlatformErrorBanner";
import type { DashboardSummary, RunSummaryResponse } from "../lib/types";

const ACTIVE = new Set(["pending", "running"]);

function timeUntil(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime() - Date.now();
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem > 0 ? `in ${h}h ${rem}m` : `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

function NextRunBadge({ summary }: { summary: DashboardSummary }) {
  const { schedule_enabled, schedule_cadence, next_scheduled_run_at } = summary;

  if (!schedule_enabled || schedule_cadence === "manual") {
    return null; // Don't show anything if not scheduled
  }

  const rel = timeUntil(next_scheduled_run_at);
  if (!rel) return null;

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
      <span className="text-xs text-gray-500 dark:text-gray-400">
        Next auto-run <span className="text-indigo-500 dark:text-indigo-400 font-medium">{rel}</span>
      </span>
    </div>
  );
}

function VisibilityScore({ score }: { score: number | null }) {
  if (score == null) return null;
  const color =
    score >= 60 ? "text-green-600 dark:text-green-400" :
    score >= 35 ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400";
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Visibility Score</p>
      <div className="flex items-end gap-1">
        <span className={`text-4xl font-bold ${color}`}>{score.toFixed(0)}</span>
        <span className="text-lg text-gray-400 mb-0.5">/100</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Weighted: citation 40% · primary 25% · sentiment 20% · platform coverage 15%
      </p>
    </div>
  );
}

export function DashboardHome() {
  const [runId, setRunId] = useState<string | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  // Auto-load latest run once on mount
  const { data: latestRun, isSuccess: latestFetched } = useQuery({
    queryKey: ["latest-run"],
    queryFn: dashboard.getLatestRun,
    enabled: !autoLoaded,
  });

  useEffect(() => {
    if (!latestFetched) return;
    setAutoLoaded(true);
    if (latestRun?.run?.id) setRunId(latestRun.run.id);
  }, [latestFetched, latestRun?.run?.id]);

  // Poll run status while active
  const { data: runData } = useQuery<RunSummaryResponse>({
    queryKey: ["run", runId],
    queryFn: () => dashboard.getRunDetail(runId!),
    enabled: runId != null,
    refetchInterval: (q) => {
      const s = q.state.data?.run?.status;
      return s && ACTIVE.has(s) ? 2000 : false;
    },
  });

  const run = runData?.run;

  const { data: runPrompts } = useQuery({
    queryKey: ["run-prompts", runId],
    queryFn: () => dashboard.getRunPrompts(runId!),
    enabled: run?.status === "completed",
  });

  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: dashboard.getSummary,
    refetchInterval: 60_000, // refresh every minute so next-run countdown stays current
  });

  if (run && ACTIVE.has(run.status)) {
    return (
      <div className="space-y-6">
        <RunProgress run={run} />
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Analysis in progress — results will appear automatically when complete.
        </p>
      </div>
    );
  }

  if (run?.status === "failed") {
    return (
      <div className="space-y-4">
        <RunProgress run={run} />
      </div>
    );
  }

  if (run?.status === "completed" && runData) {
    return (
      <div className="space-y-6">
        {/* Visibility + summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <VisibilityScore score={summary?.visibility_score ?? null} />
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Overview</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total Prompts", value: summary?.total_prompts ?? "—" },
                { label: "Total Runs", value: summary?.total_runs ?? "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                </div>
              ))}
            </div>
            {summary && <NextRunBadge summary={summary} />}
            <Link
              to="runs"
              className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View all runs →
            </Link>
          </div>
        </div>

        {Object.keys(runData.platform_errors ?? {}).length > 0 && (
          <PlatformErrorBanner errors={runData.platform_errors} />
        )}

        <SummaryCards summary={runData} />

        {runPrompts && runPrompts.length > 0 && (
          <PromptTable prompts={runPrompts} />
        )}
      </div>
    );
  }

  // Empty state — no completed runs
  if (autoLoaded && !runId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4 px-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" className="text-indigo-500">
            <path d="M5 3l14 9-14 9V3z"/>
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Your AI visibility monitoring is being set up
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
            Your first report will appear here once the initial analysis runs.
          </p>
          {summary && <NextRunBadge summary={summary} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
