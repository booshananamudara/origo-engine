import { Outlet, useLocation } from "react-router-dom"
import { AppSidebar } from "./AppSidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"

function usePageTitle(): string {
  const { pathname } = useLocation()
  if (pathname.startsWith("/clients") && pathname.split("/").length > 3) return "Run Detail"
  if (pathname.startsWith("/clients") && pathname.split("/").length > 2) return "Client"
  if (pathname.startsWith("/clients")) return "Clients"
  if (pathname.startsWith("/scheduler")) return "Scheduler"
  if (pathname.startsWith("/recommendations")) return "Recommendations"
  return "Dashboard"
}

export function AdminLayout() {
  const title = usePageTitle()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6 md:p-8">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}
