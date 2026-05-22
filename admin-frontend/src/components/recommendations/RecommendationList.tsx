import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clientsApi, recommendationsApi } from "../../api/client";
import type { RecommendationListItem, RecommendationPriority, RecommendationStatus, RecommendationType } from "../../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<RecommendationType, string> = {
  content_brief: "Content Brief",
  schema_markup: "Schema Markup",
  llms_txt: "llms.txt",
  on_page_optimization: "On-Page",
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
  pending: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-300 border-green-500/20",
  rejected: "bg-red-500/10 text-red-300 border-red-500/20",
  revision_requested: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  implemented: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  expired: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const PRIORITY_DOT: Record<RecommendationPriority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-blue-400",
};

function PriorityDot({ priority }: { priority: RecommendationPriority }) {
  return (
    <span
      title={priority}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[priority]}`}
    />
  );
}

function StatusBadge({ status }: { status: RecommendationStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function TypeBadge({ type }: { type: RecommendationType }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
      {TYPE_LABELS[type]}
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({
  clientId,
  onStatusFilter,
  currentStatus,
}: {
  clientId: string;
  onStatusFilter: (s: string) => void;
  currentStatus: string;
}) {
  const { data } = useQuery({
    queryKey: ["rec-summary", clientId],
    queryFn: () => recommendationsApi.summary(clientId),
    enabled: !!clientId,
  });

  const cards = [
    {
      label: "Pending",
      status: "pending",
      count: data?.by_status?.pending ?? 0,
      color: "text-yellow-300",
      ring: "ring-yellow-500/30",
    },
    {
      label: "Approved",
      status: "approved",
      count: data?.by_status?.approved ?? 0,
      color: "text-green-300",
      ring: "ring-green-500/30",
    },
    {
      label: "Rejected",
      status: "rejected",
      count: data?.by_status?.rejected ?? 0,
      color: "text-red-300",
      ring: "ring-red-500/30",
    },
    {
      label: "Implemented",
      status: "implemented",
      count: data?.by_status?.implemented ?? 0,
      color: "text-blue-300",
      ring: "ring-blue-500/30",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card) => (
        <button
          key={card.status}
          onClick={() => onStatusFilter(card.status)}
          className={`bg-gray-900 border border-gray-800 rounded-xl p-4 text-left transition-all
            hover:border-gray-600
            ${currentStatus === card.status ? `ring-2 ${card.ring}` : ""}`}
        >
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{card.label}</p>
          <p className={`text-2xl font-bold ${card.color}`}>{card.count}</p>
        </button>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RecommendationList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const clientId = searchParams.get("client_id") ?? "";
  const statusFilter = searchParams.get("status") ?? "pending";
  const typeFilter = searchParams.get("type") ?? "";
  const priorityFilter = searchParams.get("priority") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const setFilter = (key: string, val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) {
      next.set(key, val);
    } else {
      next.delete(key);
    }
    next.set("page", "1");
    setSearchParams(next);
  };

  const { data: clients } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: () => clientsApi.list("active"),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["recommendations", clientId, statusFilter, typeFilter, priorityFilter, page],
    queryFn: () =>
      recommendationsApi.list(clientId, {
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        priority: priorityFilter || undefined,
        page,
        per_page: 20,
      }),
    enabled: !!clientId,
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">Recommendations</h1>
          <p className="text-xs text-gray-500 mt-0.5">GEO recommendations awaiting review</p>
        </div>
      </div>

      {/* Client selector */}
      <div className="max-w-xs">
        <label className="block text-xs font-medium text-gray-400 mb-1">Client</label>
        <select
          value={clientId}
          onChange={(e) => {
            const next = new URLSearchParams();
            next.set("client_id", e.target.value);
            next.set("status", "pending");
            setSearchParams(next);
          }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
            focus:outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="">Select a client…</option>
          {clients?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {!clientId && (
        <p className="text-sm text-gray-500">Select a client to view recommendations.</p>
      )}

      {clientId && (
        <>
          {/* Summary cards */}
          <SummaryCards
            clientId={clientId}
            onStatusFilter={(s) => setFilter("status", s)}
            currentStatus={statusFilter}
          />

          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={typeFilter}
              onChange={(e) => setFilter("type", e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white
                focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">All types</option>
              <option value="content_brief">Content Brief</option>
              <option value="schema_markup">Schema Markup</option>
              <option value="llms_txt">llms.txt</option>
              <option value="on_page_optimization">On-Page</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setFilter("priority", e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white
                focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {(typeFilter || priorityFilter) && (
              <button
                onClick={() => {
                  setFilter("type", "");
                  setFilter("priority", "");
                }}
                className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1.5"
              >
                Clear filters
              </button>
            )}

            <span className="ml-auto text-xs text-gray-500">
              {data?.total ?? 0} results
            </span>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 bg-gray-900 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : data?.items.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <p className="text-sm text-gray-400">No recommendations found for these filters.</p>
            </div>
          ) : (
            <div className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden transition-opacity ${isFetching ? "opacity-70" : ""}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-6" />
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                        Platform
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {data?.items.map((rec) => (
                      <tr
                        key={rec.id}
                        onClick={() =>
                          navigate(`/recommendations/${rec.id}?client_id=${clientId}`)
                        }
                        className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <PriorityDot priority={rec.priority} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <TypeBadge type={rec.type} />
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="text-white font-medium truncate">{rec.title}</p>
                          {rec.target_query && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {rec.target_query}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-gray-400 capitalize">{rec.platform ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge status={rec.status} />
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">
                          <span className="text-gray-500 text-xs">{fmtDate(rec.created_at)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setFilter("page", String(page - 1))}
                      className="px-3 py-1 rounded bg-gray-800 text-sm text-gray-300 disabled:opacity-40
                        hover:bg-gray-700 transition-colors"
                    >
                      Prev
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setFilter("page", String(page + 1))}
                      className="px-3 py-1 rounded bg-gray-800 text-sm text-gray-300 disabled:opacity-40
                        hover:bg-gray-700 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
