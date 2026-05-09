import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { dashboard } from "../lib/api";
import { SummaryCards } from "./SummaryCards";
import { PromptTable } from "./PromptTable";
import { PlatformErrorBanner } from "./PlatformErrorBanner";
import { RunProgress } from "./RunProgress";

const ACTIVE = new Set(["pending", "running"]);

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();

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
    enabled: runData?.run?.status === "completed",
  });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link to="/dashboard/runs" className="hover:text-gray-800 dark:hover:text-gray-200">← Run History</Link>
        <span>/</span>
        <span className="font-mono text-gray-700 dark:text-gray-300">{run.id.slice(0, 8)}…</span>
      </div>

      {ACTIVE.has(run.status) && <RunProgress run={run} />}

      {Object.keys(runData.platform_errors ?? {}).length > 0 && (
        <PlatformErrorBanner errors={runData.platform_errors} />
      )}

      {run.status === "completed" && (
        <>
          <SummaryCards summary={runData} />
          {prompts && prompts.length > 0 && <PromptTable prompts={prompts} />}
        </>
      )}
    </div>
  );
}
