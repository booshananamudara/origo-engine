import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { platformConfigApi, settingsApi } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

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

  const dirty = useMemo(() => {
    if (!globalConfig) return false;
    const norm = (o: Record<string, string>) =>
      JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    return norm(modelConfig) !== norm(globalConfig.config);
  }, [modelConfig, globalConfig]);

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
        {isSuperAdmin ? (
          <div className="flex items-center gap-3">
            {saveMsg && (
              <span className={`text-sm font-medium ${saveMsg.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                {saveMsg.text}
              </span>
            )}
            {!saveMsg && dirty && <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>}
            <button
              onClick={() => saveMut.mutate()}
              disabled={!dirty || saveMut.isPending}
              className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold
                disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {saveMut.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        ) : (
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
          </div>
        </>
      )}
    </div>
  );
}
