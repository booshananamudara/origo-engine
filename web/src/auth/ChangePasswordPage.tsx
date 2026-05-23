import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/auth/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const API = import.meta.env.VITE_API_URL ?? ""

export function ChangePasswordPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (next.length < 8) { setError("New password must be at least 8 characters."); return }
    if (next !== confirm) { setError("Passwords do not match."); return }

    setLoading(true)
    try {
      const token = localStorage.getItem("client_access_token")
      const res = await fetch(`${API}/client/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ current_password: current, new_password: next }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail ?? "Failed to change password")
      }

      navigate("/login", { replace: true })
      logout()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>
              Welcome, {user?.display_name}. Please choose a new password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { id: "current-pw", label: "Current password", value: current, onChange: setCurrent, autoComplete: "current-password" },
                { id: "new-pw", label: "New password", value: next, onChange: setNext, autoComplete: "new-password" },
                { id: "confirm-pw", label: "Confirm new password", value: confirm, onChange: setConfirm, autoComplete: "new-password" },
              ].map(({ id, label, value, onChange, autoComplete }) => (
                <div key={id} className="space-y-1.5">
                  <Label htmlFor={id}>{label}</Label>
                  <Input
                    id={id}
                    type="password"
                    autoComplete={autoComplete}
                    required
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                </div>
              ))}

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Saving…" : "Set password & sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
