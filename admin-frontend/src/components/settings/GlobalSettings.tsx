import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { platformConfigApi, settingsApi } from "../../api/client";
import type { PromptCategoryConfig } from "../../types";
import { useAuth } from "../../auth/AuthContext";

const DEFAULT_CATEGORY_COLOR = "#3b82f6";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const inputCls =
  "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm " +
  "focus:outline-none focus:border-blue-400 transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";

const PLATFORM_DOT: Record<string, string> = {
  gemini: "#f59e0b", perplexity: "#3b82f6", openai: "#10b981", anthropic: "#8b5cf6",
};

const ENGINE_DESC: Record<string, string> = {
  analysis: "Evaluates AI responses for brand citations and competitive gaps.",
  recommendation: "Generates content brief recommendations from citation analysis.",
};

// Visibility Score weights, displayed and edited as percentages. The API stores
// them as fractions (0.40 == 40%); Hollow is always 0% (excluded entirely).
const WEIGHT_META: { key: string; label: string; hint: string }[] = [
  { key: "recommended", label: "Recommended citations", hint: "Brand actively recommended" },
  { key: "mentioned", label: "Neutral mentions", hint: "Referenced without a recommendation" },
  { key: "negative", label: "Negative citations", hint: "Critical / unfavourable context (penalty)" },
  { key: "primary_prominence", label: "Primary prominence", hint: "Brand is the primary subject" },
  { key: "sentiment", label: "Sentiment", hint: "Positive sentiment among real citations" },
  { key: "platform_coverage", label: "Platform coverage", hint: "Platforms with a real citation" },
];

// Engine Configuration keys — used to track that section's dirty state separately.
const ENGINE_KEYS = [
  "analysis_platform", "analysis_model", "analysis_prompt",
  "recommendation_platform", "recommendation_model", "recommendation_prompt",
];

