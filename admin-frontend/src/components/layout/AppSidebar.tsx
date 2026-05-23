import { NavLink, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Building2, Calendar, CheckSquare, LogOut, Settings } from "lucide-react"
import { useAuth } from "@/auth/AuthContext"
import { recommendationsApi } from "@/api/client"
import { AnimatedThemeToggler } from "@/components/magicui/animated-theme-toggler"
import { Badge } from "@/components/ui/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"

function usePendingRecommendations(): number {
  const [params] = useSearchParams()
  const clientId = params.get("client_id") ?? ""

  const { data } = useQuery({
    queryKey: ["rec-summary", clientId],
    queryFn: () => recommendationsApi.summary(clientId),
    enabled: !!clientId,
    refetchInterval: 60_000,
  })

  return data?.by_status?.pending ?? 0
}

const navItems = [
  { to: "/clients", label: "Clients", icon: Building2 },
  { to: "/scheduler", label: "Scheduler", icon: Calendar },
  { to: "/recommendations", label: "Recommendations", icon: CheckSquare },
]

interface AppSidebarProps {
  dark: boolean
  toggleTheme: () => void
}

export function AppSidebar({ dark, toggleTheme }: AppSidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const pendingRecs = usePendingRecommendations()

  function handleLogout() {
    logout()
    navigate("/login")
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground flex-shrink-0">
            <Settings className="h-4 w-4" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold leading-none">Origo Engine</span>
            <span className="text-xs text-muted-foreground leading-none mt-0.5">Admin</span>
          </div>
        </div>
      </SidebarHeader>

      {/* <SidebarSeparator /> */}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavLink to={item.to} className="w-full">
                    {({ isActive }) => (
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        className="w-full justify-start"
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
                        <span>{item.label}</span>
                        {item.label === "Recommendations" && pendingRecs > 0 && (
                          <Badge
                            variant="destructive"
                            className="ml-auto h-5 min-w-5 px-1 text-[10px] font-bold"
                          >
                            {pendingRecs > 99 ? "99+" : pendingRecs}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* <SidebarSeparator /> */}

      <SidebarFooter className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-medium truncate">{user?.display_name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            <Badge variant="secondary" className="mt-1 text-[10px] uppercase tracking-wide">
              {user?.role?.replace("_", " ")}
            </Badge>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  )
}
