import { useState } from "react";
import { clientsApi } from "../../api/client";
import type { Client } from "../../types";
import { Modal } from "../ui/ui";

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
    <Modal onClose={onClose}>
      <h3>New client</h3>
      <div className="ms">Creates the client shell, prompts, KB and competitors come from the pre-audit import.</div>
      <form onSubmit={handleSubmit}>
        <div className="fld">
          <label>Client name *</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Pty Ltd" />
        </div>
        <div className="fld">
          <label>Industry</label>
          <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="B2B SaaS" />
        </div>
        <div className="fld">
          <label>Website</label>
          <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" />
        </div>

        {error && <p style={{ color: "var(--bad)", fontSize: 12.5, marginBottom: 8 }}>{error}</p>}

        <div className="macts">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn pri" disabled={loading || !name.trim()}>
            {loading ? "Creating..." : "Create client"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
