import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api";
import { RunControls } from "./components/RunControls";
import { RunProgress } from "./components/RunProgress";
import { SummaryCards } from "./components/SummaryCards";
import { PromptTable } from "./components/PromptTable";
import { PromptManager } from "./components/PromptManager";
import type { ClientRead, RunSummaryResponse } from "./lib/types";

const ACTIVE_STATUSES = new Set(["pending", "running"]);

export default function App() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"dashboard" | "prompts">("dashboard");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: api.listClients,
  });

  // Default to the first client once loaded; user can switch via dropdown
  const client: ClientRead | undefined =
    clients?.find((c) => c.id === selectedClientId) ?? clients?.[0];

  useEffect(() => {
    if (clients && clients.length > 0 && selectedClientId === null) {
      // Pre-select Employment Hero if present, otherwise first client
      const hero = clients.find((c) => c.slug === "employment-hero");
      setSelectedClientId((hero ?? clients[0]).id);
    }
  }, [clients, selectedClientId]);

  // When the selected client changes, clear the current run so the new
  // client's latest run gets auto-loaded
  function switchClient(id: string) {
    setSelectedClientId(id);
    setRunId(null);
    setAutoLoaded(false);
    setStartError(null);
    queryClient.removeQueries({ queryKey: ["run"] });
    queryClient.removeQueries({ queryKey: ["latest-run"] });
  }

  // Auto-load the latest completed run on first mount / client switch
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

  // Poll run status while pending/running
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

  // Fetch prompt drill-down once completed
  const { data: runPrompts } = useQuery({
    queryKey: ["run-prompts", runId],
    queryFn: () => api.getRunPrompts(runId!),
    enabled: run?.status === "completed",
  });

  // Start a new run
  const { mutate: startRun } = useMutation({
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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400 text-sm">No clients found. Seed the database first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

        {/* Header row: client selector left, run button right */}
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Monitoring</p>
            {clients && clients.length > 1 ? (
              <select
                value={client.id}
                onChange={(e) => switchClient(e.target.value)}
                className="bg-transparent text-2xl font-bold text-white border-none outline-none
                  cursor-pointer appearance-none pr-6 bg-no-repeat"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 0.25rem center" }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id} className="bg-gray-900 text-white text-base font-normal">
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <h1 className="text-2xl font-bold text-white">{client.name}</h1>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => startRun()}
              disabled={isActive}
              className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-all
                bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700
                disabled:text-gray-400 disabled:cursor-not-allowed text-white"
            >
              {isActive ? "Running…" : "Start New Run"}
            </button>
            {startError && (
              <p className="text-xs text-red-400 max-w-xs text-right">{startError}</p>
            )}
          </div>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 border-b border-gray-800">
          {(["dashboard", "prompts"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg
                ${view === v
                  ? "text-white border-b-2 border-indigo-500"
                  : "text-gray-400 hover:text-gray-200"}`}
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
