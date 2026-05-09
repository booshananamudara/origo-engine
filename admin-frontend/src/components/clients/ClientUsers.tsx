import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { http } from "../../api/client";

interface ClientUser {
  id: string;
  client_id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

function relTime(iso: string | null) {
  if (!iso) return "Never";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide border ${
      role === "owner"
        ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
        : "bg-gray-500/15 text-gray-400 border-gray-500/30"
    }`}>
      {role}
    </span>
  );
}

function AddUserModal({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string;
  onClose: () => void;
  onCreated: (user: ClientUser, password: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function generatePassword() {
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
    setPassword(Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join(""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await http.post<ClientUser>(`/admin/clients/${clientId}/users`, {
        email,
        display_name: name,
        password,
        role,
      });
      onCreated(r.data, password);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof msg === "string" ? msg : "Failed to create user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">Add User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {[
            { label: "Email *", value: email, set: setEmail, type: "email", placeholder: "alice@company.com" },
            { label: "Display Name *", value: name, set: setName, type: "text", placeholder: "Alice Smith" },
          ].map(({ label, value, set, type, placeholder }) => (
            <div key={label}>
              <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
              <input type={type} required value={value} onChange={(e) => set(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Temporary Password *</label>
            <div className="flex gap-2">
              <input type="text" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors" />
              <button type="button" onClick={generatePassword}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors shrink-0">
                Generate
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500">
              <option value="viewer">Viewer (read-only)</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading || !email || !name || password.length < 8}
              className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-indigo-600 hover:bg-indigo-500
                disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed text-white transition-colors">
              {loading ? "Creating…" : "Create User"}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CredentialsModal({
  user,
  password,
  onClose,
}: {
  user: ClientUser;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const dashboardUrl = "https://origo-poc.up.railway.app";

  const text = `Dashboard: ${dashboardUrl}\nEmail: ${user.email}\nPassword: ${password}\n\nThey will be prompted to change their password on first login.`;

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="p-5 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">User Created</h2>
          <p className="text-xs text-gray-400 mt-0.5">Send these credentials to the client</p>
        </div>
        <div className="p-5 space-y-4">
          <pre className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-xs text-gray-200 font-mono whitespace-pre-wrap">{text}</pre>
          <div className="flex gap-2">
            <button onClick={copy}
              className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClientUsers() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [credentials, setCredentials] = useState<{ user: ClientUser; password: string } | null>(null);
  const [resetModal, setResetModal] = useState<ClientUser | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-client-users", clientId],
    queryFn: () => http.get<ClientUser[]>(`/admin/clients/${clientId}/users`).then((r) => r.data),
    enabled: !!clientId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-client-users", clientId] });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      http.put(`/admin/clients/${clientId}/users/${id}`, { is_active: active }),
    onSuccess: invalidate,
  });

  const resetMut = useMutation({
    mutationFn: ({ id, pw }: { id: string; pw: string }) =>
      http.post(`/admin/clients/${clientId}/users/${id}/reset-password`, { new_password: pw }),
    onSuccess: () => { invalidate(); setResetModal(null); setResetPw(""); },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Users ({users.length})
        </h2>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Add User
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : users.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No users yet. Add the first user above.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 bg-gray-800/50">
                    <th className="text-left px-5 py-3">Email</th>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Last Login</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/20 transition-colors">
                      <td className="px-5 py-3 text-gray-200">{u.email}</td>
                      <td className="px-4 py-3 text-gray-400">{u.display_name}</td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{relTime(u.last_login_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { u.is_active ? setDeactivateId(u.id) : toggleMut.mutate({ id: u.id, active: true }); }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${u.is_active ? "bg-indigo-600" : "bg-gray-600"}`}>
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${u.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setResetModal(u); setResetPw(""); }}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
                          Reset pw
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-800">
              {users.map((u) => (
                <div key={u.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate">{u.email}</p>
                      <p className="text-xs text-gray-500">{u.display_name}</p>
                    </div>
                    <RoleBadge role={u.role} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>Last login: {relTime(u.last_login_at)}</span>
                    <button
                      onClick={() => { u.is_active ? setDeactivateId(u.id) : toggleMut.mutate({ id: u.id, active: true }); }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-auto ${u.is_active ? "bg-indigo-600" : "bg-gray-600"}`}>
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${u.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                    <button onClick={() => { setResetModal(u); setResetPw(""); }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
                      Reset pw
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Deactivate confirm */}
      {deactivateId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full space-y-4">
            <p className="text-sm text-gray-200">Deactivate this user? They will no longer be able to log in.</p>
            <div className="flex gap-2">
              <button onClick={() => { toggleMut.mutate({ id: deactivateId, active: false }); setDeactivateId(null); }}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors">
                Deactivate
              </button>
              <button onClick={() => setDeactivateId(null)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-sm font-semibold text-white">Reset password for {resetModal.email}</h3>
            <input type="text" value={resetPw} onChange={(e) => setResetPw(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-indigo-500" />
            <div className="flex gap-2">
              <button onClick={() => resetMut.mutate({ id: resetModal.id, pw: resetPw })}
                disabled={resetPw.length < 8 || resetMut.isPending}
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:bg-gray-700 disabled:text-gray-400 transition-colors">
                {resetMut.isPending ? "Saving…" : "Reset"}
              </button>
              <button onClick={() => setResetModal(null)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <AddUserModal
          clientId={clientId!}
          onClose={() => setShowAdd(false)}
          onCreated={(user, password) => {
            invalidate();
            setShowAdd(false);
            setCredentials({ user, password });
          }}
        />
      )}

      {credentials && (
        <CredentialsModal
          user={credentials.user}
          password={credentials.password}
          onClose={() => setCredentials(null)}
        />
      )}
    </div>
  );
}
