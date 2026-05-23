import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { Upload, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { promptsApi } from "@/api/client"
import type { Prompt, PromptCategory } from "@/types"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const CATEGORIES: PromptCategory[] = [
  "awareness", "evaluation", "comparison", "recommendation", "brand",
]
const VALID_CATEGORIES = new Set(CATEGORIES)
const MAX_JSON_BYTES = 2 * 1024 * 1024

interface ParsedPrompt {
  text: string
  category: string
}

interface ParsedRow {
  index: number
  prompt: ParsedPrompt
  errors: string[]
}

function validateRow(p: unknown, index: number): ParsedRow {
  const errors: string[] = []
  const raw = p as Record<string, unknown>
  const text = typeof raw?.text === "string" ? raw.text.trim() : ""
  const category = typeof raw?.category === "string" ? raw.category.trim() : ""
  if (!text || text.length < 10) errors.push("Text must be at least 10 characters")
  else if (text.length > 500) errors.push("Text must be at most 500 characters")
  if (!category) errors.push("Category is required")
  else if (!VALID_CATEGORIES.has(category as PromptCategory))
    errors.push(`Invalid category "${category}"`)
  return { index, prompt: { text, category }, errors }
}

function downloadJsonTemplate() {
  const template = [
    { text: "What is the best [product category] for [use case]?", category: "evaluation" },
    { text: "[Brand A] vs [Brand B]", category: "comparison" },
    { text: "What is [product category]?", category: "awareness" },
    { text: "Best [product category] tools", category: "recommendation" },
    { text: "[Brand name] reviews", category: "brand" },
  ]
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "prompt_template.json"
  a.click()
  URL.revokeObjectURL(url)
}

const CAT_BADGE: Record<PromptCategory, string> = {
  awareness: "border-blue-500/40 text-blue-600 dark:text-blue-400",
  evaluation: "border-purple-500/40 text-purple-600 dark:text-purple-400",
  comparison: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  recommendation: "border-teal-500/40 text-teal-600 dark:text-teal-400",
  brand: "border-green-500/40 text-green-600 dark:text-green-400",
}

function JsonUploaderContent({
  clientId,
  onClose,
  onSuccess,
}: {
  clientId: string
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const qc = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const importMut = useMutation({
    mutationFn: (prompts: ParsedPrompt[]) =>
      promptsApi.bulkCreate(clientId, prompts as { text: string; category: string }[]),
    onSuccess: (data) => {
      setResult(data)
      qc.invalidateQueries({ queryKey: ["admin-prompts", clientId] })
      setTimeout(() => {
        onSuccess(
          `Created ${data.created} prompt${data.created !== 1 ? "s" : ""}${data.skipped ? `, skipped ${data.skipped} duplicates` : ""}`,
        )
        onClose()
      }, 2000)
    },
  })

  function processFile(file: File) {
    setParseError(null)
    setRows(null)
    setResult(null)
    if (file.size > MAX_JSON_BYTES) {
      setParseError("File exceeds 2 MB limit.")
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target!.result as string)
        const arr: unknown[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.prompts)
          ? parsed.prompts
          : null!
        if (!Array.isArray(arr)) {
          setParseError('Expected a JSON array or an object with a "prompts" array.')
          return
        }
        setRows(arr.map((item, i) => validateRow(item, i)))
      } catch {
        setParseError("This file is not valid JSON. Please check the format.")
      }
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const validRows = rows?.filter((r) => r.errors.length === 0) ?? []
  const invalidCount = (rows?.length ?? 0) - validRows.length

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {!rows && !parseError && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30",
          )}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag &amp; drop a <span className="font-mono">.json</span> file here
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            or <span className="text-primary">browse files</span>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
          {parseError}
          <button
            type="button"
            onClick={() => { setParseError(null); setFileName(null) }}
            className="ml-3 underline text-xs"
          >
            Try again
          </button>
        </div>
      )}

      {/* Preview table */}
      {rows && !result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">{rows.length}</span> prompts in{" "}
                <span className="font-mono">{fileName}</span>
              </span>
              {invalidCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {invalidCount} error{invalidCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setRows(null); setFileName(null) }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Change file
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8">#</TableHead>
                  <TableHead className="text-xs">Text</TableHead>
                  <TableHead className="text-xs w-28">Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 15).map((row) => (
                  <TableRow
                    key={row.index}
                    className={row.errors.length ? "bg-destructive/5" : ""}
                  >
                    <TableCell className="text-xs text-muted-foreground font-mono py-2">
                      {row.index + 1}
                    </TableCell>
                    <TableCell className="py-2 max-w-xs">
                      <span className="text-xs leading-snug line-clamp-2">
                        {row.prompt.text || (
                          <span className="italic text-muted-foreground">empty</span>
                        )}
                      </span>
                      {row.errors.length > 0 && (
                        <p className="text-[10px] text-destructive mt-0.5">
                          {row.errors.join("; ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      {row.prompt.category ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            VALID_CATEGORIES.has(row.prompt.category as PromptCategory)
                              ? CAT_BADGE[row.prompt.category as PromptCategory]
                              : "border-destructive/40 text-destructive",
                          )}
                        >
                          {row.prompt.category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground italic text-[10px]">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 15 && (
              <p className="text-center text-xs text-muted-foreground py-2 border-t border-border">
                …and {rows.length - 15} more
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => importMut.mutate(validRows.map((r) => r.prompt))}
              disabled={validRows.length === 0 || importMut.isPending}
            >
              {importMut.isPending
                ? "Importing…"
                : `Import ${validRows.length} Prompt${validRows.length !== 1 ? "s" : ""}`}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {importMut.isError && (
              <p className="text-xs text-destructive">Upload failed. Please try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Success result */}
      {result && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-sm space-y-1">
          <p className="text-emerald-600 dark:text-emerald-400 font-medium">
            ✓ Created: {result.created}
          </p>
          {result.skipped > 0 && (
            <p className="text-muted-foreground text-xs">
              Skipped {result.skipped} duplicates
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Need the format?{" "}
        <button
          type="button"
          onClick={downloadJsonTemplate}
          className="text-primary hover:underline"
        >
          Download JSON template
        </button>
      </p>
    </div>
  )
}

export function ClientPrompts() {
  const { clientId } = useParams<{ clientId: string }>()
  const qc = useQueryClient()

  const [filterCat, setFilterCat] = useState("__all__")
  const [filterActive, setFilterActive] = useState("true")
  const [rawSearch, setRawSearch] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [showJsonUpload, setShowJsonUpload] = useState(false)
  const [addText, setAddText] = useState("")
  const [addCat, setAddCat] = useState<PromptCategory | "">("")
  const [addErr, setAddErr] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editCat, setEditCat] = useState<PromptCategory | "">("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setSearch(rawSearch); setPage(1) }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [rawSearch])

  const filters = {
    category: filterCat === "__all__" ? undefined : (filterCat as PromptCategory),
    is_active: filterActive === "__all__" ? undefined : filterActive === "true",
    search: search || undefined,
    page,
    per_page: 50,
  }

  const qKey = ["admin-prompts", clientId, filters] as const

  const { data, isLoading, isFetching } = useQuery({
    queryKey: qKey,
    queryFn: () => promptsApi.list(clientId!, filters),
    placeholderData: (prev) => prev,
  })

  function invalidate() { qc.invalidateQueries({ queryKey: ["admin-prompts", clientId] }) }

  const createMut = useMutation({
    mutationFn: () => promptsApi.create(clientId!, addText, addCat as PromptCategory),
    onSuccess: () => {
      invalidate()
      setShowAdd(false)
      setAddText("")
      setAddCat("")
      setAddErr(null)
      toast.success("Prompt added")
    },
    onError: () => setAddErr("Failed to add prompt (may already exist)"),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      promptsApi.update(clientId!, id, body),
    onSuccess: () => {
      invalidate()
      setEditId(null)
      toast.success("Prompt updated")
    },
  })

  const toggleMut = useMutation<unknown, unknown, { id: string; active: boolean }, { prev: unknown }>({
    mutationFn: ({ id, active }) =>
      active ? promptsApi.activate(clientId!, id) : promptsApi.deactivate(clientId!, id),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: qKey })
      const prev = qc.getQueryData(qKey)
      qc.setQueryData(qKey, (old: typeof data) =>
        old
          ? { ...old, items: old.items.map((p) => (p.id === id ? { ...p, is_active: active } : p)) }
          : old,
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(qKey, ctx.prev) },
    onSettled: () => invalidate(),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 50))

  function startEdit(p: Prompt) { setEditId(p.id); setEditText(p.text); setEditCat(p.category) }
  function saveEdit() {
    if (!editId || !editCat) return
    const orig = items.find((p) => p.id === editId)
    if (!orig) return
    const body: Record<string, unknown> = {}
    if (editText !== orig.text) body.text = editText
    if (editCat !== orig.category) body.category = editCat
    if (Object.keys(body).length) updateMut.mutate({ id: editId, body })
    else setEditId(null)
  }

  return (
    <BlurFade>
      <div className="space-y-4">
        {/* Stats */}
        <div className="flex gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-lg border bg-card text-xs text-muted-foreground">
            Total{" "}
            <span className="text-foreground font-semibold ml-1">{total}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg border bg-card text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active{" "}
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold ml-0.5">
              {items.filter((p) => p.is_active).length}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search prompts…"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select
              value={filterCat}
              onValueChange={(v) => { setFilterCat(v); setPage(1) }}
            >
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterActive}
              onValueChange={(v) => { setFilterActive(v); setPage(1) }}
            >
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
                <SelectItem value="__all__">All</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowJsonUpload(true); setShowAdd(false) }}
                className="gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload JSON
              </Button>
              <Button
                size="sm"
                onClick={() => { setShowAdd((v) => !v); setShowJsonUpload(false) }}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add prompt
              </Button>
            </div>
          </div>
        </div>

        {/* JSON upload dialog */}
        <Dialog open={showJsonUpload} onOpenChange={setShowJsonUpload}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload Prompts from JSON</DialogTitle>
            </DialogHeader>
            {clientId && (
              <JsonUploaderContent
                clientId={clientId}
                onClose={() => setShowJsonUpload(false)}
                onSuccess={(msg) => { setShowJsonUpload(false); toast.success(msg) }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Add prompt inline form */}
        {showAdd && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add Prompt
              </p>
              <div className="space-y-1.5">
                <Textarea
                  rows={2}
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  placeholder="Enter prompt text (10–500 chars)…"
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">{addText.length}/500</p>
              </div>
              <Select value={addCat} onValueChange={(v) => setAddCat(v as PromptCategory)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addErr && <p className="text-xs text-destructive">{addErr}</p>}
              <div className="flex gap-2">
                <Button
                  onClick={() => createMut.mutate()}
                  disabled={addText.length < 10 || !addCat || createMut.isPending}
                  size="sm"
                >
                  {createMut.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowAdd(false); setAddErr(null) }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prompts table */}
        <Card className="overflow-hidden">
          {isFetching && <div className="h-0.5 bg-primary animate-pulse" />}
          {isLoading ? (
            <CardContent className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          ) : items.length === 0 ? (
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">No prompts found.</p>
            </CardContent>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Prompt</TableHead>
                    <TableHead className="text-xs w-32">Category</TableHead>
                    <TableHead className="text-xs w-20">Active</TableHead>
                    <TableHead className="text-xs w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => {
                    const isEditing = editId === p.id
                    return (
                      <TableRow
                        key={p.id}
                        className={cn(!p.is_active && "opacity-50")}
                      >
                        <TableCell className="max-w-sm">
                          {isEditing ? (
                            <Textarea
                              rows={2}
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="resize-none text-sm"
                            />
                          ) : (
                            <span className="text-sm leading-snug" title={p.text}>
                              {p.text.length > 90 ? p.text.slice(0, 90) + "…" : p.text}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select
                              value={editCat}
                              onValueChange={(v) => setEditCat(v as PromptCategory)}
                            >
                              <SelectTrigger className="h-8 w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs capitalize",
                                CAT_BADGE[p.category as PromptCategory],
                              )}
                            >
                              {p.category}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => toggleMut.mutate({ id: p.id, active: !p.is_active })}
                            className={cn(
                              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
                              p.is_active ? "bg-primary" : "bg-muted-foreground/40",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                                p.is_active ? "translate-x-4" : "translate-x-0.5",
                              )}
                            />
                          </button>
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={saveEdit}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditId(null)}
                                className="text-xs text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(p)}
                              className="text-xs text-muted-foreground hover:text-foreground font-medium"
                            >
                              Edit
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="px-4 py-3 flex items-center justify-between border-t border-border text-sm text-muted-foreground">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    ← Prev
                  </Button>
                  <span className="text-xs">Page {page} of {totalPages}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next →
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </BlurFade>
  )
}
