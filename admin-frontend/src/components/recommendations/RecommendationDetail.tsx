import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recommendationsApi } from "@/api/client";
import type { RecommendationDetail as RD, RecommendationStatus } from "@/types";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  content_brief: "Content Brief",
  schema_markup: "Schema Markup",
  llms_txt: "llms.txt",
  on_page_optimization: "On-Page Optimization",
};

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

function FieldBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <ul className="list-disc list-inside space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContentBriefView({ content }: { content: Record<string, unknown> }) {
  const fields: Array<{ label: string; key: string }> = [
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
          <FieldBlock key={key} label={label} value={String(content[key])} />
        ) : null,
      )}
      {listFields.map(({ label, key }) => {
        const items = content[key] as string[] | undefined;
        return items?.length ? (
          <ListBlock key={key} label={label} items={items} />
        ) : null;
      })}
    </div>
  );
}

function SchemaView({ content }: { content: Record<string, unknown> }) {
  const schemas = content.recommended_schemas as
    | Array<Record<string, unknown>>
    | undefined;
  return (
    <div className="space-y-5">
      {content.reasoning != null && (
        <FieldBlock label="Reasoning" value={String(content.reasoning)} />
      )}
      {schemas?.map((s, i) => (
        <div key={i} className="border-t pt-4 space-y-2">
          <Badge variant="outline" className="font-mono text-xs">
            {String(s.schema_type)}
          </Badge>
          {s.purpose != null && <p className="text-sm">{String(s.purpose)}</p>}
          {s.example_jsonld != null && (
            <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(s.example_jsonld, null, 2)}
            </pre>
          )}
          {s.implementation_notes != null && (
            <p className="text-xs text-muted-foreground">
              {String(s.implementation_notes)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function LlmsTxtView({ content }: { content: Record<string, unknown> }) {
  const sections = content.new_sections as
    | Array<Record<string, unknown>>
    | undefined;
  const mods = content.modifications as
    | Array<Record<string, unknown>>
    | undefined;
  return (
    <div className="space-y-5">
      {content.reasoning != null && (
        <FieldBlock label="Reasoning" value={String(content.reasoning)} />
      )}
      {sections?.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            New Sections
          </p>
          {sections.map((s, i) => (
            <div key={i} className="bg-muted rounded-md p-3 space-y-1">
              <p className="text-sm font-semibold">{String(s.section_title)}</p>
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {String(s.content)}
              </pre>
              {Array.isArray(s.addresses_queries) &&
                s.addresses_queries.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Addresses: {(s.addresses_queries as string[]).join(", ")}
                  </p>
                )}
            </div>
          ))}
        </div>
      ) : null}
      {mods?.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Modifications
          </p>
          {mods.map((m, i) => (
            <div key={i} className="bg-muted rounded-md p-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                Section: {String(m.existing_section)}
              </p>
              <p className="text-sm">{String(m.suggested_change)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RecommendationContent({ rec }: { rec: RD }) {
  if (rec.type === "content_brief")
    return <ContentBriefView content={rec.content} />;
  if (rec.type === "schema_markup") return <SchemaView content={rec.content} />;
  if (rec.type === "llms_txt") return <LlmsTxtView content={rec.content} />;
  return (
    <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
      {JSON.stringify(rec.content, null, 2)}
    </pre>
  );
}

// ── Action dialog ─────────────────────────────────────────────────────────────

type ActionType = "approve" | "reject" | "request_revision" | "implement";

const ACTION_CONFIG: Record<
  ActionType,
  {
    title: string;
    description: string;
    btnLabel: string;
    btnVariant: "default" | "destructive" | "outline";
    requiresNotes: boolean;
    placeholder: string;
  }
> = {
  approve: {
    title: "Approve Recommendation",
    description: "This recommendation will be marked as approved.",
    btnLabel: "Approve",
    btnVariant: "default",
    requiresNotes: false,
    placeholder: "Optional notes…",
  },
  reject: {
    title: "Reject Recommendation",
    description: "Please provide a reason for rejection.",
    btnLabel: "Reject",
    btnVariant: "destructive",
    requiresNotes: true,
    placeholder: "Reason for rejection (required)…",
  },
  request_revision: {
    title: "Request Revision",
    description: "Describe what changes are needed.",
    btnLabel: "Request Revision",
    btnVariant: "outline",
    requiresNotes: true,
    placeholder: "Describe what needs to change (required)…",
  },
  implement: {
    title: "Mark as Implemented",
    description: "Confirm this recommendation has been implemented.",
    btnLabel: "Mark Implemented",
    btnVariant: "default",
    requiresNotes: false,
    placeholder: "Optional implementation notes…",
  },
};

// ── Main Component ────────────────────────────────────────────────────────────

export function RecommendationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client_id") ?? "";
  const qc = useQueryClient();

  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [notes, setNotes] = useState("");

  const { data: rec, isLoading } = useQuery({
    queryKey: ["recommendation", id],
    queryFn: () => recommendationsApi.get(id!),
    enabled: !!id,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["recommendation", id] });
    qc.invalidateQueries({ queryKey: ["recommendations"] });
    qc.invalidateQueries({ queryKey: ["rec-summary"] });
  }

  const approveMut = useMutation({
    mutationFn: (n: string) => recommendationsApi.approve(id!, n || undefined),
    onSuccess: () => {
      invalidate();
      setActiveAction(null);
      toast.success("Recommendation approved");
    },
    onError: () => toast.error("Failed to approve"),
  });
  const rejectMut = useMutation({
    mutationFn: (n: string) => recommendationsApi.reject(id!, n),
    onSuccess: () => {
      invalidate();
      setActiveAction(null);
      toast.success("Recommendation rejected");
    },
    onError: () => toast.error("Failed to reject"),
  });
  const revisionMut = useMutation({
    mutationFn: (n: string) => recommendationsApi.requestRevision(id!, n),
    onSuccess: () => {
      invalidate();
      setActiveAction(null);
      toast.success("Revision requested");
    },
    onError: () => toast.error("Failed to request revision"),
  });
  const implementMut = useMutation({
    mutationFn: (n: string) =>
      recommendationsApi.implement(id!, n || undefined),
    onSuccess: () => {
      invalidate();
      setActiveAction(null);
      toast.success("Marked as implemented");
    },
    onError: () => toast.error("Failed to update"),
  });

  const isMutating =
    approveMut.isPending ||
    rejectMut.isPending ||
    revisionMut.isPending ||
    implementMut.isPending;

  function handleSubmit() {
    if (!activeAction) return;
    if (activeAction === "approve") approveMut.mutate(notes);
    else if (activeAction === "reject") rejectMut.mutate(notes);
    else if (activeAction === "request_revision") revisionMut.mutate(notes);
    else if (activeAction === "implement") implementMut.mutate(notes);
  }

  const status = rec?.status as RecommendationStatus | undefined;
  const canApprove = status === "pending" || status === "revision_requested";
  const canReject = status === "pending" || status === "revision_requested";
  const canRequestRevision = status === "pending";
  const canImplement = status === "approved";

  const activeCfg = activeAction ? ACTION_CONFIG[activeAction] : null;
  const canSubmit = activeCfg
    ? !activeCfg.requiresNotes || notes.trim().length > 0
    : false;

  return (
    <BlurFade>
      <PageHeader
        breadcrumbs={[
          {
            label: "Recommendations",
            href: `/recommendations?client_id=${clientId}`,
          },
          { label: rec?.title ?? "Detail" },
        ]}
        title={isLoading ? "Loading…" : (rec?.title ?? "Recommendation")}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <div className="lg:col-span-2 space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      ) : !rec ? (
        <p className="text-sm text-destructive">Recommendation not found.</p>
      ) : (
        <div className="space-y-6">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{TYPE_LABELS[rec.type] ?? rec.type}</Badge>
            <StatusBadge status={rec.priority} />
            <StatusBadge status={rec.status} />
            {rec.platform && (
              <Badge variant="secondary" className="capitalize">
                {rec.platform}
              </Badge>
            )}
          </div>

          {/* Split layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Recommendation content */}
            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recommendation</CardTitle>
                  <CardDescription>
                    Generated {fmtDate(rec.created_at)}
                    {rec.generation_model && ` · ${rec.generation_model}`}
                    {rec.generation_cost_usd != null &&
                      ` · $${rec.generation_cost_usd.toFixed(5)}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RecommendationContent rec={rec} />
                </CardContent>
              </Card>
            </div>

            {/* Right: Context + Actions */}
            <div className="lg:col-span-2 space-y-4">
              {/* Action buttons */}
              {(canApprove ||
                canReject ||
                canRequestRevision ||
                canImplement) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {canApprove && (
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => {
                          setNotes("");
                          setActiveAction("approve");
                        }}
                      >
                        Approve
                      </Button>
                    )}
                    {canRequestRevision && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setNotes("");
                          setActiveAction("request_revision");
                        }}
                      >
                        Request Revision
                      </Button>
                    )}
                    {canReject && (
                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() => {
                          setNotes("");
                          setActiveAction("reject");
                        }}
                      >
                        Reject
                      </Button>
                    )}
                    {canImplement && (
                      <Button
                        className="w-full"
                        onClick={() => {
                          setNotes("");
                          setActiveAction("implement");
                        }}
                      >
                        Mark Implemented
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Context */}
              {rec.target_query && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Target Query</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm italic text-muted-foreground">
                      "{rec.target_query}"
                    </p>
                  </CardContent>
                </Card>
              )}

              {rec.analysis_data && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Why This Was Generated
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Cited
                        </p>
                        <p
                          className={`text-sm font-semibold ${rec.analysis_data.client_cited ? "text-emerald-600" : "text-red-600"}`}
                        >
                          {rec.analysis_data.client_cited ? "Yes" : "No"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Prominence
                        </p>
                        <p className="text-sm capitalize">
                          {rec.analysis_data.client_prominence}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Sentiment
                        </p>
                        <p className="text-sm capitalize">
                          {rec.analysis_data.client_sentiment}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Opportunity
                        </p>
                        <p
                          className={`text-sm font-semibold capitalize ${
                            rec.analysis_data.citation_opportunity === "high"
                              ? "text-red-600"
                              : rec.analysis_data.citation_opportunity ===
                                  "medium"
                                ? "text-amber-600"
                                : "text-blue-600"
                          }`}
                        >
                          {rec.analysis_data.citation_opportunity}
                        </p>
                      </div>
                    </div>
                    {rec.analysis_data.content_gaps.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                          Content Gaps
                        </p>
                        <div className="flex flex-wrap gap-1 max-w-full">
                          {rec.analysis_data.content_gaps.map((gap, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-xs max-w-full whitespace-normal break-words h-auto py-1 text-left">
                              {gap}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {rec.analysis_data.reasoning && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                          Reasoning
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rec.analysis_data.reasoning}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* History */}
          {rec.history.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rec.history.map((h) => (
                  <div key={h.id} className="flex gap-3 items-start">
                    <div className="h-2 w-2 rounded-full bg-border mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{h.actor}</span>
                        {h.old_status ? (
                          <>
                            {" "}
                            changed status from{" "}
                            <span className="text-muted-foreground">
                              {h.old_status}
                            </span>{" "}
                            to{" "}
                            <span className="font-medium">{h.new_status}</span>
                          </>
                        ) : (
                          <>
                            {" "}
                            created with status{" "}
                            <span className="font-medium">{h.new_status}</span>
                          </>
                        )}
                      </p>
                      {h.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          "{h.notes}"
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmtDate(h.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Action dialog */}
      <Dialog
        open={!!activeAction}
        onOpenChange={(open) => !open && setActiveAction(null)}
      >
        <DialogContent>
          {activeCfg && (
            <>
              <DialogHeader>
                <DialogTitle>{activeCfg.title}</DialogTitle>
                <DialogDescription>{activeCfg.description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>
                  Notes{activeCfg.requiresNotes ? " (required)" : " (optional)"}
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={activeCfg.placeholder}
                  rows={3}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setActiveAction(null)}>
                  Cancel
                </Button>
                <Button
                  variant={activeCfg.btnVariant}
                  disabled={!canSubmit || isMutating}
                  onClick={handleSubmit}
                >
                  {isMutating ? "Saving…" : activeCfg.btnLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </BlurFade>
  );
}
