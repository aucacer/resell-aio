import { ReactNode } from "react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "./AppSidebar"
import resellaioLogoDark from "@/assets/resellaio-logo-dark.svg"

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 lg:h-16 border-b border-border bg-card flex items-center px-3 lg:px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <img
                src={resellaioLogoDark}
                alt="ResellAIO"
                className="h-8 md:h-9 w-auto"
                loading="eager"
                decoding="async"
              />
            </div>
          </header>
          <div className="flex-1 p-3 sm:p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}