// Right-aligned footer with a single Save button + status text, so the button
// stays put at the card's bottom-right regardless of the status message.
function SaveBar({
  label, dirty, pending, spinning, msg, onSave, blocked = false,
}: {
  label: string;
  dirty: boolean;
  pending: boolean;
  spinning: boolean;
  msg: { kind: "ok" | "err"; text: string } | null;
  onSave: () => void;
  // When true the button stays disabled (e.g. failed validation) even if dirty.
  blocked?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-3 -mx-5 px-5 border-t border-gray-100">
      {msg && (
        <span className={`text-sm font-medium ${msg.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </span>
      )}
      {!msg && dirty && !blocked && <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>}
      <button
        onClick={onSave}
        disabled={!dirty || pending || blocked}
        className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold
          disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {spinning ? "Saving…" : label}
      </button>
    </div>
  );
}

function VisibilityWeightsCard({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["visibility-weights"],
    queryFn: () => settingsApi.getVisibilityWeights(),
  });

  const [weights, setWeights] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (data) setWeights(data.weights);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.updateVisibilityWeights(weights),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visibility-weights"] });
      setMsg({ kind: "ok", text: "Saved" });
      setTimeout(() => setMsg(null), 4000);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) =>
      setMsg({ kind: "err", text: err.response?.data?.detail ?? "Failed to save" }),
  });

  const dirty = useMemo(() => {
    if (!data) return false;
    return WEIGHT_META.some((m) => (weights[m.key] ?? 0) !== (data.weights[m.key] ?? 0));
  }, [weights, data]);

  // Percentage helpers — fraction <-> integer percent for the inputs.
  const toPct = (frac: number | undefined) => Math.round((frac ?? 0) * 100);
  const setPct = (key: string, pct: number) =>
    setWeights((prev) => ({ ...prev, [key]: pct / 100 }));

  // The weighting (Hollow always 0%) must sum to 100%.
  const sumPct = WEIGHT_META.reduce((acc, m) => acc + toPct(weights[m.key]), 0);
  const sumValid = sumPct === 100;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Visibility Score Weights</h2>
        <p className="text-xs text-gray-500 mt-1">
          How each signal contributes to a client's 0–100 Visibility Score. Hollow citations are
          always excluded (0%). Values are percentages and may be negative (penalty).
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
        {WEIGHT_META.map((m) => (
          <div key={m.key}>
            <label className="block text-sm font-medium text-gray-700">{m.label}</label>
            <p className="text-[11px] text-gray-400 mb-1">{m.hint}</p>
            <div className="relative">
              <input
                type="number"
                step={1}
                value={toPct(weights[m.key])}
                onChange={(e) => setPct(m.key, Number(e.target.value))}
                disabled={!isSuperAdmin}
                className={inputCls + " pr-7"}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
            </div>
          </div>
        ))}
        <div className="opacity-60">
          <label className="block text-sm font-medium text-gray-700">Hollow citations</label>
          <p className="text-[11px] text-gray-400 mb-1">Excluded entirely</p>
          <div className="relative">
            <input type="number" value={0} disabled className={inputCls + " pr-7"} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">Total weight (Hollow excluded)</span>
        <span className={`font-semibold ${sumValid ? "text-emerald-600" : "text-red-600"}`}>
          {sumPct}%{!sumValid && " · must equal 100%"}
        </span>
      </div>

      {isSuperAdmin && (
        <SaveBar
          label="Save Weights"
          dirty={dirty}
          pending={saveMut.isPending}
          spinning={saveMut.isPending}
          msg={msg}
          onSave={() => saveMut.mutate()}
          blocked={!sumValid}
        />
      )}
    </div>
  );
}

function PromptCategoriesCard({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["prompt-categories"],
    queryFn: () => settingsApi.getPromptCategories(),
  });

  const [cats, setCats] = useState<PromptCategoryConfig[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (data) setCats(data);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.updatePromptCategories(cats),
    onSuccess: (saved) => {
      setCats(saved);
      qc.invalidateQueries({ queryKey: ["prompt-categories"] });
      setMsg({ kind: "ok", text: "Saved" });
      setTimeout(() => setMsg(null), 4000);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) =>
      setMsg({ kind: "err", text: err.response?.data?.detail ?? "Failed to save" }),
  });

  const dirty = useMemo(
    () => !!data && JSON.stringify(cats) !== JSON.stringify(data),
    [cats, data],
  );

  const update = (i: number, patch: Partial<PromptCategoryConfig>) => {
    setCats((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
    setMsg(null);
  };
  const remove = (i: number) => {
    setCats((prev) => prev.filter((_, idx) => idx !== i));
    setMsg(null);
  };
  const add = () => {
    setCats((prev) => [...prev, { name: "", color: DEFAULT_CATEGORY_COLOR, description: "" }]);
    setMsg(null);
  };

  // Client-side validation mirrors the API: ≥1 category, non-empty unique names,
  // valid hex colors.
  const names = cats.map((c) => c.name.trim().toLowerCase());
  const dupNames = new Set(names.filter((n, i) => n && names.indexOf(n) !== i));
  const invalid =
    cats.length === 0 ||
    cats.some((c) => !c.name.trim() || !HEX_RE.test(c.color)) ||
    dupNames.size > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Prompt Categories</h2>
        <p className="text-xs text-gray-500 mt-1">
          Categories available when adding prompts. Name and color are required; description is
          optional. Categories are optional on a prompt, and an unknown category on bulk upload is
          imported blank.
        </p>
      </div>

      <div className="space-y-2">
        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[1fr_auto_2fr_auto] gap-3 px-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          <span>Name</span>
          <span className="w-16 text-center">Color</span>
          <span>Description</span>
          <span className="w-6" />
        </div>

        {cats.map((c, i) => {
          const isDup = !!c.name.trim() && dupNames.has(c.name.trim().toLowerCase());
          return (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_2fr_auto] gap-3 items-center">
              <input
                type="text"
                value={c.name}
                onChange={(e) => update(i, { name: e.target.value })}
                disabled={!isSuperAdmin}
                placeholder="Category name"
                className={inputCls + (isDup ? " border-red-300" : "")}
              />
              <div className="flex items-center gap-2 sm:w-16 sm:justify-center">
                <input
                  type="color"
                  value={HEX_RE.test(c.color) ? c.color : DEFAULT_CATEGORY_COLOR}
                  onChange={(e) => update(i, { color: e.target.value })}
                  disabled={!isSuperAdmin}
                  className="h-9 w-9 rounded-lg border border-gray-200 bg-white p-0.5 cursor-pointer disabled:cursor-not-allowed"
                  title={c.color}
                />
              </div>
              <input
                type="text"
                value={c.description ?? ""}
                onChange={(e) => update(i, { description: e.target.value })}
                disabled={!isSuperAdmin}
                placeholder="Optional description"
                className={inputCls}
              />
              {isSuperAdmin ? (
                <button
                  onClick={() => remove(i)}
                  className="justify-self-end sm:w-6 text-gray-400 hover:text-red-600 transition-colors text-lg leading-none"
                  title="Delete category"
                >
                  ×
                </button>
              ) : (
                <span className="sm:w-6" />
              )}
            </div>
          );
        })}
      </div>

      {isSuperAdmin && (
        <button
          onClick={add}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          + Add category
        </button>
      )}

      {invalid && cats.length > 0 && (
        <p className="text-xs text-red-600">
          Each category needs a unique name and a valid color before you can save.
        </p>
      )}

      {isSuperAdmin && (
        <SaveBar
          label="Save Categories"
          dirty={dirty}
          pending={saveMut.isPending}
          spinning={saveMut.isPending}
          msg={msg}
          onSave={() => saveMut.mutate()}
          blocked={invalid}
        />
      )}
    </div>
  );
}

export function GlobalSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  // Options come straight from the models the system already supports.
  const { data: availableModels } = useQuery({
    queryKey: ["admin-available-models"],
    queryFn: () => platformConfigApi.getAvailableModels(),
  });

  const { data: globalConfig } = useQuery({
    queryKey: ["global-model-config"],
    queryFn: () => settingsApi.getModelConfig(),
  });

  const [modelConfig, setModelConfig] = useState<Record<string, string>>({});
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [savingSection, setSavingSection] = useState<"model" | "engine" | null>(null);

  useEffect(() => {
    if (globalConfig) setModelConfig(globalConfig.config);
  }, [globalConfig]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.updateModelConfig(modelConfig),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["global-model-config"] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["admin-platform-config"] });
      setSaveMsg({
        kind: "ok",
        text: `Saved · applied to ${res.clients_updated} client${res.clients_updated !== 1 ? "s" : ""}`,
      });
      setTimeout(() => setSaveMsg(null), 4000);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) =>
      setSaveMsg({ kind: "err", text: err.response?.data?.detail ?? "Failed to save" }),
  });

  // Dirty state is tracked per-section so each card's Save button only lights
  // up for its own changes. Both sections persist via the same endpoint.
  const platformKeys = availableModels ? Object.keys(availableModels.platforms) : [];
  const keysDirty = (keys: string[]) =>
    !!globalConfig && keys.some((k) => (modelConfig[k] ?? "") !== (globalConfig.config[k] ?? ""));
  const modelDirty = keysDirty(platformKeys);
  const engineDirty = keysDirty(ENGINE_KEYS);

  const doSave = (section: "model" | "engine") => {
    setSavingSection(section);
    saveMut.mutate();
  };

  const update = (key: string, value: string) => {
    setModelConfig((prev) => ({ ...prev, [key]: value }));
    setSaveMsg(null);
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <p className="text-xs text-gray-400 mt-0.5">System-wide AI configuration applied to every client</p>
        </div>
        {!isSuperAdmin && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            View only
          </span>
        )}
      </div>

      {!availableModels ? (
        <p className="text-sm text-gray-400">Loading settings…</p>
      ) : (
        <>
          {/* ── AI Model Configuration ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">AI Model Configuration</h2>
              <p className="text-xs text-gray-500 mt-1">The AI model each platform uses for every client's monitoring runs.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {Object.entries(availableModels.platforms).map(([platform, models]) => (
                <div key={platform}>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1 capitalize">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PLATFORM_DOT[platform] ?? "#9ca3af" }} />
                    {platform}
                  </label>
                  <select
                    value={modelConfig[platform] ?? availableModels.defaults[platform] ?? ""}
                    onChange={(e) => update(platform, e.target.value)}
                    disabled={!isSuperAdmin}
                    className={inputCls}
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {isSuperAdmin && (
              <SaveBar
                label="Save Changes"
                dirty={modelDirty}
                pending={saveMut.isPending}
                spinning={saveMut.isPending && savingSection === "model"}
                msg={savingSection === "model" ? saveMsg : null}
                onSave={() => doSave("model")}
              />
            )}
          </div>

          {/* ── Engine Configuration ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Engine Configuration</h2>
              <p className="text-xs text-gray-500 mt-1">
                AI platform, model, and prompt used for analysis and recommendation generation.
                Leave prompt empty to use the built-in default.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(["analysis", "recommendation"] as const).map((engine) => {
                const platformKey = `${engine}_platform`;
                const modelKey = `${engine}_model`;
                const promptKey = `${engine}_prompt`;
                const selectedPlatform = modelConfig[platformKey] || "openai";
                const platformModels = availableModels.platforms[selectedPlatform] ?? [];
                const defaultModel = availableModels.defaults[selectedPlatform] ?? platformModels[0] ?? "";

                return (
                  <div key={engine} className="border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50/50">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 capitalize">{engine} Engine</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{ENGINE_DESC[engine]}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Platform</label>
                        <select
                          value={selectedPlatform}
                          onChange={(e) => {
                            const newPlatform = e.target.value;
                            const newModels = availableModels.platforms[newPlatform] ?? [];
                            const newDefault = availableModels.defaults[newPlatform] ?? newModels[0] ?? "";
                            setModelConfig((prev) => ({ ...prev, [platformKey]: newPlatform, [modelKey]: newDefault }));
                            setSaveMsg(null);
                          }}
                          disabled={!isSuperAdmin}
                          className={inputCls}
                        >
                          {Object.keys(availableModels.platforms).map((p) => (
                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
                        <select
                          value={modelConfig[modelKey] || defaultModel}
                          onChange={(e) => update(modelKey, e.target.value)}
                          disabled={!isSuperAdmin}
                          className={inputCls}
                        >
                          {platformModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-gray-600">
                          Custom Prompt <span className="text-gray-400 font-normal">— optional</span>
                        </label>
                        {modelConfig[promptKey] && isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => update(promptKey, "")}
                            className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            Reset to default
                          </button>
                        )}
                      </div>
                      <textarea
                        value={modelConfig[promptKey] ?? ""}
                        onChange={(e) => update(promptKey, e.target.value)}
                        rows={4}
                        disabled={!isSuperAdmin}
                        placeholder={
                          engine === "analysis"
                            ? "Leave empty to use the default analysis prompt.\n\nVariables: {original_prompt}, {raw_response}, {client_brand}, {competitor_list}"
                            : "Leave empty to use the default recommendation prompt.\n\nVariables: {client_name}, {industry_context}, {brand_profile}, {target_audience}, {original_prompt}, {platform}, {raw_response_truncated}, {client_cited}, {client_prominence}, {competitors_cited_summary}, {citation_opportunity}, {content_gaps}"
                        }
                        className={inputCls + " resize-y font-mono text-xs leading-relaxed min-h-[5rem]"}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {isSuperAdmin && (
              <SaveBar
                label="Save Changes"
                dirty={engineDirty}
                pending={saveMut.isPending}
                spinning={saveMut.isPending && savingSection === "engine"}
                msg={savingSection === "engine" ? saveMsg : null}
                onSave={() => doSave("engine")}
              />
            )}
          </div>

          {/* ── Visibility Score Weights ── */}
          <VisibilityWeightsCard isSuperAdmin={isSuperAdmin} />

          {/* ── Prompt Categories ── */}
          <PromptCategoriesCard isSuperAdmin={isSuperAdmin} />
        </>
      )}
    </div>
  );
}
