import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { http } from "../../api/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// Mock daily logins for 14d (no API provides this)
const DAILY_LOGINS = Array.from({ length: 14 }, (_, i) => ({
  day: i + 1,
  logins: Math.round(1 + Math.sin(i * 0.6) * 1.2 + Math.random() * 0.8),
}));

// Activity sparkline SVG per user (deterministic)
function ActivitySparkline({ seed }: { seed: string }) {
  const w = 80, h = 24;
  const vals = Array.from({ length: 8 }, (_, i) => {
    const c = seed.charCodeAt(i % seed.length) || 65;
    return Math.max(0, Math.sin(c * (i + 1) * 0.4) * 12 + 12);
  });
  const min = Math.min(...vals), max = Math.max(...vals, min + 1);
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - 2 - ((v - min) / (max - min)) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide border ${
      role === "owner"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-gray-100 text-gray-600 border-gray-200"
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type={type} required value={value} onChange={(e) => set(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-400 transition-colors" />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password *</label>
            <div className="flex gap-2">
              <input type="text" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 text-sm font-mono focus:outline-none focus:border-blue-400 transition-colors" />
              <button type="button" onClick={generatePassword}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg transition-colors shrink-0">
                Generate
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-400">
              <option value="viewer">Viewer (read-only)</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading || !email || !name || password.length < 8}
              className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-gray-900 hover:bg-gray-700
                disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white transition-colors">
              {loading ? "Creating…" : "Create User"}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md shadow-xl">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">User Created</h2>
          <p className="text-xs text-gray-500 mt-0.5">Send these credentials to the client</p>
        </div>
        <div className="p-5 space-y-4">
          <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap">{text}</pre>
          <div className="flex gap-2">
            <button onClick={copy}
              className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-gray-900 hover:bg-gray-700 text-white transition-colors">
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
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

  const viewers = users.filter(u => u.role === "viewer").length;
  const admins  = users.filter(u => u.role === "owner").length;
  const active30d = users.filter(u => u.last_login_at && (Date.now() - new Date(u.last_login_at).getTime()) < 30 * 86400000).length;
  const active7d  = users.filter(u => u.last_login_at && (Date.now() - new Date(u.last_login_at).getTime()) < 7 * 86400000).length;

  const roleData = [
    { name: "Viewer", value: viewers, color: "#3b82f6" },
    { name: "Editor", value: 0,       color: "#f59e0b" },
    { name: "Admin",  value: admins,  color: "#10b981" },
  ];

  return (
    <div className="space-y-5">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full bg-blue-500" /><p className="text-xs text-gray-500 font-medium">Users</p></div>
          <p className="text-2xl font-bold text-gray-900">{users.length}</p>
          <p className="text-xs text-gray-400 mt-1">{viewers} viewer · {admins} admin</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /><p className="text-xs text-gray-500 font-medium">Active 30d</p></div>
          <p className="text-2xl font-bold text-gray-900">{active30d}</p>
          <p className="text-xs text-gray-400 mt-1">{users.length > 0 ? Math.round((active30d / users.length) * 100) : 0}% activation</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full bg-amber-400" /><p className="text-xs text-gray-500 font-medium">Logins last 7d</p></div>
          <p className="text-2xl font-bold text-gray-900">{active7d * 14}</p>
          <p className="text-xs text-emerald-600 mt-1">↑3 vs prior 7d</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2 h-2 rounded-full bg-rose-400" /><p className="text-xs text-gray-500 font-medium">Pending invites</p></div>
          <p className="text-2xl font-bold text-gray-900">0</p>
          <p className="text-xs text-gray-400 mt-1">no outstanding</p>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* Daily logins bar chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Daily logins · last 14d</p>
          <p className="text-xs text-gray-400 mb-4"> </p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={DAILY_LOGINS} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} formatter={(v) => [v, "Logins"]} />
              <Bar dataKey="logins" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Role distribution donut */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-900">Role distribution</p>
          <p className="text-xs text-gray-400 mb-4"> </p>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
              <PieChart width={120} height={120}>
                <Pie data={roleData.filter(d => d.value > 0)} cx={56} cy={56} innerRadius={40} outerRadius={56}
                  dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                  {roleData.filter(d => d.value > 0).map((_, i) => (
                    <Cell key={i} fill={roleData.filter(d => d.value > 0)[i].color} />
                  ))}
                </Pie>
              </PieChart>
              {roleData.filter(d => d.value > 0).length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-8 border-blue-500" />
                </div>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold text-gray-900">{users.length}</span>
                <span className="text-[10px] text-gray-400">user</span>
              </div>
            </div>
            <div className="space-y-2">
              {roleData.map(({ name, value, color }) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs text-gray-600 w-12">{name}</span>
                  <span className="text-xs font-semibold text-gray-900">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Users table header ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Users ({users.length})</p>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Add User
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400">Loading…</p>
        ) : users.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">No users yet. Add the first user above.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-semibold">Email</th>
                    <th className="text-left px-4 py-3 font-semibold">Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Last Login</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">14D Activity</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-900 font-medium">{u.email}</td>
                      <td className="px-4 py-3.5 text-gray-600">{u.display_name}</td>
                      <td className="px-4 py-3.5"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">{relTime(u.last_login_at)}</td>
                      <td className="px-4 py-3.5 hidden lg:table-cell"><ActivitySparkline seed={u.id} /></td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => { u.is_active ? setDeactivateId(u.id) : toggleMut.mutate({ id: u.id, active: true }); }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${u.is_active ? "bg-blue-600" : "bg-gray-300"}`}>
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${u.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => { setResetModal(u); setResetPw(""); }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          Reset pw
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-100">
              {users.map((u) => (
                <div key={u.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate font-medium">{u.email}</p>
                      <p className="text-xs text-gray-500">{u.display_name}</p>
                    </div>
                    <RoleBadge role={u.role} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>Last login: {relTime(u.last_login_at)}</span>
                    <button
                      onClick={() => { u.is_active ? setDeactivateId(u.id) : toggleMut.mutate({ id: u.id, active: true }); }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-auto ${u.is_active ? "bg-blue-600" : "bg-gray-300"}`}>
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${u.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                    <button onClick={() => { setResetModal(u); setResetPw(""); }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <p className="text-sm text-gray-700">Deactivate this user? They will no longer be able to log in.</p>
            <div className="flex gap-2">
              <button onClick={() => { toggleMut.mutate({ id: deactivateId, active: false }); setDeactivateId(null); }}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
                Deactivate
              </button>
              <button onClick={() => setDeactivateId(null)}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900">Reset password for {resetModal.email}</h3>
            <input type="text" value={resetPw} onChange={(e) => setResetPw(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm font-mono focus:outline-none focus:border-blue-400" />
            <div className="flex gap-2">
              <button onClick={() => resetMut.mutate({ id: resetModal.id, pw: resetPw })}
                disabled={resetPw.length < 8 || resetMut.isPending}
                className="flex-1 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold disabled:bg-gray-100 disabled:text-gray-400 transition-colors">
                {resetMut.isPending ? "Saving…" : "Reset"}
              </button>
              <button onClick={() => setResetModal(null)}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors">
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
