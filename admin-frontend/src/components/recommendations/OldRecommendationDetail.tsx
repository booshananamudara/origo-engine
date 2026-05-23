import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { recommendationsApi } from "../../api/client";
import type { RecommendationDetail as RD, RecommendationStatus } from "../../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  content_brief: "Content Brief",
  schema_markup: "Schema Markup",
  llms_txt: "llms.txt",
  on_page_optimization: "On-Page Optimization",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-300 border-green-500/20",
  rejected: "bg-red-500/10 text-red-300 border-red-500/20",
  revision_requested: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  implemented: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  expired: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-500/10 text-red-300 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  low: "bg-blue-500/10 text-blue-300 border-blue-500/20",
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}>
      {label}
    </span>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Content renderers ─────────────────────────────────────────────────────────

function ContentBriefView({ content }: { content: Record<string, unknown> }) {
  const fields: Array<{ label: string; key: string; list?: boolean }> = [
    { label: "Target Query", key: "target_query" },
    { label: "Content Type", key: "content_type" },
    { label: "Headline Suggestion", key: "headline_suggestion" },
    { label: "Recommended Word Count", key: "recommended_word_count" },
    { label: "Competitor Analysis", key: "competitor_analysis" },
    { label: "Reasoning", key: "reasoning" },
  ];
  const listFields: Array<{ label: string; key: string }> = [
    { label: "Key Questions", key: "key_questions" },
    { label: "E-E-A-T Signals", key: "eeat_signals" },
    { label: "Recommended Structure", key: "recommended_structure" },
    { label: "Schema Types", key: "schema_types" },
  ];

  return (
    <div className="space-y-4">
      {fields.map(({ label, key }) =>
        content[key] ? (
          <div key={key}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-sm text-gray-200">{String(content[key])}</p>
          </div>
        ) : null
      )}
      {listFields.map(({ label, key }) => {
        const items = content[key] as string[] | undefined;
        if (!items?.length) return null;
        return (
          <div key={key}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <ul className="list-disc list-inside space-y-0.5">
              {items.map((item, i) => (
                <li key={i} className="text-sm text-gray-200">{item}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function SchemaView({ content }: { content: Record<string, unknown> }) {
  const schemas = content.recommended_schemas as Array<Record<string, unknown>> | undefined;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Reasoning</p>
        <p className="text-sm text-gray-200">{String(content.reasoning ?? "")}</p>
      </div>
      {schemas?.map((s, i) => (
        <div key={i} className="space-y-2 border-t border-gray-800 pt-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              {String(s.schema_type)}
            </span>
          </div>
          <p className="text-sm text-gray-300">{String(s.purpose ?? "")}</p>
          {s.example_jsonld ? (
            <pre className="bg-gray-800 rounded-lg p-3 text-xs text-green-300 overflow-x-auto font-mono whitespace-pre-wrap">
              {JSON.stringify(s.example_jsonld, null, 2)}
            </pre>
          ) : null}
          {s.implementation_notes ? (
            <p className="text-xs text-gray-400">{String(s.implementation_notes)}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LlmsTxtView({ content }: { content: Record<string, unknown> }) {
  const sections = content.new_sections as Array<Record<string, unknown>> | undefined;
  const mods = content.modifications as Array<Record<string, unknown>> | undefined;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Reasoning</p>
        <p className="text-sm text-gray-200">{String(content.reasoning ?? "")}</p>
      </div>
      {sections?.length ? (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">New Sections</p>
          <div className="space-y-3">
            {sections.map((s, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-3 space-y-1">
                <p className="text-sm font-semibold text-indigo-300">{String(s.section_title)}</p>
                <pre className="text-xs text-gray-200 whitespace-pre-wrap font-mono">{String(s.content)}</pre>
                {Array.isArray(s.addresses_queries) && s.addresses_queries.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Addresses: {(s.addresses_queries as string[]).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {mods?.length ? (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Modifications</p>
          <div className="space-y-3">
            {mods.map((m, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-3 space-y-1">
                <p className="text-xs text-gray-500">Section: {String(m.existing_section)}</p>
                <p className="text-sm text-gray-200">{String(m.suggested_change)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GenericContentView({ content }: { content: Record<string, unknown> }) {
  return (
    <pre className="bg-gray-800 rounded-lg p-4 text-xs text-gray-200 overflow-auto font-mono whitespace-pre-wrap">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

function RecommendationContent({ rec }: { rec: RD }) {
  if (rec.type === "content_brief") return <ContentBriefView content={rec.content} />;
  if (rec.type === "schema_markup") return <SchemaView content={rec.content} />;
  if (rec.type === "llms_txt") return <LlmsTxtView content={rec.content} />;
  return <GenericContentView content={rec.content} />;
}

// ── Action modal ──────────────────────────────────────────────────────────────

type ActionType = "approve" | "reject" | "request_revision" | "implement";

function ActionModal({
  action,
  onClose,
  onSubmit,
  loading,
}: {
  action: ActionType;
  onClose: () => void;
  onSubmit: (notes: string) => void;
  loading: boolean;
}) {
  const [notes, setNotes] = useState("");
  const needsNotes = action === "reject" || action === "request_revision";

  const labels: Record<ActionType, { title: string; btn: string; btnColor: string; placeholder: string }> = {
    approve: {
      title: "Approve Recommendation",
      btn: "Approve",
      btnColor: "bg-green-700 hover:bg-green-600",
      placeholder: "Optional notes…",
    },
    reject: {
      title: "Reject Recommendation",
      btn: "Reject",
      btnColor: "bg-red-700 hover:bg-red-600",
      placeholder: "Reason for rejection (required)…",
    },
    request_revision: {
      title: "Request Revision",
      btn: "Request Revision",
      btnColor: "bg-amber-700 hover:bg-amber-600",
      placeholder: "Describe what needs to change (required)…",
    },
    implement: {
      title: "Mark as Implemented",
      btn: "Mark Implemented",
      btnColor: "bg-blue-700 hover:bg-blue-600",
      placeholder: "Optional implementation notes…",
    },
  };

  const cfg = labels[action];
  const canSubmit = !needsNotes || notes.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full space-y-4">
        <h3 className="text-base font-semibold text-white">{cfg.title}</h3>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Notes{needsNotes ? " (required)" : " (optional)"}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={cfg.placeholder}
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
              placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSubmit(notes)}
            disabled={!canSubmit || loading}
            className={`flex-1 py-2.5 rounded-lg text-white text-sm font-semibold
              disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed
              transition-colors ${cfg.btnColor}`}
          >
            {loading ? "Saving…" : cfg.btn}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RecommendationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id") ?? "";
  const qc = useQueryClient();
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);

  const { data: rec, isLoading } = useQuery({
    queryKey: ["recommendation", id],
    queryFn: () => recommendationsApi.get(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["recommendation", id] });
    qc.invalidateQueries({ queryKey: ["recommendations"] });
    qc.invalidateQueries({ queryKey: ["rec-summary"] });
  };

  const approveMut = useMutation({
    mutationFn: (notes: string) => recommendationsApi.approve(id!, notes || undefined),
    onSuccess: () => { invalidate(); setActiveAction(null); },
  });
  const rejectMut = useMutation({
    mutationFn: (notes: string) => recommendationsApi.reject(id!, notes),
    onSuccess: () => { invalidate(); setActiveAction(null); },
  });
  const revisionMut = useMutation({
    mutationFn: (notes: string) => recommendationsApi.requestRevision(id!, notes),
    onSuccess: () => { invalidate(); setActiveAction(null); },
  });
  const implementMut = useMutation({
    mutationFn: (notes: string) => recommendationsApi.implement(id!, notes || undefined),
    onSuccess: () => { invalidate(); setActiveAction(null); },
  });

  function handleSubmit(notes: string) {
    if (!activeAction) return;
    if (activeAction === "approve") approveMut.mutate(notes);
    else if (activeAction === "reject") rejectMut.mutate(notes);
    else if (activeAction === "request_revision") revisionMut.mutate(notes);
    else if (activeAction === "implement") implementMut.mutate(notes);
  }

  const isMutating =
    approveMut.isPending || rejectMut.isPending || revisionMut.isPending || implementMut.isPending;

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  if (!rec) {
    return <div className="p-6 text-sm text-red-400">Recommendation not found.</div>;
  }

  const status = rec.status as RecommendationStatus;
  const canApprove = status === "pending" || status === "revision_requested";
  const canReject = status === "pending" || status === "revision_requested";
  const canRequestRevision = status === "pending";
  const canImplement = status === "approved";

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {/* Back */}
      <button
        onClick={() => navigate(`/recommendations?client_id=${clientId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to recommendations
      </button>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge label={TYPE_LABELS[rec.type] ?? rec.type} colorClass="bg-indigo-500/10 text-indigo-300 border-indigo-500/20" />
          <Badge
            label={rec.priority.charAt(0).toUpperCase() + rec.priority.slice(1)}
            colorClass={PRIORITY_COLORS[rec.priority]}
          />
          <Badge
            label={rec.status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            colorClass={STATUS_COLORS[rec.status]}
          />
          {rec.platform && (
            <span className="text-xs text-gray-400 capitalize">{rec.platform}</span>
          )}
        </div>
        <h1 className="text-lg sm:text-xl font-bold text-white">{rec.title}</h1>
        <p className="text-xs text-gray-500">
          Generated {fmtDate(rec.created_at)}
          {rec.generation_model && ` · ${rec.generation_model}`}
          {rec.generation_cost_usd != null && ` · $${rec.generation_cost_usd.toFixed(5)}`}
        </p>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 p-4 bg-gray-900 border border-gray-800 rounded-xl">
        {canApprove && (
          <button
            onClick={() => setActiveAction("approve")}
            className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-semibold transition-colors"
          >
            Approve
          </button>
        )}
        {canReject && (
          <button
            onClick={() => setActiveAction("reject")}
            className="px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
          >
            Reject
          </button>
        )}
        {canRequestRevision && (
          <button
            onClick={() => setActiveAction("request_revision")}
            className="px-4 py-2 rounded-lg bg-amber-800 hover:bg-amber-700 text-white text-sm font-semibold transition-colors"
          >
            Request Revision
          </button>
        )}
        {canImplement && (
          <button
            onClick={() => setActiveAction("implement")}
            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold transition-colors"
          >
            Mark Implemented
          </button>
        )}
        {!canApprove && !canReject && !canRequestRevision && !canImplement && (
          <p className="text-sm text-gray-500">No actions available for this status.</p>
        )}
      </div>

      {/* Two-column layout on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Recommendation content */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Recommendation
          </h2>
          <RecommendationContent rec={rec} />
        </div>

        {/* Right: Context panel */}
        <div className="space-y-4">
          {/* Original query */}
          {rec.target_query && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Target Query
              </p>
              <p className="text-sm text-gray-200 italic">"{rec.target_query}"</p>
            </div>
          )}

          {/* Analysis context */}
          {rec.analysis_data && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Analysis Context</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Client Cited</p>
                  <p className={`font-semibold ${rec.analysis_data.client_cited ? "text-green-400" : "text-red-400"}`}>
                    {rec.analysis_data.client_cited ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Prominence</p>
                  <p className="text-white capitalize">{rec.analysis_data.client_prominence}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sentiment</p>
                  <p className="text-white capitalize">{rec.analysis_data.client_sentiment}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Opportunity</p>
                  <p className={`font-semibold capitalize ${
                    rec.analysis_data.citation_opportunity === "high" ? "text-red-400" :
                    rec.analysis_data.citation_opportunity === "medium" ? "text-amber-400" :
                    "text-blue-400"
                  }`}>
                    {rec.analysis_data.citation_opportunity}
                  </p>
                </div>
              </div>

              {rec.analysis_data.content_gaps.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Content Gaps</p>
                  <div className="flex flex-wrap gap-1">
                    {rec.analysis_data.content_gaps.map((gap, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
                        {gap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {rec.analysis_data.competitors_cited.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Competitors Cited</p>
                  <div className="flex flex-wrap gap-1">
                    {rec.analysis_data.competitors_cited.map((c, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
                        {c.brand}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 mb-1">Reasoning</p>
                <p className="text-xs text-gray-400">{rec.analysis_data.reasoning}</p>
              </div>
            </div>
          )}

          {/* Raw AI response */}
          {rec.raw_response && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                AI Response (truncated)
              </p>
              <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap line-clamp-10">
                {rec.raw_response}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      {rec.history.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">History</h2>
          <div className="space-y-3">
            {rec.history.map((h) => (
              <div key={h.id} className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full bg-gray-600 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-300">
                    <span className="font-medium text-white">{h.actor}</span>
                    {h.old_status ? (
                      <> changed status from <span className="text-gray-400">{h.old_status}</span> to <span className="text-white">{h.new_status}</span></>
                    ) : (
                      <> created with status <span className="text-white">{h.new_status}</span></>
                    )}
                  </p>
                  {h.notes && (
                    <p className="text-xs text-gray-400 mt-0.5">"{h.notes}"</p>
                  )}
                  <p className="text-xs text-gray-600 mt-0.5">{fmtDate(h.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action modal */}
      {activeAction && (
        <ActionModal
          action={activeAction}
          onClose={() => setActiveAction(null)}
          onSubmit={handleSubmit}
          loading={isMutating}
        />
      )}
    </div>
  );
}
