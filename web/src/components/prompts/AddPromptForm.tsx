import { useState } from "react";
import type { PromptCategory, PromptCreate } from "../../lib/types";

const CATEGORIES: PromptCategory[] = ["awareness", "evaluation", "comparison", "recommendation", "brand"];

interface Props {
  onSubmit: (data: PromptCreate) => Promise<void>;
  onCancel: () => void;
}

export function AddPromptForm({ onSubmit, onCancel }: Props) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<PromptCategory | "">("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const textError =
    text.length > 0 && text.length < 10 ? "Minimum 10 characters" :
    text.length > 500 ? "Maximum 500 characters" : null;

  const canSubmit = text.length >= 10 && text.length <= 500 && category !== "" && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !category) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ text, category });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("409") || msg.toLowerCase().includes("already exists")) {
        setError("A prompt with this text already exists");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Add Prompt</h3>

      <div className="space-y-1">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter prompt text (10–500 chars)…"
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
            placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
        />
        {textError && <p className="text-xs text-red-400">{textError}</p>}
        <p className="text-xs text-gray-500 text-right">{text.length}/500</p>
      </div>

      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as PromptCategory)}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
          focus:outline-none focus:border-indigo-500"
      >
        <option value="">Select category…</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
        ))}
      </select>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500
            disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed text-white transition-colors"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
