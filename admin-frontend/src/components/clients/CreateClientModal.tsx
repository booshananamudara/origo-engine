import { useState } from "react"
import { clientsApi } from "@/api/client"
import type { Client } from "@/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Props {
  onClose: () => void
  onCreated: (client: Client) => void
}

export function CreateClientModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("")
  const [industry, setIndustry] = useState("")
  const [website, setWebsite] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    setLoading(true)
    try {
      const client = await clientsApi.create({
        name: name.trim(),
        industry: industry.trim() || undefined,
        website: website.trim() || undefined,
      })
      onCreated(client)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof msg === "string" ? msg : "Failed to create client")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">
              Client Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="client-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Employment Hero"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-industry">Industry</Label>
            <Input
              id="client-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="HR & Payroll Software"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-website">Website</Label>
            <Input
              id="client-website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://employmenthero.com"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1"
            >
              {loading ? "Creating…" : "Create Client"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
