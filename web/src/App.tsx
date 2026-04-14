import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api";
import { RunControls } from "./components/RunControls";
import { RunProgress } from "./components/RunProgress";
import { SummaryCards } from "./components/SummaryCards";
import { PromptTable } from "./components/PromptTable";
import type { RunSummaryResponse } from "./lib/types";

const ACTIVE_STATUSES = new Set(["pending", "running"]);

export default function App() {
  const queryClient = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Load the first client (demo mode — single tenant)
  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: api.listClients,
  });
  const client = clients?.[0];

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
  const { data: prompts } = useQuery({
    queryKey: ["prompts", runId],
    queryFn: () => api.getRunPrompts(runId!),
    enabled: run?.status === "completed",
  });

  // Start a new run
  const { mutate: startRun } = useMutation({
    mutationFn: () => api.createRun(client!.id),
    onMutate: () => {
      setStartError(null);
      setRunId(null);
      // Clear any previous run data
      queryClient.removeQueries({ queryKey: ["run"] });
      queryClient.removeQueries({ queryKey: ["prompts"] });
    },
    onSuccess: (newRun) => {
      setRunId(newRun.id);
    },
    onError: (err: Error) => {
      setStartError(err.message);
    },
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
        <p className="text-red-400 text-sm">
          No clients found. Seed the database first.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <RunControls
          clientName={client.name}
          isRunning={isActive}
          onStart={() => startRun()}
          error={startError}
        />

        {/* Active run progress */}
        {run && (isActive || run.status === "failed") && (
          <RunProgress run={run} />
        )}

        {/* Completed: summary + prompt drill-down */}
        {runData && run?.status === "completed" && (
          <>
            <SummaryCards summary={runData} />
            {prompts && prompts.length > 0 && (
              <PromptTable prompts={prompts} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
