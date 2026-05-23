import { Outlet, useNavigate, NavLink } from "react-router-dom"
import { useAuth } from "@/auth/AuthContext"
import { useTheme } from "@/lib/theme"
import { LayoutDashboard, History, Lightbulb, LogOut, Sun, Moon, Key } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/dashboard/runs", label: "Run History", icon: History, end: false },
  { to: "/dashboard/recommendations", label: "Recommendations", icon: Lightbulb, end: false },
]

function LogoMark() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <circle cx="12" cy="12" r="3" />
        <circle cx="4" cy="6" r="2" />
        <circle cx="20" cy="6" r="2" />
        <circle cx="4" cy="18" r="2" />
        <circle cx="20" cy="18" r="2" />
        <line x1="6" y1="6.5" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5" />
        <line x1="18" y1="6.5" x2="14" y2="11" stroke="currentColor" strokeWidth="1.5" />
        <line x1="6" y1="17.5" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5" />
        <line x1="18" y1="17.5" x2="14" y2="13" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const { dark, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent">
                <LogoMark />
                <div className="flex flex-col gap-0.5 text-left min-w-0">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground leading-none">
                    GEO Monitor
                  </span>
                  <span className="text-sm font-semibold truncate leading-tight">
                    {user?.client_name ?? "Dashboard"}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu className="px-2 gap-0.5">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <SidebarMenuItem key={to}>
                <NavLink to={to} end={end}>
                  {({ isActive }) => (
                    <SidebarMenuButton isActive={isActive} tooltip={label}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  )}
                </NavLink>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className={cn(
                      "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                    )}
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
                        {user?.display_name?.[0]?.toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                      <span className="truncate font-semibold">{user?.display_name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-56 rounded-lg"
                  side="right"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
                          {user?.display_name?.[0]?.toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">{user?.display_name}</span>
                        <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={toggleTheme}>
                    {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {dark ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/change-password")}>
                    <Key className="h-4 w-4" />
                    Change password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground truncate">{user?.client_name}</span>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <Outlet />
          </div>
        </main>
      </SidebarInset>

      <Toaster richColors />
    </SidebarProvider>
  )
}
