import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { competitorsApi } from "@/api/client"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

export function ClientCompetitors() {
  const { clientId } = useParams<{ clientId: string }>()
  const qc = useQueryClient()

  const [newName, setNewName] = useState("")
  const [bulkText, setBulkText] = useState("")
  const [showBulk, setShowBulk] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: competitors = [], isLoading } = useQuery({
    queryKey: ["admin-competitors", clientId],
    queryFn: () => competitorsApi.list(clientId!),
    enabled: !!clientId,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-competitors", clientId] })

  const createMut = useMutation({
    mutationFn: (name: string) => competitorsApi.create(clientId!, name),
    onSuccess: () => {
      invalidate()
      setNewName("")
      toast.success("Competitor added")
    },
    onError: () => toast.error("Failed to add competitor (may already exist)"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => competitorsApi.delete(clientId!, id),
    onSuccess: () => {
      invalidate()
      setDeleteId(null)
      toast.success("Competitor removed")
    },
  })

  const bulkMut = useMutation({
    mutationFn: (names: string[]) => competitorsApi.bulkCreate(clientId!, names),
    onSuccess: (res) => {
      invalidate()
      setBulkText("")
      setShowBulk(false)
      toast.success(`Added ${res.created}${res.skipped ? `, skipped ${res.skipped} duplicates` : ""}`)
    },
    onError: () => toast.error("Bulk add failed"),
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    createMut.mutate(newName.trim())
  }

  function handleBulkAdd() {
    const names = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
    if (names.length) bulkMut.mutate(names)
  }

  return (
    <BlurFade>
      <div className="max-w-lg space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Competitors ({competitors.length})
          </p>
          <button
            type="button"
            onClick={() => setShowBulk((v) => !v)}
            className="text-xs text-primary hover:underline font-medium"
          >
            {showBulk ? "Single add" : "Bulk add"}
          </button>
        </div>

        {/* Single add */}
        {!showBulk && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Competitor name…"
              className="flex-1"
            />
            <Button type="submit" disabled={!newName.trim() || createMut.isPending}>
              Add
            </Button>
          </form>
        )}

        {/* Bulk add */}
        {showBulk && (
          <div className="space-y-2">
            <Textarea
              rows={5}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"BambooHR\nRippling\nHiBob"}
              className="resize-none"
            />
            <Button
              onClick={handleBulkAdd}
              disabled={!bulkText.trim() || bulkMut.isPending}
            >
              {bulkMut.isPending ? "Adding…" : "Add All"}
            </Button>
          </div>
        )}

        {/* List */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : competitors.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No competitors added yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {competitors.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm">{c.name}</span>
                    {deleteId === c.id ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => deleteMut.mutate(c.id)}
                          className="text-xs text-destructive hover:underline font-medium"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteId(c.id)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </BlurFade>
  )
}
