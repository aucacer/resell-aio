import { NavLink, useLocation } from "react-router-dom"
import { LayoutDashboard, TrendingUp, Package, ShoppingCart, Receipt, Settings, LogOut } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"
import resellaioLogoDark from "@/assets/resellaio-logo-dark.svg"
import resellaioIconDark from "@/assets/resellaio-icon-dark.svg"

const navigationItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Insights", url: "/insights", icon: TrendingUp },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Sales", url: "/sales", icon: ShoppingCart },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Settings", url: "/settings", icon: Settings },
]

export function AppSidebar() {
  const { state, setOpenMobile } = useSidebar()
  const location = useLocation()
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const currentPath = location.pathname
  const isCollapsed = state === "collapsed"
  const showLabels = !isCollapsed || isMobile

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return currentPath === path
    }
    return currentPath.startsWith(path)
  }

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Signed out successfully",
        description: "You have been logged out.",
      })
    }
  }

  return (
    <Sidebar collapsible="icon" className="bg-sidebar-background border-r border-sidebar-border">
      <SidebarContent className={`${showLabels ? 'p-4' : 'px-1 py-4'} bg-sidebar-background text-sidebar-foreground`}>
        <div className={`mb-8 ${showLabels ? '' : 'flex justify-center'}`}>
          {showLabels ? (
            <img
              src={resellaioLogoDark}
              alt="ResellAIO"
              className="h-9 w-auto"
              loading="eager"
              decoding="async"
            />
          ) : (
            <img
              src={resellaioIconDark}
              alt="ResellAIO"
              className="h-8 w-8 mx-auto"
              loading="eager"
              decoding="async"
            />
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className={`${showLabels ? "block" : "hidden"} text-sidebar-foreground/70 text-xs uppercase font-semibold tracking-wider`}>
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title} className={!showLabels ? "flex justify-center" : ""}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        `flex items-center ${showLabels ? 'gap-3 px-3' : 'justify-center -ml-1'} rounded-lg transition-all duration-200 w-full h-full ${
                          isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg"
                            : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        }`
                      }
                    >
                      <item.icon className={`${showLabels ? 'h-5 w-5' : 'h-4 w-4'} flex-shrink-0`} />
                      {showLabels && <span className="font-medium">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-auto pt-8">
          <Button
            onClick={handleSignOut}
            variant="ghost"
            size={showLabels ? "default" : "icon"}
            className={`w-full ${showLabels ? 'justify-start' : 'justify-center -ml-1'} text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent`}
          >
            <LogOut className={`${showLabels ? 'h-5 w-5' : 'h-4 w-4'}`} />
            {showLabels && <span className="ml-3">Sign Out</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  )
}