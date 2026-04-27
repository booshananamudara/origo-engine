import type { RunRead, RunStatus } from "../lib/types";

const STATUS_STYLES: Record<RunStatus, string> = {
  pending: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-300",
  running: "bg-blue-500/20 text-blue-600 dark:text-blue-300",
  completed: "bg-green-500/20 text-green-600 dark:text-green-300",
  failed: "bg-red-500/20 text-red-600 dark:text-red-300",
};

export function RunProgress({ run }: { run: RunRead }) {
  const pct =
    run.total_prompts > 0
      ? Math.round((run.completed_prompts / run.total_prompts) * 100)
      : 0;

  return (
    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 font-mono">Run ID</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{run.id}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${STATUS_STYLES[run.status]}`}>
          {run.status}
        </span>
      </div>

      <div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          <span>{run.completed_prompts} / {run.total_prompts} tasks</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
          <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {run.error_message && (
        <p className="text-xs text-red-500 dark:text-red-400 bg-red-500/10 rounded p-2">{run.error_message}</p>
      )}
    </div>
  );
}
