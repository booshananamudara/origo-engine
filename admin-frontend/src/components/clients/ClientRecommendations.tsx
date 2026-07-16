import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { recommendationsApi } from "../../api/client";
import type {
  RecommendationGroupItem,
  RecommendationListItem,
  RecommendationPriority,
  RecommendationStatus,
  RecommendationType,
} from "../../types";

// ── Constants (mirrors RecommendationList styling) ────────────────────────────

const TYPE_LABELS: Record<RecommendationType, string> = {
  content_brief: "Content brief",
  schema_markup: "Schema Markup",
  llms_txt: "llms.txt",
  on_page_optimization: "On-Page",
  authority_building: "Authority",
};

const STATUS_LABELS: Record<RecommendationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  revision_requested: "Revision",
  implemented: "Implemented",
  expired: "Expired",
};

const STATUS_COLORS: Record<RecommendationStatus, string> = {
  pending:            "bg-blue-50 text-blue-700 border-blue-200",
  approved:           "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected:           "bg-red-50 text-red-700 border-red-200",
  revision_requested: "bg-orange-50 text-orange-700 border-orange-200",
  implemented:        "bg-purple-50 text-purple-700 border-purple-200",
  expired:            "bg-gray-100 text-gray-500 border-gray-200",
};

// Render order for the per-group status count chips
const STATUS_ORDER: RecommendationStatus[] = [
  "pending", "approved", "revision_requested", "rejected", "implemented", "expired",
];

const PLATFORM_BADGE: Record<string, string> = {
  gemini:     "bg-amber-100 text-amber-800",
  perplexity: "bg-blue-100 text-blue-800",
  openai:     "bg-emerald-100 text-emerald-800",
  anthropic:  "bg-purple-100 text-purple-800",
};

const PRIORITY_DOT: Record<RecommendationPriority, string> = {
  high: "bg-red-500", medium: "bg-amber-400", low: "bg-blue-400",
};

const PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  high: "High", medium: "Medium", low: "Low",
};

type ViewMode = "run" | "prompt" | "all";

// The list endpoint defaults to status=pending when the param is absent, so
// "All statuses" must be requested explicitly.
const ALL_STATUSES = "pending,approved,rejected,revision_requested,implemented,expired";

// ── Small helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: RecommendationStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${STATUS_COLORS[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function TypeBadge({ type }: { type: RecommendationType }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return <span className="text-gray-400 text-xs">—</span>;
  const cls = PLATFORM_BADGE[platform.toLowerCase()] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {platform.charAt(0).toUpperCase() + platform.slice(1)}
    </span>
  );
}

function PriorityCell({ priority }: { priority: RecommendationPriority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[priority]}`} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

// Compact per-status counts shown in group headers (nonzero only)
function StatusCountChips({ byStatus }: { byStatus: Record<string, number> }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STATUS_ORDER.filter((s) => (byStatus[s] ?? 0) > 0).map((s) => (
        <span key={s} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap ${STATUS_COLORS[s]}`}>
          {byStatus[s]} {STATUS_LABELS[s].toLowerCase()}
        </span>
      ))}
    </div>
  );
}

