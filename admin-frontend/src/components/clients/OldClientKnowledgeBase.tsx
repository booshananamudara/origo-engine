import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { knowledgeBaseApi } from "../../api/client";

const SECTIONS = [
  { key: "brand_profile", label: "Brand Profile", hint: "Description, mission, products, value propositions" },
  { key: "target_audience", label: "Target Audience", hint: "Demographics, roles, industries, pain points" },
  { key: "brand_voice", label: "Brand Voice", hint: "Tone, style, key messages, language preferences" },
  { key: "industry_context", label: "Industry Context", hint: "Market landscape, trends, regulatory context" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function prettyJson(obj: Record<string, unknown>): string {
  if (Object.keys(obj).length === 0) return "";
  return JSON.stringify(obj, null, 2);
}

export function ClientKnowledgeBase() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<SectionKey, string>>({
    brand_profile: "",
    target_audience: "",
    brand_voice: "",
    industry_context: "",
  });
  const [parseErrors, setParseErrors] = useState<Record<string, string>>({});
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const { data: kb } = useQuery({
    queryKey: ["admin-kb", clientId],
    queryFn: () => knowledgeBaseApi.get(clientId!),
    enabled: !!clientId,
  });

  useEffect(() => {
    if (!kb) return;
    setDrafts({
      brand_profile: prettyJson(kb.brand_profile),
      target_audience: prettyJson(kb.target_audience),
      brand_voice: prettyJson(kb.brand_voice),
      industry_context: prettyJson(kb.industry_context),
    });
  }, [kb]);

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => knowledgeBaseApi.update(clientId!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-kb", clientId] });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 3000);
    },
  });

  function handleSave() {
    const errors: Record<string, string> = {};
    const body: Record<string, unknown> = {};

    for (const section of SECTIONS) {
      const raw = drafts[section.key].trim();
      if (!raw) {
        body[section.key] = {};
        continue;
      }
      try {
        body[section.key] = JSON.parse(raw);
      } catch {
        errors[section.key] = "Invalid JSON";
      }
    }

    if (Object.keys(errors).length) {
      setParseErrors(errors);
      return;
    }

    setParseErrors({});
    updateMut.mutate(body);
  }

  return (
    <div className="max-w-2xl space-y-5">
      {kb && (
        <p className="text-xs text-gray-500">
          Version {kb.version} · Last updated {new Date(kb.updated_at).toLocaleString()}
        </p>
      )}

      {SECTIONS.map((section) => (
        <div key={section.key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-sm font-semibold text-white">{section.label}</p>
            <p className="text-xs text-gray-500">{section.hint}</p>
          </div>
          <div className="p-4">
            <textarea
              rows={6}
              value={drafts[section.key]}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [section.key]: e.target.value }))
              }
              placeholder={`{\n  "key": "value"\n}`}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
                font-mono placeholder-gray-600 focus:outline-none focus:border-indigo-500
                resize-none transition-colors"
            />
            {parseErrors[section.key] && (
              <p className="text-xs text-red-400 mt-1">{parseErrors[section.key]}</p>
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={updateMut.isPending}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold
            disabled:bg-gray-700 disabled:text-gray-400 transition-colors"
        >
          {updateMut.isPending ? "Saving…" : "Save Knowledge Base"}
        </button>
        {saveMsg && (
          <span className="text-sm text-green-400">{saveMsg}</span>
        )}
      </div>
    </div>
  );
}
