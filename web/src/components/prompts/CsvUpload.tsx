import { useRef, useState } from "react";
import type { PromptBulkResult } from "../../lib/types";

const VALID_CATEGORIES = new Set<string>(["awareness", "evaluation", "comparison", "recommendation", "brand"]);
const MAX_BYTES = 1 * 1024 * 1024;

interface ParsedRow { text: string; category: string; rowNum: number; error?: string }

interface Props {
  onUpload: (file: File) => Promise<PromptBulkResult>;
  onCancel: () => void;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const textIdx = header.indexOf("text");
  const catIdx = header.indexOf("category");
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const text = (cols[textIdx] ?? "").trim();
    const category = (cols[catIdx] ?? "").trim();
    const rowNum = i + 1;
    let error: string | undefined;
    if (textIdx === -1 || catIdx === -1) error = "Missing required columns";
    else if (text.length < 10) error = "Text too short (min 10 chars)";
    else if (text.length > 500) error = "Text too long (max 500 chars)";
    else if (!VALID_CATEGORIES.has(category)) error = `Invalid category: "${category}"`;
    rows.push({ text, category, rowNum, error });
  }
  return rows;
}

function downloadTemplate() {
  const csv = "text,category\nHow does your product compare to competitors in the market?,comparison\nWhat are the top tools for enterprise analytics?,awareness\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "prompts_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvUpload({ onUpload, onCancel }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<PromptBulkResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setResult(null);
    setFileError(null);
    if (!f.name.endsWith(".csv")) { setFileError("Only .csv files accepted"); return; }
    if (f.size > MAX_BYTES) { setFileError("File exceeds 1 MB limit"); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRows(parseCSV(text));
    };
    reader.readAsText(f);
  }

  const invalidRows = rows.filter((r) => r.error);
  const validRows = rows.filter((r) => !r.error);
  const previewRows = rows.slice(0, 10);

  async function handleUpload() {
    if (!file || invalidRows.length > 0) return;
    setUploading(true);
    try {
      const res = await onUpload(file);
      setResult(res);
    } catch (err: unknown) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  if (result) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Upload Complete</h3>
        <div className="flex gap-4 text-sm">
          <span className="text-green-400 font-medium">Created: {result.created}</span>
          <span className="text-amber-400 font-medium">Skipped: {result.skipped}</span>
          {result.errors.length > 0 && <span className="text-red-400 font-medium">Errors: {result.errors.length}</span>}
        </div>
        {result.errors.length > 0 && (
          <ul className="text-xs text-red-400 space-y-1 list-disc list-inside">
            {result.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Upload CSV</h3>
        <button onClick={downloadTemplate} className="text-xs text-indigo-400 hover:text-indigo-300">
          Download template
        </button>
      </div>

      {!file ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${dragOver ? "border-indigo-500 bg-indigo-950/30" : "border-gray-600 hover:border-gray-500"}`}
        >
          <p className="text-sm text-gray-400">Drag & drop a .csv file or <span className="text-indigo-400">click to browse</span></p>
          <p className="text-xs text-gray-600 mt-1">Max 1 MB, max 200 rows. Columns: text, category</p>
          <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">{file.name} — {validRows.length} valid, {invalidRows.length} invalid{rows.length > 10 ? `, showing first 10 of ${rows.length}` : ""}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-1 pr-4">Row</th>
                <th className="text-left py-1 pr-4">Text</th>
                <th className="text-left py-1 pr-4">Category</th>
                <th className="text-left py-1">Status</th>
              </tr></thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.rowNum} className={r.error ? "text-red-400" : "text-gray-300"}>
                    <td className="py-1 pr-4">{r.rowNum}</td>
                    <td className="py-1 pr-4 max-w-xs truncate">{r.text.slice(0, 60)}{r.text.length > 60 ? "…" : ""}</td>
                    <td className="py-1 pr-4">{r.category}</td>
                    <td className="py-1">{r.error ? `✗ ${r.error}` : "✓"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && <p className="text-xs text-gray-500">…and {rows.length - 10} more rows</p>}
        </div>
      )}

      {fileError && <p className="text-xs text-red-400">{fileError}</p>}

      <div className="flex gap-2">
        {file && (
          <button
            onClick={handleUpload}
            disabled={uploading || invalidRows.length > 0 || validRows.length === 0}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500
              disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed text-white transition-colors"
          >
            {uploading ? "Uploading…" : `Upload ${validRows.length} prompts`}
          </button>
        )}
        <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
