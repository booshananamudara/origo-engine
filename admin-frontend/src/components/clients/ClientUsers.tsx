import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { Plus, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { http } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

interface ClientUser {
  id: string
  client_id: string
  email: string
  display_name: string
  role: string
  is_active: boolean
  must_change_password: boolean
  last_login_at: string | null
  created_at: string
}

function relTime(iso: string | null) {
  if (!iso) return "Never"
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function generatePassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$"
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

export function ClientUsers() {
  const { clientId } = useParams<{ clientId: string }>()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [credentials, setCredentials] = useState<{ user: ClientUser; password: string } | null>(null)
  const [resetTarget, setResetTarget] = useState<ClientUser | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<ClientUser | null>(null)

  // Add user form state
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("viewer")

  // Reset password form state
  const [resetPw, setResetPw] = useState("")

  // Credentials copy state
  const [copied, setCopied] = useState(false)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-client-users", clientId],
    queryFn: () => http.get<ClientUser[]>(`/admin/clients/${clientId}/users`).then((r) => r.data),
    enabled: !!clientId,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-client-users", clientId] })

  const createMut = useMutation({
    mutationFn: () =>
      http.post<ClientUser>(`/admin/clients/${clientId}/users`, {
        email,
        display_name: name,
        password,
        role,
      }).then((r) => r.data),
    onSuccess: (user) => {
      invalidate()
      setAddOpen(false)
      setEmail("")
      setName("")
      setPassword("")
      setRole("viewer")
      setCredentials({ user, password })
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to create user")
    },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      http.put(`/admin/clients/${clientId}/users/${id}`, { is_active: active }),
    onSuccess: () => {
      invalidate()
      setDeactivateTarget(null)
    },
    onError: () => toast.error("Failed to update user status"),
  })

  const resetMut = useMutation({
    mutationFn: ({ id, pw }: { id: string; pw: string }) =>
      http.post(`/admin/clients/${clientId}/users/${id}/reset-password`, { new_password: pw }),
    onSuccess: () => {
      invalidate()
      setResetTarget(null)
      setResetPw("")
      toast.success("Password reset successfully")
    },
    onError: () => toast.error("Failed to reset password"),
  })

  const dashboardUrl = "https://origo-poc.up.railway.app"
  const credText = credentials
    ? `Dashboard: ${dashboardUrl}\nEmail: ${credentials.user.email}\nPassword: ${credentials.password}\n\nThey will be prompted to change their password on first login.`
    : ""

  function copyCredentials() {
    navigator.clipboard.writeText(credText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Users ({users.length})
        </h2>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-3.5 w-3.5" />
          Add User
        </Button>
      </div>

      {/* Users table */}
      <div className="rounded-lg border overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
            No users yet. Add the first user above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Last Login</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{u.display_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === "owner" ? "default" : "secondary"} className="text-xs">
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {relTime(u.last_login_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => u.is_active ? setDeactivateTarget(u) : toggleMut.mutate({ id: u.id, active: true })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        u.is_active ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full shadow transition-transform ${
                        u.is_active ? "translate-x-4 bg-white dark:bg-black" : "translate-x-0.5 bg-white"
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setResetTarget(u); setResetPw("") }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Reset pw
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add User dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setEmail(""); setName(""); setPassword(""); setRole("viewer") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>Create a client portal account for this client.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input id="add-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alice@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Display Name</Label>
              <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice Smith" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-password">Temporary Password</Label>
              <div className="flex gap-2">
                <Input
                  id="add-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="font-mono"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(generatePassword())}>
                  Generate
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={!email || !name || password.length < 8 || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials dialog */}
      <Dialog open={!!credentials} onOpenChange={(o) => { if (!o) setCredentials(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Created</DialogTitle>
            <DialogDescription>Send these credentials to the client — the password won't be shown again.</DialogDescription>
          </DialogHeader>
          <pre className="rounded-md bg-muted p-4 text-xs font-mono whitespace-pre-wrap">{credText}</pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredentials(null)}>Done</Button>
            <Button onClick={copyCredentials} className="gap-2">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy to clipboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm dialog */}
      <Dialog open={!!deactivateTarget} onOpenChange={(o) => { if (!o) setDeactivateTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate User</DialogTitle>
            <DialogDescription>
              {deactivateTarget?.email} will no longer be able to log in. You can reactivate them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={toggleMut.isPending}
              onClick={() => deactivateTarget && toggleMut.mutate({ id: deactivateTarget.id, active: false })}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetPw("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new temporary password for {resetTarget?.email}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="reset-pw">New Password</Label>
            <Input
              id="reset-pw"
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              placeholder="Min 8 characters"
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button
              disabled={resetPw.length < 8 || resetMut.isPending}
              onClick={() => resetTarget && resetMut.mutate({ id: resetTarget.id, pw: resetPw })}
            >
              {resetMut.isPending ? "Saving…" : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
