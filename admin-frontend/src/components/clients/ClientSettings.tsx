import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { clientsApi, platformConfigApi } from "@/api/client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

const TIMEZONES: { value: string; label: string }[] = [
  { value: "Pacific/Honolulu",               label: "Hawaii (UTC−10)" },
  { value: "America/Anchorage",              label: "Alaska (UTC−9)" },
  { value: "America/Los_Angeles",            label: "US Pacific — LA / Seattle (UTC−8/−7)" },
  { value: "America/Denver",                 label: "US Mountain — Denver (UTC−7/−6)" },
  { value: "America/Phoenix",                label: "US Mountain — Phoenix (UTC−7, no DST)" },
  { value: "America/Chicago",                label: "US Central — Chicago (UTC−6/−5)" },
  { value: "America/New_York",               label: "US Eastern — New York (UTC−5/−4)" },
  { value: "America/Halifax",                label: "Atlantic — Halifax (UTC−4/−3)" },
  { value: "America/Sao_Paulo",              label: "São Paulo (UTC−3/−2)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (UTC−3)" },
  { value: "UTC",                            label: "UTC (UTC+0)" },
  { value: "Europe/London",                  label: "London (UTC+0/+1)" },
  { value: "Europe/Paris",                   label: "Paris / Berlin / Rome (UTC+1/+2)" },
  { value: "Europe/Helsinki",                label: "Helsinki / Kyiv (UTC+2/+3)" },
  { value: "Europe/Moscow",                  label: "Moscow (UTC+3)" },
  { value: "Asia/Dubai",                     label: "Dubai / Abu Dhabi (UTC+4)" },
  { value: "Asia/Karachi",                   label: "Karachi (UTC+5)" },
  { value: "Asia/Kolkata",                   label: "India — Mumbai / Delhi (UTC+5:30)" },
  { value: "Asia/Colombo",                   label: "Sri Lanka (UTC+5:30)" },
  { value: "Asia/Dhaka",                     label: "Dhaka / Almaty (UTC+6)" },
  { value: "Asia/Bangkok",                   label: "Bangkok / Jakarta (UTC+7)" },
  { value: "Asia/Singapore",                 label: "Singapore / Kuala Lumpur (UTC+8)" },
  { value: "Asia/Shanghai",                  label: "China (UTC+8)" },
  { value: "Asia/Tokyo",                     label: "Japan / South Korea (UTC+9)" },
  { value: "Australia/Perth",                label: "Perth (UTC+8)" },
  { value: "Australia/Adelaide",             label: "Adelaide (UTC+9:30/+10:30)" },
  { value: "Australia/Sydney",               label: "Sydney / Melbourne (UTC+10/+11)" },
  { value: "Pacific/Auckland",               label: "New Zealand (UTC+12/+13)" },
]

const ENGINE_PLATFORM_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  perplexity: "Perplexity",
  gemini: "Gemini",
}

