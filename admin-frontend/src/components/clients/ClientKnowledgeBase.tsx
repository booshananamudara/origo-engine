import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { knowledgeBaseApi } from "@/api/client"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

const SECTIONS = [
  { key: "brand_profile", label: "Brand Profile", hint: "Description, mission, products, value propositions" },
  { key: "target_audience", label: "Target Audience", hint: "Demographics, roles, industries, pain points" },
  { key: "brand_voice", label: "Brand Voice", hint: "Tone, style, key messages, language preferences" },
  { key: "industry_context", label: "Industry Context", hint: "Market landscape, trends, regulatory context" },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

function prettyJson(obj: Record<string, unknown>): string {
  if (Object.keys(obj).length === 0) return ""
  return JSON.stringify(obj, null, 2)
}

export function ClientKnowledgeBase() {
  const { clientId } = useParams<{ clientId: string }>()
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<SectionKey, string>>({
    brand_profile: "",
    target_audience: "",
    brand_voice: "",
    industry_context: "",
  })
  const [parseErrors, setParseErrors] = useState<Record<string, string>>({})

  const { data: kb, isLoading } = useQuery({
    queryKey: ["admin-kb", clientId],
    queryFn: () => knowledgeBaseApi.get(clientId!),
    enabled: !!clientId,
  })

  useEffect(() => {
    if (!kb) return
    setDrafts({
      brand_profile: prettyJson(kb.brand_profile),
      target_audience: prettyJson(kb.target_audience),
      brand_voice: prettyJson(kb.brand_voice),
      industry_context: prettyJson(kb.industry_context),
    })
  }, [kb])

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => knowledgeBaseApi.update(clientId!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-kb", clientId] })
      toast.success("Knowledge base saved")
    },
    onError: () => toast.error("Failed to save knowledge base"),
  })

  function handleSave() {
    const errors: Record<string, string> = {}
    const body: Record<string, unknown> = {}

    for (const section of SECTIONS) {
      const raw = drafts[section.key].trim()
      if (!raw) {
        body[section.key] = {}
        continue
      }
      try {
        body[section.key] = JSON.parse(raw)
      } catch {
        errors[section.key] = "Invalid JSON"
      }
    }

    if (Object.keys(errors).length) {
      setParseErrors(errors)
      return
    }

    setParseErrors({})
    updateMut.mutate(body)
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full" />
        ))}
      </div>
    )
  }

  return (
    <BlurFade>
      <div className="max-w-2xl space-y-5">
        {kb && (
          <p className="text-xs text-muted-foreground">
            Version {kb.version} · Last updated {new Date(kb.updated_at).toLocaleString()}
          </p>
        )}

        {SECTIONS.map((section) => (
          <Card key={section.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">{section.label}</CardTitle>
              <p className="text-xs text-muted-foreground">{section.hint}</p>
            </CardHeader>
            <CardContent className="pt-0">
              <Textarea
                rows={6}
                value={drafts[section.key]}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [section.key]: e.target.value }))
                }
                placeholder={`{\n  "key": "value"\n}`}
                className="font-mono text-sm resize-none"
              />
              {parseErrors[section.key] && (
                <p className="text-xs text-destructive mt-1.5">{parseErrors[section.key]}</p>
              )}
            </CardContent>
          </Card>
        ))}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending ? "Saving…" : "Save Knowledge Base"}
          </Button>
        </div>
      </div>
    </BlurFade>
  )
}