function StatCard({ dot, label, value, sub }: {
  dot: string; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <p className="text-xs text-gray-500 font-medium">{label}</p>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function PillGroup({ options, value, onChange }: {
  options: { label: string; value: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-0 border border-gray-200 rounded-lg overflow-hidden bg-white">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            i > 0 ? "border-l border-gray-200" : ""
          } ${
            value === opt.value ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {opt.label}
          {opt.count != null && opt.count > 0 && (
            <span className={`ml-1 ${value === opt.value ? "text-gray-300" : "text-gray-400"}`}>{opt.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Recommendation rows (shared by grouped + flat views) ──────────────────────

function RecRows({ items, clientId, showRun, showPromptContext }: {
  items: RecommendationListItem[];
  clientId: string;
  showRun?: boolean;          // flat view: which run produced the rec
  showPromptContext?: boolean; // by-run view: which prompt the rec targets
}) {
  const navigate = useNavigate();
  const open = (rec: RecommendationListItem) =>
    navigate(`/recommendations/${rec.id}?client_id=${clientId}&from=client`);

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</th>
              {showRun && (
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Run</th>
              )}
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Platform</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Priority</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((rec) => (
              <tr key={rec.id} onClick={() => open(rec)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 whitespace-nowrap"><TypeBadge type={rec.type} /></td>
                <td className="px-4 py-3 max-w-xs">
                  <p className="text-gray-900 font-medium truncate">{rec.title}</p>
                  {(showPromptContext ? rec.prompt_text ?? rec.target_query : rec.target_query) && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {showPromptContext ? rec.prompt_text ?? rec.target_query : rec.target_query}
                    </p>
                  )}
                </td>
                {showRun && (
                  <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">
                    {rec.run_id ? (
                      <span className="font-mono text-xs text-gray-500">
                        {rec.run_display_id ?? rec.run_id.slice(0, 8) + "…"}
                      </span>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                )}
                <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap"><PlatformBadge platform={rec.platform} /></td>
                <td className="px-4 py-3 hidden md:table-cell"><PriorityCell priority={rec.priority} /></td>
                <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={rec.status} /></td>
                <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">
                  <span className="text-gray-400 text-xs">{fmtDate(rec.created_at)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden divide-y divide-gray-100">
        {items.map((rec) => (
          <div key={rec.id} onClick={() => open(rec)} className="px-4 py-3 space-y-1.5 cursor-pointer hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <TypeBadge type={rec.type} />
              <StatusBadge status={rec.status} />
            </div>
            <p className="text-sm text-gray-900 font-medium">{rec.title}</p>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <PriorityCell priority={rec.priority} />
              {rec.platform && <PlatformBadge platform={rec.platform} />}
              <span className="ml-auto">{fmtDate(rec.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Expandable group card ─────────────────────────────────────────────────────

function GroupCard({ group, clientId, view, status }: {
  group: RecommendationGroupItem;
  clientId: string;
  view: "run" | "prompt";
  status: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["client-rec-group-items", clientId, view, group.key, status],
    queryFn: () =>
      recommendationsApi.list(clientId, {
        status: status || ALL_STATUSES,
        run_id: view === "run" ? group.key ?? undefined : undefined,
        prompt_id: view === "prompt" ? group.key ?? undefined : undefined,
        per_page: 100,
        sort_by: "created_at",
        sort_order: "desc",
      }),
    // Unlinked bucket (key=null) can't be fetched via run_id/prompt_id filters;
    // its items are still reachable through the "All" view.
    enabled: expanded && group.key != null,
  });

  const isRun = view === "run";
  const title = group.key == null
    ? (isRun ? "No linked run" : "Run-level recommendations")
    : isRun
      ? (group.label ?? group.key.slice(0, 8) + "…")
      : (group.label ?? "Untitled prompt");

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header — expand toggle and "Open run" link are siblings, not nested */}
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isRun ? (
                <span className="font-mono text-xs font-semibold text-gray-700">{title}</span>
              ) : (
                <span className="text-sm font-medium text-gray-900 truncate max-w-md" title={group.label ?? undefined}>
                  {title}
                </span>
              )}
              {!isRun && group.sublabel && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 whitespace-nowrap">
                  {group.sublabel}
                </span>
              )}
              {group.key == null && (
                <span className="text-[11px] text-gray-400">
                  {isRun ? "run was deleted" : "llms.txt & authority briefs cover the whole run"}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {isRun
                ? `Run of ${fmtDate(group.group_created_at)} · ${group.total} recommendation${group.total !== 1 ? "s" : ""}`
                : `${group.total} recommendation${group.total !== 1 ? "s" : ""} · last ${fmtDate(group.last_rec_at)}`}
            </p>
          </div>
        </button>
        <div className="hidden sm:block shrink-0">
          <StatusCountChips byStatus={group.by_status} />
        </div>
        {isRun && group.key != null && (
          <Link
            to={`/clients/${clientId}/runs/${group.key}`}
            className="hidden sm:inline text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
          >
            Open run →
          </Link>
        )}
      </div>

      {/* Mobile status chips */}
      <div className="sm:hidden px-4 pb-2 -mt-1">
        <StatusCountChips byStatus={group.by_status} />
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100">
          {group.key == null ? (
            <p className="p-4 text-xs text-gray-400">
              These aren't tied to a single {isRun ? "run" : "prompt"} — switch to the "All" view to browse them.
            </p>
          ) : isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(Math.min(group.total, 3))].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <p className="p-4 text-sm text-gray-400">No recommendations match this filter.</p>
          ) : (
            <>
              <RecRows items={data.items} clientId={clientId} showPromptContext={isRun} />
              {data.total > data.items.length && (
                <p className="px-4 py-2.5 text-xs text-gray-400 border-t border-gray-100">
                  Showing {data.items.length} of {data.total}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientRecommendations() {
  const { clientId } = useParams<{ clientId: string }>();
  const [view, setView] = useState<ViewMode>("run");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data: summary } = useQuery({
    queryKey: ["rec-summary", clientId],
    queryFn: () => recommendationsApi.summary(clientId!),
    enabled: !!clientId,
  });

  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ["rec-groups", clientId, view, status],
    queryFn: () => recommendationsApi.groups(clientId!, view as "run" | "prompt", status || undefined),
    enabled: !!clientId && view !== "all",
  });

  const { data: flatData, isLoading: flatLoading } = useQuery({
    queryKey: ["client-recs", clientId, status, page],
    queryFn: () =>
      recommendationsApi.list(clientId!, {
        status: status || ALL_STATUSES,
        page,
        per_page: 20,
        sort_by: "created_at",
        sort_order: "desc",
      }),
    enabled: !!clientId && view === "all",
  });

  const byStatus = summary?.by_status ?? {};
  const pending     = byStatus.pending     ?? 0;
  const approved    = byStatus.approved    ?? 0;
  const rejected    = byStatus.rejected    ?? 0;
  const implemented = byStatus.implemented ?? 0;
  const total       = summary?.total ?? 0;

  const totalPages = flatData ? Math.max(Math.ceil(flatData.total / 20), 1) : 1;

  const setStatusFilter = (v: string) => {
    setStatus(v);
    setPage(1);
  };

  const hasAny = total > 0;

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          dot="bg-blue-500" label="Pending" value={pending}
          sub={summary && summary.pending_high_priority > 0 ? `${summary.pending_high_priority} high priority` : "awaiting review"}
        />
        <StatCard dot="bg-emerald-500" label="Approved" value={approved} sub="ready to implement" />
        <StatCard
          dot="bg-rose-400" label="Rejected" value={rejected}
          sub={total > 0 ? `${Math.round((rejected / total) * 100)}% reject rate` : undefined}
        />
        <StatCard dot="bg-purple-500" label="Implemented" value={implemented} sub="live on site" />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {([["run", "By run"], ["prompt", "By prompt"], ["all", "All"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <PillGroup
          value={status}
          onChange={setStatusFilter}
          options={[
            { label: "All statuses", value: "" },
            { label: "Pending",      value: "pending",     count: pending },
            { label: "Approved",     value: "approved",    count: approved },
            { label: "Rejected",     value: "rejected",    count: rejected },
            { label: "Implemented",  value: "implemented", count: implemented },
          ]}
        />

        <Link
          to={`/recommendations?client_id=${clientId}`}
          className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
        >
          Open review queue →
        </Link>
      </div>

      {/* Content */}
      {!hasAny && summary ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-sm font-medium text-gray-600 mb-1">No recommendations yet</p>
          <p className="text-xs text-gray-400">
            The engine generates recommendations at the end of each run — trigger one from the Runs tab.
          </p>
        </div>
      ) : view === "all" ? (
        // ── Flat paginated list ──
        flatLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !flatData?.items.length ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <p className="text-sm text-gray-400">No recommendations match this filter.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <RecRows items={flatData.items} clientId={clientId!} showRun />
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        // ── Grouped view (by run / by prompt) ──
        groupsLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !groupsData?.groups.length ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <p className="text-sm text-gray-400">No recommendations match this filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupsData.groups.map((group) => (
              <GroupCard
                key={`${view}-${group.key ?? "none"}-${status}`}
                group={group}
                clientId={clientId!}
                view={view as "run" | "prompt"}
                status={status}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