function EngineSelector({
  label,
  description,
  platform,
  model,
  platforms,
  defaults,
  onPlatformChange,
  onModelChange,
}: {
  label: string
  description: string
  platform: string
  model: string
  platforms: Record<string, string[]>
  defaults: Record<string, string>
  onPlatformChange: (p: string) => void
  onModelChange: (m: string) => void
}) {
  const models = platforms[platform] ?? []
  return (
    <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
      <div>
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Platform</Label>
          <Select value={platform} onValueChange={(v) => {
            onPlatformChange(v)
            onModelChange(defaults[v] ?? (platforms[v]?.[0] ?? ""))
          }}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(platforms).map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {ENGINE_PLATFORM_LABELS[p] ?? p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Model</Label>
          <Select value={model} onValueChange={onModelChange}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}{m === defaults[platform] ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

export function ClientSettings() {
  const { clientId } = useParams<{ clientId: string }>()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  })

  const [name, setName] = useState("")
  const [industry, setIndustry] = useState("")
  const [website, setWebsite] = useState("")
  const [timezone, setTimezone] = useState("UTC")
  const [statusConfirm, setStatusConfirm] = useState<string | null>(null)

  useEffect(() => {
    if (!client) return
    setName(client.name)
    setIndustry(client.industry ?? "")
    setWebsite(client.website ?? "")
    setTimezone(client.timezone ?? "UTC")
  }, [client])

  const updateMut = useMutation({
    mutationFn: () =>
      clientsApi.update(clientId!, {
        name: name.trim(),
        industry: industry.trim() || undefined,
        website: website.trim() || undefined,
        timezone,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-client", clientId] })
      qc.invalidateQueries({ queryKey: ["admin-clients"] })
      qc.invalidateQueries({ queryKey: ["admin-schedule", clientId] })
      toast.success("Settings saved")
    },
    onError: () => toast.error("Failed to save settings"),
  })

  const statusMut = useMutation({
    mutationFn: (s: string) => clientsApi.setStatus(clientId!, s),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["admin-client", clientId] })
      qc.invalidateQueries({ queryKey: ["admin-clients"] })
      setStatusConfirm(null)
      if (updated.status === "archived") navigate("/clients")
    },
    onError: () => toast.error("Status update failed"),
  })

  // Model config
  const { data: availableModels } = useQuery({
    queryKey: ["admin-available-models"],
    queryFn: () => platformConfigApi.getAvailableModels(),
  })

  const { data: platformConfig } = useQuery({
    queryKey: ["admin-platform-config", clientId],
    queryFn: () => platformConfigApi.getConfig(clientId!),
    enabled: !!clientId,
  })

  const [modelConfig, setModelConfig] = useState<Record<string, string>>({})
  const [analysisPlatform, setAnalysisPlatform] = useState("openai")
  const [analysisModel, setAnalysisModel] = useState("gpt-4o-mini")
  const [recommendationPlatform, setRecommendationPlatform] = useState("openai")
  const [recommendationModel, setRecommendationModel] = useState("gpt-4o-mini")

  useEffect(() => {
    if (!platformConfig) return
    const {
      analysis_platform,
      analysis_model,
      recommendation_platform,
      recommendation_model,
      ...rest
    } = platformConfig.config
    setModelConfig(rest)
    setAnalysisPlatform(analysis_platform ?? "openai")
    setAnalysisModel(analysis_model ?? "gpt-4o-mini")
    setRecommendationPlatform(recommendation_platform ?? "openai")
    setRecommendationModel(recommendation_model ?? "gpt-4o-mini")
  }, [platformConfig])

  const modelConfigMut = useMutation({
    mutationFn: () =>
      platformConfigApi.updateConfig(clientId!, {
        ...modelConfig,
        analysis_platform: analysisPlatform,
        analysis_model: analysisModel,
        recommendation_platform: recommendationPlatform,
        recommendation_model: recommendationModel,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-platform-config", clientId] })
      toast.success("Model configuration saved")
    },
    onError: () => toast.error("Failed to save model configuration"),
  })

  if (!client) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Top: General + Model Config side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* General */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              General
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Name</Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-industry">Industry</Label>
              <Input
                id="s-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="HR & Payroll Software"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-website">Website</Label>
              <Input
                id="s-website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-timezone">Client Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="s-timezone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                All schedule times are interpreted in this timezone.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Slug (immutable)</Label>
              <Input value={client.slug} disabled className="font-mono text-muted-foreground" />
            </div>

            <div className="flex-1" />

            <Button
              onClick={() => updateMut.mutate()}
              disabled={updateMut.isPending || !name.trim()}
            >
              {updateMut.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* AI Model Configuration */}
        {availableModels && (
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                AI Model Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 space-y-4">
              <p className="text-xs text-muted-foreground">
                Override the AI model used per platform for this client's runs.
              </p>

              {/* Per-platform search model overrides */}
              {Object.entries(availableModels.platforms).map(([platform, models]) => (
                <div key={platform} className="space-y-1.5">
                  <Label className="capitalize">{ENGINE_PLATFORM_LABELS[platform] ?? platform}</Label>
                  <Select
                    value={modelConfig[platform] ?? availableModels.defaults[platform] ?? ""}
                    onValueChange={(v) => setModelConfig((prev) => ({ ...prev, [platform]: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(models as string[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}{m === availableModels.defaults[platform] ? " (default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              <Separator />

              {/* Analysis Engine */}
              <EngineSelector
                label="Analysis Engine"
                description="Analyzes AI platform responses for brand citations."
                platform={analysisPlatform}
                model={analysisModel}
                platforms={availableModels.platforms}
                defaults={availableModels.defaults}
                onPlatformChange={setAnalysisPlatform}
                onModelChange={setAnalysisModel}
              />

              {/* Recommendation Engine */}
              <EngineSelector
                label="Recommendation Engine"
                description="Generates content briefs and schema recommendations."
                platform={recommendationPlatform}
                model={recommendationModel}
                platforms={availableModels.platforms}
                defaults={availableModels.defaults}
                onPlatformChange={setRecommendationPlatform}
                onModelChange={setRecommendationModel}
              />

              <div className="flex-1" />

              <Button
                onClick={() => modelConfigMut.mutate()}
                disabled={modelConfigMut.isPending}
              >
                {modelConfigMut.isPending ? "Saving…" : "Save Models"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-destructive">
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.status !== "paused" && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Pause Client</p>
                <p className="text-xs text-muted-foreground">Disable new runs without archiving</p>
              </div>
              {statusConfirm === "paused" ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => statusMut.mutate("paused")} className="text-amber-600 border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950">
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatusConfirm(null)}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setStatusConfirm("paused")} className="text-amber-600 border-amber-600/50 hover:bg-amber-50 dark:hover:bg-amber-950">
                  Pause
                </Button>
              )}
            </div>
          )}

          {client.status === "paused" && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Reactivate Client</p>
                <p className="text-xs text-muted-foreground">Re-enable runs for this client</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => statusMut.mutate("active")} className="text-emerald-600 border-emerald-600/50 hover:bg-emerald-50 dark:hover:bg-emerald-950">
                Reactivate
              </Button>
            </div>
          )}

          {client.status !== "archived" && <Separator />}

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Archive Client</p>
              <p className="text-xs text-muted-foreground">Permanently disable — data is retained</p>
            </div>
            {statusConfirm === "archived" ? (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="destructive" onClick={() => statusMut.mutate("archived")}>
                  Confirm archive
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStatusConfirm(null)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setStatusConfirm("archived")} className="text-destructive border-destructive/50 hover:bg-destructive/10">
                Archive
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
