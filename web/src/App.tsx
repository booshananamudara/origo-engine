import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api";
import { useTheme } from "./lib/theme";
import { RunProgress } from "./components/RunProgress";
import { SummaryCards } from "./components/SummaryCards";
import { PromptTable } from "./components/PromptTable";
import { PromptManager } from "./components/PromptManager";
import { PlatformErrorBanner } from "./components/PlatformErrorBanner";
import type { RunSummaryResponse } from "./lib/types";

const ACTIVE_STATUSES = new Set(["pending", "running"]);

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function App() {
  const { dark, toggle: toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"dashboard" | "prompts">("dashboard");
  const [runId, setRunId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: api.listClients,
  });
  const client = clients?.[0];

  // Auto-load the latest completed run on first mount (once only)
  const { data: latestRun, isSuccess: latestRunFetched } = useQuery({
    queryKey: ["latest-run", client?.id],
    queryFn: () => api.getLatestRun(client!.id),
    enabled: client != null && !autoLoaded,
  });
  useEffect(() => {
    if (!latestRunFetched) return;
    setAutoLoaded(true);
    if (latestRun?.id) setRunId(latestRun.id);
  }, [latestRunFetched, latestRun?.id]);

  const { data: runData } = useQuery<RunSummaryResponse>({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId!),
    enabled: runId != null,
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status != null && ACTIVE_STATUSES.has(status) ? 2000 : false;
    },
  });

  const run = runData?.run;
  const isActive = run != null && ACTIVE_STATUSES.has(run.status);

  const { data: runPrompts } = useQuery({
    queryKey: ["run-prompts", runId],
    queryFn: () => api.getRunPrompts(runId!),
    enabled: run?.status === "completed",
  });

  const { mutate: startRun, isPending: isStarting } = useMutation({
    mutationFn: () => api.createRun(client!.id),
    onMutate: () => {
      setStartError(null);
      setAutoLoaded(true);
      setRunId(null);
      queryClient.removeQueries({ queryKey: ["run"] });
      queryClient.removeQueries({ queryKey: ["run-prompts"] });
    },
    onSuccess: (newRun) => setRunId(newRun.id),
    onError: (err: Error) => setStartError(err.message),
  });

  if (clientsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-4">
        <p className="text-red-500 dark:text-red-400 text-sm text-center">No clients found. Seed the database first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white transition-colors duration-200">
      {/* Top nav bar */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none">
                <circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/>
                <circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/>
                <line x1="6" y1="6.5" x2="10" y2="11" stroke="white" strokeWidth="1.5"/>
                <line x1="18" y1="6.5" x2="14" y2="11" stroke="white" strokeWidth="1.5"/>
                <line x1="6" y1="17.5" x2="10" y2="13" stroke="white" strokeWidth="1.5"/>
                <line x1="18" y1="17.5" x2="14" y2="13" stroke="white" strokeWidth="1.5"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none hidden sm:block">GEO Monitor</p>
              <h1 className="text-sm sm:text-base font-semibold truncate">{client.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300
                hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>

            <button
              onClick={() => startRun()}
              disabled={isActive || isStarting}
              className="px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all
                bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-200 dark:disabled:bg-gray-700
                disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed text-white
                flex items-center gap-1.5"
            >
              {isActive || isStarting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span className="hidden sm:inline">Running…</span>
                  <span className="sm:hidden">Running</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M5 3l14 9-14 9V3z"/>
                  </svg>
                  <span className="hidden sm:inline">Start New Run</span>
                  <span className="sm:hidden">Run</span>
                </>
              )}
            </button>
          </div>
        </div>

        {startError && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-2">
            <p className="text-xs text-red-500 dark:text-red-400">{startError}</p>
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* View tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
          {(["dashboard", "prompts"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg
                ${view === v
                  ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              {v === "dashboard" ? "Dashboard" : "Manage Prompts"}
            </button>
          ))}
        </div>

        {view === "dashboard" ? (
          <>
            {run && (isActive || run.status === "failed") && <RunProgress run={run} />}
            {runData && run?.status === "completed" && (
              <>
                {Object.keys(runData.platform_errors ?? {}).length > 0 && (
                  <PlatformErrorBanner errors={runData.platform_errors} />
                )}
                <SummaryCards summary={runData} />
                {runPrompts && runPrompts.length > 0 && <PromptTable prompts={runPrompts} />}
              </>
            )}
            {/* Empty state: auto-load finished but no run exists yet */}
            {autoLoaded && !runId && !isStarting && (
              <div className="flex flex-col items-center justify-center py-20 sm:py-28 text-center gap-4 px-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className="text-indigo-500">
                    <path d="M5 3l14 9-14 9V3z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-800 dark:text-gray-100">No analysis yet</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                    Tap <span className="font-medium text-indigo-600 dark:text-indigo-400">Run</span> in the top bar to analyse how{" "}
                    <span className="font-medium">{client.name}</span> appears across AI platforms.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <PromptManager clientId={client.id} />
        )}
      </div>
    </div>
  );
}
