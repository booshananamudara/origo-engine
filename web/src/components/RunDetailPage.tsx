import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { dashboard } from "../lib/api";
import { SummaryCards } from "./SummaryCards";
import { PromptTable } from "./PromptTable";
import { PlatformErrorBanner } from "./PlatformErrorBanner";
import { RunProgress } from "./RunProgress";

const ACTIVE = new Set(["pending", "running"]);

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
    enabled: runData?.run?.status === "completed",
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
  const displayId = (run as any).display_id ?? run.id.slice(0, 8) + "…";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Link to="/dashboard/runs" className="hover:text-gray-800 dark:hover:text-gray-200">← Run History</Link>
          <span>/</span>
          <span className="font-mono text-gray-700 dark:text-gray-300">{displayId}</span>
        </div>

        {run.status === "completed" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownload("json")}
              disabled={!!downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {downloading === "json" ? "…" : "↓ JSON"}
            </button>
            <button
              onClick={() => handleDownload("pdf")}
              disabled={!!downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {downloading === "pdf" ? "…" : "↓ PDF"}
            </button>
          </div>
        )}
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
