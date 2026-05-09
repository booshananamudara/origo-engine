import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { clientsApi } from "../../api/client";

export function ClientSettings() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    setName(client.name);
    setIndustry(client.industry ?? "");
    setWebsite(client.website ?? "");
  }, [client]);

  const updateMut = useMutation({
    mutationFn: () =>
      clientsApi.update(clientId!, {
        name: name.trim(),
        industry: industry.trim() || undefined,
        website: website.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-client", clientId] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 3000);
    },
  });

  const statusMut = useMutation({
    mutationFn: (s: string) => clientsApi.setStatus(clientId!, s),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["admin-client", clientId] });
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      setStatusConfirm(null);
      if (updated.status === "archived") navigate("/clients");
    },
  });

  if (!client) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div className="max-w-lg space-y-8">
      {/* Edit form */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">General</h2>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm
              focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Industry</label>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="HR & Payroll Software"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm
              placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Website</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm
              placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Slug (immutable)</label>
          <input
            value={client.slug}
            disabled
            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-500 text-sm cursor-not-allowed font-mono"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending || !name.trim()}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold
              disabled:bg-gray-700 disabled:text-gray-400 transition-colors"
          >
            {updateMut.isPending ? "Saving…" : "Save Changes"}
          </button>
          {saveMsg && <span className="text-sm text-green-400">{saveMsg}</span>}
        </div>
      </div>

      {/* Danger zone */}
      <div className="border border-red-900/50 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Danger Zone</h2>

        {client.status !== "paused" && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300 font-medium">Pause Client</p>
              <p className="text-xs text-gray-500">Disable new runs without archiving</p>
            </div>
            {statusConfirm === "paused" ? (
              <div className="flex gap-2">
                <button onClick={() => statusMut.mutate("paused")} className="text-xs font-medium text-amber-400 hover:text-amber-300">Confirm</button>
                <button onClick={() => setStatusConfirm(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setStatusConfirm("paused")} className="px-3 py-1.5 rounded border border-amber-700 text-amber-400 text-xs font-medium hover:bg-amber-900/20 transition-colors">
                Pause
              </button>
            )}
          </div>
        )}

        {client.status === "paused" && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300 font-medium">Reactivate Client</p>
              <p className="text-xs text-gray-500">Re-enable runs for this client</p>
            </div>
            <button onClick={() => statusMut.mutate("active")} className="px-3 py-1.5 rounded border border-green-700 text-green-400 text-xs font-medium hover:bg-green-900/20 transition-colors">
              Reactivate
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300 font-medium">Archive Client</p>
            <p className="text-xs text-gray-500">Permanently disable — data is retained</p>
          </div>
          {statusConfirm === "archived" ? (
            <div className="flex gap-2">
              <button onClick={() => statusMut.mutate("archived")} className="text-xs font-medium text-red-400 hover:text-red-300">Confirm archive</button>
              <button onClick={() => setStatusConfirm(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setStatusConfirm("archived")} className="px-3 py-1.5 rounded border border-red-800 text-red-400 text-xs font-medium hover:bg-red-900/20 transition-colors">
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
