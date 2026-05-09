import { useState } from "react";
import { clientsApi } from "../../api/client";
import type { Client } from "../../types";

interface Props {
  onClose: () => void;
  onCreated: (client: Client) => void;
}

export function CreateClientModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const client = await clientsApi.create({
        name: name.trim(),
        industry: industry.trim() || undefined,
        website: website.trim() || undefined,
      });
      onCreated(client);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof msg === "string" ? msg : "Failed to create client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">New Client</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Client Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Employment Hero"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white
                placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1
                focus:ring-indigo-500/30 text-sm transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Industry</label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="HR & Payroll Software"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white
                placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://employmenthero.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white
                placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-indigo-600 hover:bg-indigo-500
                disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed
                text-white transition-colors"
            >
              {loading ? "Creating…" : "Create Client"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-700
                text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
