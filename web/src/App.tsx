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

  // Auto-load the latest completed run on first mount
  const { data: latestRun } = useQuery({
    queryKey: ["latest-run", client?.id],
    queryFn: () => api.getLatestRun(client!.id),
    enabled: client != null && !autoLoaded,
  });
  useEffect(() => {
    if (latestRun?.id && !autoLoaded) {
      setAutoLoaded(true);
      setRunId(latestRun.id);
    }
  }, [latestRun?.id, autoLoaded]);

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
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <p className="text-red-500 dark:text-red-400 text-sm">No clients found. Seed the database first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Monitoring</p>
            <h1 className="text-2xl font-bold">{client.name}</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300
                hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>

            {/* Start new run */}
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => startRun()}
                disabled={isActive || isStarting}
                className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-all
                  bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-200 dark:disabled:bg-gray-700
                  disabled:text-gray-400 dark:disabled:text-gray-400 disabled:cursor-not-allowed text-white"
              >
                {isActive ? "Running…" : "Start New Run"}
              </button>
              {startError && (
                <p className="text-xs text-red-500 dark:text-red-400 max-w-xs text-right">{startError}</p>
              )}
            </div>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
          {(["dashboard", "prompts"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg
                ${view === v
                  ? "text-indigo-600 dark:text-white border-b-2 border-indigo-500"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              {v === "dashboard" ? "Run Dashboard" : "Manage Prompts"}
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
          </>
        ) : (
          <PromptManager clientId={client.id} />
        )}
      </div>
    </div>
  );
}
