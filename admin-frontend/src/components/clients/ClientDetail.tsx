import { NavLink, Outlet, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { clientsApi } from "@/api/client"
import { StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ExternalLink } from "lucide-react"

const TABS = [
  { to: "overview", label: "Overview" },
  { to: "prompts", label: "Prompts" },
  { to: "competitors", label: "Competitors" },
  { to: "knowledge-base", label: "Knowledge Base" },
  { to: "runs", label: "Runs" },
  { to: "schedule", label: "Schedule" },
  { to: "users", label: "Users" },
  { to: "settings", label: "Settings" },
]

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>()

  const { data: client } = useQuery({
    queryKey: ["admin-client", clientId],
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  })

  return (
    <div className="flex flex-col min-h-full -mx-6 md:-mx-8 -mt-6 md:-mt-8">
      {/* Client header */}
      <div className="px-6 md:px-8 pt-6 pb-0 border-b bg-card">
        <div className="mb-4 flex items-start justify-between gap-4">
          {client ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="text-xl font-semibold tracking-tight truncate">{client.name}</h1>
                <StatusBadge status={client.status} />
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {client.industry && <span>{client.industry}</span>}
                {client.website && (
                  <a
                    href={client.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {client.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          )}
        </div>

        {/* Tab bar */}
        <nav className="flex overflow-x-auto scrollbar-none gap-0.5">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "px-3 py-2 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-6 md:px-8 py-6">
        <Outlet />
      </div>
    </div>
  )
}
