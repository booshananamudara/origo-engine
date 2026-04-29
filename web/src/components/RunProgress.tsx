import type { RunRead, RunStatus } from "../lib/types";

const STATUS_STYLES: Record<RunStatus, { pill: string; label: string }> = {
  pending:   { pill: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30", label: "Queued" },
  running:   { pill: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30",         label: "Running" },
  completed: { pill: "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30",     label: "Completed" },
  failed:    { pill: "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30",             label: "Failed" },
};

export function RunProgress({ run }: { run: RunRead }) {
  const pct =
    run.total_prompts > 0
      ? Math.round((run.completed_prompts / run.total_prompts) * 100)
      : 0;

  const style = STATUS_STYLES[run.status];
  const shortId = run.id.slice(0, 8);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {run.status === "running" && (
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
          )}
          <p className="text-xs text-gray-400 font-mono truncate">
            Run <span className="text-gray-600 dark:text-gray-300">{shortId}…</span>
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide shrink-0 ${style.pill}`}>
          {style.label}
        </span>
      </div>

      <div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          <span>{run.completed_prompts} / {run.total_prompts} tasks complete</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {run.error_message && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
          {run.error_message}
        </p>
      )}
    </div>
  );
}
