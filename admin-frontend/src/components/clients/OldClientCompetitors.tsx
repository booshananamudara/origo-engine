import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { competitorsApi } from "../../api/client";

export function ClientCompetitors() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();

  const [newName, setNewName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: competitors = [], isLoading } = useQuery({
    queryKey: ["admin-competitors", clientId],
    queryFn: () => competitorsApi.list(clientId!),
    enabled: !!clientId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-competitors", clientId] });

  const createMut = useMutation({
    mutationFn: (name: string) => competitorsApi.create(clientId!, name),
    onSuccess: () => { invalidate(); setNewName(""); setError(null); },
    onError: () => setError("Failed to add competitor (may already exist)"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => competitorsApi.delete(clientId!, id),
    onSuccess: () => { invalidate(); setDeleteId(null); },
  });

  const bulkMut = useMutation({
    mutationFn: (names: string[]) => competitorsApi.bulkCreate(clientId!, names),
    onSuccess: (res) => {
      invalidate();
      setBulkText("");
      setShowBulk(false);
      setError(`Added ${res.created}, skipped ${res.skipped} duplicates`);
      setTimeout(() => setError(null), 4000);
    },
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMut.mutate(newName.trim());
  }

  function handleBulkAdd() {
    const names = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (names.length) bulkMut.mutate(names);
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Competitors ({competitors.length})
        </h2>
        <button
          onClick={() => setShowBulk((v) => !v)}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
        >
          {showBulk ? "Single add" : "Bulk add"}
        </button>
      </div>

      {/* Single add form */}
      {!showBulk && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Competitor name…"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
              placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!newName.trim() || createMut.isPending}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold
              disabled:bg-gray-700 disabled:text-gray-400 transition-colors"
          >
            Add
          </button>
        </form>
      )}

      {/* Bulk add */}
      {showBulk && (
        <div className="space-y-2">
          <textarea
            rows={5}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"BambooHR\nRippling\nHiBob"}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
              placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
          <button
            onClick={handleBulkAdd}
            disabled={!bulkText.trim() || bulkMut.isPending}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold
              disabled:bg-gray-700 disabled:text-gray-400 transition-colors"
          >
            {bulkMut.isPending ? "Adding…" : "Add All"}
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-800 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-sm text-gray-500">Loading…</p>
        ) : competitors.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No competitors added yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {competitors.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-200">{c.name}</span>
                {deleteId === c.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => deleteMut.mutate(c.id)}
                      className="text-xs text-red-400 hover:text-red-300 font-medium"
                    >
                      Confirm delete
                    </button>
                    <button
                      onClick={() => setDeleteId(null)}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteId(c.id)}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
