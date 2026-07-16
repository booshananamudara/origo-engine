import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { useParams, useNavigate } from "react-router-dom";
import { recommendations } from "../lib/api";
import type { ClientRecommendationListItem, ClientRecommendationDetail } from "../lib/api";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30",
  approved: "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30",
  revision_requested: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30",
  implemented: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30",
};

const PRIORITY_STYLE: Record<string, string> = {
  high: "text-red-600 dark:text-red-400 font-semibold",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-gray-500",
};

const TYPE_LABEL: Record<string, string> = {
  content_brief: "Content Brief",
  schema_markup: "Schema Markup",
  llms_txt: "LLMs.txt",
  on_page_optimization: "On-Page Optimization",
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ContentSection({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      {Object.entries(content).map(([key, value]) => (
        <div key={key}>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            {key.replace(/_/g, " ")}
          </p>
          {Array.isArray(value) ? (
            <ul className="list-disc list-inside space-y-1">
              {value.map((item, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-gray-300">{String(item)}</li>
              ))}
            </ul>
          ) : typeof value === "object" && value !== null ? (
            <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto">
              {JSON.stringify(value, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{String(value)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function RecDetail({ recId, onClose }: { recId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<ClientRecommendationDetail>({
    queryKey: ["client-rec", recId],
    queryFn: () => recommendations.get(recId),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl h-screen overflow-y-auto bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-5 py-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
            {data?.title ?? "Loading..."}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <CloseRoundedIcon style={{ fontSize: 16 }} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data ? (
          <div className="p-5 space-y-5 flex-1">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[data.status] ?? ""}`}>
                {data.status.replace(/_/g, " ")}
              </span>
              <span className={`text-xs ${PRIORITY_STYLE[data.priority] ?? ""}`}>
                {data.priority.toUpperCase()} PRIORITY
              </span>
              <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                {TYPE_LABEL[data.type] ?? data.type}
              </span>
              {data.platform && (
                <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded capitalize">
                  {data.platform}
                </span>
              )}
            </div>

            {data.target_query && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Target Query</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{data.target_query}"</p>
              </div>
            )}

            {/* Content sections */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Recommendation</p>
              <ContentSection content={data.content} />
            </div>

            {/* History */}
            {data.history.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Activity</p>
                <div className="space-y-2">
                  {data.history.map((h) => (
                    <div key={h.id} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                      <div>
                        <span className="text-gray-700 dark:text-gray-300">
                          {h.old_status && (
                            <>
                              {h.old_status} <ArrowForwardRoundedIcon style={{ fontSize: 11 }} />{" "}
                            </>
                          )}
                          <span className="font-semibold">{h.new_status}</span>
                        </span>
                        <span className="text-gray-400 ml-2">{relTime(h.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400">Created {relTime(data.created_at)}</p>
          </div>
        ) : (
          <div className="p-5 text-sm text-gray-500">Recommendation not found.</div>
        )}
      </div>
    </div>
  );
}

export function RecommendationsPage() {
  const { recId } = useParams<{ recId?: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const { data: summary } = useQuery({
    queryKey: ["client-rec-summary"],
    queryFn: () => recommendations.getSummary(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["client-recs", page, statusFilter, priorityFilter],
    queryFn: () => recommendations.list({
      page,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
    }),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  function openRec(id: string) {
    navigate(`/dashboard/recommendations/${id}`);
  }

  function closeRec() {
    navigate("/dashboard/recommendations");
  }

  return (
    <div className="space-y-5">
      {recId && <RecDetail recId={recId} onClose={closeRec} />}

      {/* Header + summary */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Recommendations
          {data && <span className="text-sm font-normal text-gray-500 ml-2">({data.total})</span>}
        </h2>
      </div>

      {summary && summary.pending_high_priority > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          <span className="font-semibold">{summary.pending_high_priority}</span> high-priority recommendation{summary.pending_high_priority !== 1 ? "s" : ""} pending review.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="revision_requested">Revision Requested</option>
          <option value="implemented">Implemented</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : !data?.items.length ? (
          <div className="p-10 text-center text-gray-400 text-sm">No recommendations yet.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.items.map((rec: ClientRecommendationListItem) => (
              <button
                key={rec.id}
                onClick={() => openRec(rec.id)}
                className="w-full text-left px-5 py-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[rec.status] ?? ""}`}>
                        {rec.status.replace(/_/g, " ")}
                      </span>
                      <span className={`text-xs ${PRIORITY_STYLE[rec.priority] ?? ""}`}>
                        {rec.priority}
                      </span>
                      <span className="text-xs text-gray-400">{TYPE_LABEL[rec.type] ?? rec.type}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{rec.title}</p>
                    {rec.target_query && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">"{rec.target_query}"</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                    {relTime(rec.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-5 py-3 flex items-center justify-between text-sm text-gray-500 border-t border-gray-200 dark:border-gray-800">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="inline-flex items-center gap-0.5 disabled:opacity-40 hover:text-gray-900 dark:hover:text-white transition-colors">
              <ChevronLeftRoundedIcon style={{ fontSize: 16 }} /> Prev
            </button>
            <span className="text-xs">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="inline-flex items-center gap-0.5 disabled:opacity-40 hover:text-gray-900 dark:hover:text-white transition-colors">
              Next <ChevronRightRoundedIcon style={{ fontSize: 16 }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
