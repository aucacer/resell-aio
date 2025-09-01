import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { 
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose
} from "@/components/ui/drawer"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Download, Settings2, DollarSign, CalendarIcon, MapPin, Trash2, RefreshCw } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { formatDateByLocationCode } from "@/lib/dateUtils"
import { useSettings } from "@/contexts/UserSettingsContext"
import { useAuth } from "@/contexts/AuthContext"
import { useSubscriptionContext } from "@/contexts/SubscriptionContext"
import { SubscriptionCheckout } from "@/components/subscription/SubscriptionCheckout"

const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
]

const LOCATIONS = [
  { code: "US", name: "United States", dateFormat: "MM/dd/yyyy" },
  { code: "AU", name: "Australia", dateFormat: "dd/MM/yyyy" },
  { code: "GB", name: "United Kingdom", dateFormat: "dd/MM/yyyy" },
  { code: "CA", name: "Canada", dateFormat: "dd/MM/yyyy" },
  { code: "DE", name: "Germany", dateFormat: "dd.MM.yyyy" },
  { code: "FR", name: "France", dateFormat: "dd/MM/yyyy" },
  { code: "JP", name: "Japan", dateFormat: "yyyy/MM/dd" },
]

export default function Settings() {
  const [selectedExports, setSelectedExports] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  // Removed hasInitialSyncRun since we removed auto-sync
  const { currency, location, updateCurrency, updateLocation, isLoading: settingsLoading } = useSettings()
  const [tempCurrency, setTempCurrency] = useState(currency)
  const [tempLocation, setTempLocation] = useState(location)
  const [fromDate, setFromDate] = useState<Date>()
  const [toDate, setToDate] = useState<Date>()
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isTerminating, setIsTerminating] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [isRefreshingSubscription, setIsRefreshingSubscription] = useState(false)
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const { refreshSubscription } = useSubscriptionContext()
  const [searchParams, setSearchParams] = useSearchParams()

  // Manual refresh function
  const handleManualRefresh = useCallback(async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to refresh subscription status.",
        variant: "destructive",
      });
      return;
    }

    setIsRefreshingSubscription(true);

    try {
      console.log('🔄 Manual subscription refresh triggered...');
      
      const session = await supabase.auth.getSession();
      if (!session.data.session?.access_token) {
        throw new Error('No valid session token');
      }
      
      const { data, error } = await supabase.functions.invoke('sync-subscription', {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
      });
      
      if (error) {
        console.error('Manual sync failed:', error);
        throw new Error(error.message || 'Sync failed');
      }
      
      if (data?.success) {
        console.log('✅ Manual sync successful:', data.data);
        await refreshSubscription();
        
        const syncedData = data.data;
        let message = "Subscription status refreshed successfully.";
        let title = "Refresh Successful";
        
        if (syncedData?.cancel_at_period_end && syncedData?.status === 'active') {
          const expiryDate = syncedData.current_period_end 
            ? formatDateByLocationCode(syncedData.current_period_end, location)
            : 'end of billing period';
          title = "Subscription Cancelled ❌";
          message = `Your ${syncedData.plan_id?.replace('_', ' ').toUpperCase()} subscription has been cancelled and will expire on ${expiryDate}. You'll continue to have access until then.`;
        } else if (syncedData?.status === 'active' && !syncedData?.cancel_at_period_end) {
          title = "Subscription Active ✅";
          message = `Your ${syncedData.plan_id?.replace('_', ' ').toUpperCase()} subscription is active and will continue to renew automatically.`;
        } else if (syncedData?.status === 'canceled') {
          title = "Subscription Cancelled ❌";
          message = "Your subscription has been cancelled and is no longer active.";
        } else if (syncedData?.status === 'trialing' && syncedData?.plan_id === 'free_trial') {
          const trialEnd = syncedData.current_period_end 
            ? formatDateByLocationCode(syncedData.current_period_end, location)
            : 'the trial period ends';
          title = "Free Trial Active 🎯";
          message = `You're on a free trial until ${trialEnd}. Upgrade anytime to continue with premium features.`;
        } else if (syncedData?.status === 'trialing' && syncedData?.plan_id !== 'free_trial') {
          // This is a paid plan in trial mode (unusual but possible)
          const trialEnd = syncedData.current_period_end 
            ? formatDateByLocationCode(syncedData.current_period_end, location)
            : 'the trial ends';
          title = "Subscription Trial 🎯";
          message = `Your ${syncedData.plan_id?.replace('_', ' ').toUpperCase()} subscription is in trial mode until ${trialEnd}.`;
        }
        
        toast({
          title,
          description: message,
          duration: 8000,
        });
      } else {
        throw new Error(data?.error || 'No data returned from sync');
      }
      
    } catch (error: any) {
      console.error('Manual refresh error:', error);
      toast({
        title: "Refresh Failed",
        description: error.message || "Unable to refresh subscription status. Please try again.",
        variant: "destructive",
        duration: 8000,
      });
    } finally {
      setIsRefreshingSubscription(false);
    }
  }, [user, toast, refreshSubscription])

  // Sync temp values when settings load or change
  useEffect(() => {
    setTempCurrency(currency)
    setTempLocation(location)
  }, [currency, location])

  // Auto-sync when returning from Stripe portal
  useEffect(() => {
    const portalReturn = searchParams.get('portal_return');
    
    if (portalReturn === 'true' && user && !isRefreshingSubscription) {
      console.log('🔄 Detected return from Stripe portal - auto-triggering sync...');
      
      // Clear the portal_return parameter from URL immediately
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.delete('portal_return');
      setSearchParams(newSearchParams, { replace: true });
      
      // Show immediate feedback
      toast({
        title: "Syncing subscription changes...",
        description: "Updating your subscription status from the customer portal.",
        duration: 3000,
      });
      
      // Reduced delay - 2 seconds is sufficient for most webhook processing
      setTimeout(() => {
        console.log('🚀 Triggering sync after portal return...');
        handleManualRefresh();
      }, 2000);
    }
  }, [searchParams, user, isRefreshingSubscription, handleManualRefresh, setSearchParams, toast]);

  const exportOptions = [
    { id: "inventory", label: "Inventory", description: "All your inventory items with purchase details" },
    { id: "sales", label: "Sales", description: "Sales records and profit data" },
    { id: "expenses", label: "Expenses", description: "Business expenses and costs" }
  ]

  // Debug effect to monitor selectedExports changes
  useEffect(() => {
    console.log('selectedExports state changed:', selectedExports)
    console.log('Export button should be:', selectedExports.length > 0 ? 'ENABLED' : 'DISABLED')
  }, [selectedExports])

  const handleExportSelection = (exportId: string, checked: boolean) => {
    console.log('Export selection changed:', exportId, checked)
    if (checked) {
      setSelectedExports(prev => {
        const newSelection = [...prev, exportId]
        console.log('Selected exports after adding:', newSelection)
        return newSelection
      })
    } else {
      setSelectedExports(prev => {
        const newSelection = prev.filter(id => id !== exportId)
        console.log('Selected exports after removing:', newSelection)
        return newSelection
      })
    }
  }

  const convertToCSV = (data: any[], headers: string[]) => {
    if (data.length === 0) return ""
    
    const csvHeaders = headers.join(",")
    const csvRows = data.map(row => 
      headers.map(header => {
        const value = row[header]
        // Handle null, undefined, and boolean values properly
        if (value === null || value === undefined) {
          return '""'
        }
        if (typeof value === 'boolean') {
          return value ? '"Yes"' : '"No"'
        }
        // Convert to string and escape quotes
        return `"${String(value).replace(/"/g, '""')}"`
      }).join(",")
    )
    
    return [csvHeaders, ...csvRows].join("\n")
  }

  const downloadCSV = (content: string, filename: string) => {
    // Add BOM for proper UTF-8 encoding in Excel
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + content], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", filename)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportData = async () => {
    if (selectedExports.length === 0) {
      toast({
        title: "No data selected",
        description: "Please select at least one type of data to export.",
        variant: "destructive",
      })
      return
    }

    setIsExporting(true)

    try {
      for (const exportType of selectedExports) {
        let data: any[] = []
        let headers: string[] = []
        let filename = ""

        switch (exportType) {
          case "inventory": {
            let inventoryQuery = supabase
              .from("inventory")
              .select("*")

            if (fromDate) {
              inventoryQuery = inventoryQuery.gte("purchase_date", fromDate.toISOString().split('T')[0])
            }
            if (toDate) {
              inventoryQuery = inventoryQuery.lte("purchase_date", toDate.toISOString().split('T')[0])
            }

            const { data: inventoryData } = await inventoryQuery.order("created_at", { ascending: false })
            data = inventoryData || []
            headers = ["item_name", "brand", "size", "condition", "sku", "purchase_price", "market_value", "purchase_date", "purchase_from", "order_number", "created_at", "is_sold", "notes"]
            filename = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`
            break
          }

          case "sales": {
            let salesQuery = supabase
              .from("sales")
              .select("*")

            if (fromDate) {
              salesQuery = salesQuery.gte("sale_date", fromDate.toISOString().split('T')[0])
            }
            if (toDate) {
              salesQuery = salesQuery.lte("sale_date", toDate.toISOString().split('T')[0])
            }

            const { data: salesData } = await salesQuery.order("created_at", { ascending: false })
            data = salesData || []
            headers = ["item_name", "sale_price", "purchase_price", "profit", "platform", "sale_date", "shipping_cost", "fees", "created_at", "notes"]
            filename = `sales_export_${new Date().toISOString().split('T')[0]}.csv`
            break
          }

          case "expenses": {
            let expensesQuery = supabase
              .from("expenses")
              .select("*")

            if (fromDate) {
              expensesQuery = expensesQuery.gte("expense_date", fromDate.toISOString().split('T')[0])
            }
            if (toDate) {
              expensesQuery = expensesQuery.lte("expense_date", toDate.toISOString().split('T')[0])
            }

            const { data: expensesData } = await expensesQuery.order("created_at", { ascending: false })
            data = expensesData || []
            headers = ["description", "amount", "category", "expense_date", "created_at", "receipt_url"]
            filename = `expenses_export_${new Date().toISOString().split('T')[0]}.csv`
            break
          }
        }

        if (data.length > 0) {
          const csvContent = convertToCSV(data, headers)
          downloadCSV(csvContent, filename)
        }
      }

      toast({
        title: "Export successful",
        description: `${selectedExports.length} file(s) downloaded successfully.`,
      })
    } catch (error) {
      console.error("Export error:", error)
      toast({
        title: "Export failed",
        description: "There was an error exporting your data. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const saveCurrencyPreference = async () => {
    await updateCurrency(tempCurrency)
  }

  const saveLocationPreference = async () => {
    await updateLocation(tempLocation)
  }

  const terminateAllData = async () => {
    if (confirmText !== "DELETE ALL DATA") {
      toast({
        title: "Confirmation text incorrect",
        description: "Please type 'DELETE ALL DATA' exactly to confirm.",
        variant: "destructive",
      })
      return
    }

    setIsTerminating(true)

    try {
      // Delete all user data in the correct order (respecting foreign key constraints)
      await supabase.from("sales").delete().neq("id", "00000000-0000-0000-0000-000000000000")
      await supabase.from("expenses").delete().neq("id", "00000000-0000-0000-0000-000000000000")
      await supabase.from("inventory").delete().neq("id", "00000000-0000-0000-0000-000000000000")
      
      // Reset user settings to defaults
      await supabase.from("user_settings")
        .update({ currency: "USD", location: "US" })
        .neq("id", "00000000-0000-0000-0000-000000000000")

      // Reset local state
      setConfirmText("")
      await updateCurrency("USD")
      await updateLocation("US")

      toast({
        title: "All data terminated",
        description: "Your account has been reset to a clean state. All inventory, sales, and expenses have been deleted.",
      })
    } catch (error) {
      console.error("Error terminating data:", error)
      toast({
        title: "Error terminating data",
        description: "There was an error deleting your data. Please try again or contact support.",
        variant: "destructive",
      })
    } finally {
      setIsTerminating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings2 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences and export data</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4 md:grid-cols-2">
        {/* Data Export Section */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <Download className="h-5 w-5 text-primary" />
              Data Export
            </CardTitle>
            <CardDescription>
              Export your data to CSV files for backup or analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {exportOptions.map((option) => (
                <div key={option.id} className="flex items-start space-x-3">
                  <Checkbox
                    id={option.id}
                    checked={selectedExports.includes(option.id)}
                    onCheckedChange={(checked) => {
                      console.log('Checkbox onCheckedChange triggered:', option.id, checked, typeof checked)
                      // Convert to boolean - handle true, false, 'indeterminate', or any truthy/falsy value
                      const isChecked = checked === true || checked === 'true'
                      handleExportSelection(option.id, isChecked)
                    }}
                    className="mt-1"
                  />
                  <div className="space-y-1 flex-1">
                    <label
                      htmlFor={option.id}
                      className="text-sm font-medium text-card-foreground cursor-pointer block"
                    >
                      {option.label}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Date Filter Section */}
            <div className="border-t border-border pt-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-card-foreground">Date Filter (Optional)</h4>
                
                {/* Date Range Display */}
                {isMobile ? (
                  <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
                    <DrawerTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          (!fromDate && !toDate) && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {fromDate && toDate 
                          ? `${format(fromDate, "MMM d, yyyy")} ~ ${format(toDate, "MMM d, yyyy")}`
                          : fromDate 
                          ? `${format(fromDate, "MMM d, yyyy")} ~ Select end date`
                          : toDate 
                          ? `Select start date ~ ${format(toDate, "MMM d, yyyy")}`
                          : "Select date range"
                        }
                      </Button>
                    </DrawerTrigger>
                    <DrawerContent className="max-h-[85vh]">
                      <div className="p-4 space-y-4 overflow-y-auto">
                        <h3 className="text-lg font-semibold">Select Date Range</h3>
                        
                        {/* Preset Options for Mobile */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-muted-foreground">Quick Select</h4>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const now = new Date()
                                const thisYear = new Date(now.getFullYear(), 0, 1)
                                const nextYear = new Date(now.getFullYear() + 1, 0, 1)
                                setFromDate(thisYear)
                                setToDate(nextYear)
                              }}
                              className="justify-start text-left font-normal"
                            >
                              This tax year
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const now = new Date()
                                const lastYear = new Date(now.getFullYear() - 1, 0, 1)
                                const thisYear = new Date(now.getFullYear(), 0, 1)
                                setFromDate(lastYear)
                                setToDate(thisYear)
                              }}
                              className="justify-start text-left font-normal"
                            >
                              Last tax year
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const now = new Date()
                                const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate())
                                setFromDate(twelveMonthsAgo)
                                setToDate(now)
                              }}
                              className="justify-start text-left font-normal"
                            >
                              Last 12 months
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFromDate(undefined)
                                setToDate(undefined)
                              }}
                              className="justify-start text-left font-normal text-destructive"
                            >
                              Clear
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFromDate(new Date(2025, 0, 1))
                                setToDate(new Date(2025, 11, 31))
                              }}
                              className="justify-center font-normal"
                            >
                              2025
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFromDate(new Date(2024, 0, 1))
                                setToDate(new Date(2024, 11, 31))
                              }}
                              className="justify-center font-normal"
                            >
                              2024
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFromDate(new Date(2023, 0, 1))
                                setToDate(new Date(2023, 11, 31))
                              }}
                              className="justify-center font-normal"
                            >
                              2023
                            </Button>
                          </div>
                        </div>

                        {/* Custom Date Selection for Mobile */}
                        <div className="space-y-4">
                          <h4 className="text-sm font-medium text-muted-foreground">Custom Range</h4>
                          
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">FROM DATE</label>
                              <Calendar
                                mode="single"
                                selected={fromDate}
                                onSelect={setFromDate}
                                className={cn("p-3 pointer-events-auto rounded-md border")}
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">TO DATE</label>
                              <Calendar
                                mode="single"
                                selected={toDate}
                                onSelect={setToDate}
                                className={cn("p-3 pointer-events-auto rounded-md border")}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-4 border-t">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setFromDate(undefined)
                              setToDate(undefined)
                            }}
                            className="flex-1"
                          >
                            Clear Selection
                          </Button>
                          <Button
                            onClick={() => {
                              setDrawerOpen(false)
                            }}
                            className="flex-1"
                          >
                            Done
                          </Button>
                        </div>
                      </div>
                    </DrawerContent>
                  </Drawer>
                ) : (
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          (!fromDate && !toDate) && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {fromDate && toDate 
                          ? `${format(fromDate, "MMM d, yyyy")} ~ ${format(toDate, "MMM d, yyyy")}`
                          : fromDate 
                          ? `${format(fromDate, "MMM d, yyyy")} ~ Select end date`
                          : toDate 
                          ? `Select start date ~ ${format(toDate, "MMM d, yyyy")}`
                          : "Select date range"
                        }
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <div className="flex">
                        {/* Calendar Section */}
                        <div className="border-r border-border">
                          <div className="grid grid-cols-2 gap-4 p-4">
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">FROM</label>
                              <Calendar
                                mode="single"
                                selected={fromDate}
                                onSelect={setFromDate}
                                className={cn("p-0 pointer-events-auto")}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">TO</label>
                              <Calendar
                                mode="single"
                                selected={toDate}
                                onSelect={setToDate}
                                className={cn("p-0 pointer-events-auto")}
                              />
                            </div>
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="border-t border-border p-4 flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setFromDate(undefined)
                                setToDate(undefined)
                              }}
                              className="flex-1"
                            >
                              Clear Selection
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                setDatePickerOpen(false)
                              }}
                              className="flex-1"
                            >
                              Done
                            </Button>
                          </div>
                        </div>
                        
                        {/* Preset Options */}
                        <div className="w-48 p-4 space-y-2">
                          <div className="space-y-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const now = new Date()
                                const thisYear = new Date(now.getFullYear(), 0, 1)
                                const nextYear = new Date(now.getFullYear() + 1, 0, 1)
                                setFromDate(thisYear)
                                setToDate(nextYear)
                              }}
                              className="w-full justify-start text-left font-normal"
                            >
                              This tax year
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const now = new Date()
                                const lastYear = new Date(now.getFullYear() - 1, 0, 1)
                                const thisYear = new Date(now.getFullYear(), 0, 1)
                                setFromDate(lastYear)
                                setToDate(thisYear)
                              }}
                              className="w-full justify-start text-left font-normal"
                            >
                              Last tax year
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const now = new Date()
                                const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate())
                                setFromDate(twelveMonthsAgo)
                                setToDate(now)
                              }}
                              className="w-full justify-start text-left font-normal"
                            >
                              Last 12 months
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFromDate(new Date(2025, 0, 1))
                                setToDate(new Date(2025, 11, 31))
                              }}
                              className="w-full justify-start text-left font-normal"
                            >
                              2025
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFromDate(new Date(2024, 0, 1))
                                setToDate(new Date(2024, 11, 31))
                              }}
                              className="w-full justify-start text-left font-normal"
                            >
                              2024
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFromDate(new Date(2023, 0, 1))
                                setToDate(new Date(2023, 11, 31))
                              }}
                              className="w-full justify-start text-left font-normal"
                            >
                              2023
                            </Button>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                
                {(fromDate || toDate) && (
                  <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                    {fromDate && toDate 
                      ? `Filtering data from ${format(fromDate, "MMM d, yyyy")} to ${format(toDate, "MMM d, yyyy")}`
                      : fromDate 
                      ? `Filtering data from ${format(fromDate, "MMM d, yyyy")} onwards`
                      : `Filtering data until ${format(toDate!, "MMM d, yyyy")}`
                    }
                  </div>
                )}
              </div>
            </div>
            
            <Button
              onClick={() => {
                console.log('Export button clicked. Selected exports:', selectedExports)
                exportData()
              }}
              disabled={isExporting || selectedExports.length === 0}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              title={selectedExports.length === 0 ? "Please select at least one data type to export" : "Click to export selected data"}
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export Selected Data
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Currency Settings Section */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <DollarSign className="h-5 w-5 text-primary" />
              Currency Settings
            </CardTitle>
            <CardDescription>
              Set your preferred currency for display
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">
                Preferred Currency
              </label>
              <Select value={tempCurrency} onValueChange={setTempCurrency} disabled={settingsLoading}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {CURRENCIES.map((curr) => (
                    <SelectItem key={curr.code} value={curr.code}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{curr.symbol}</span>
                        <span>{curr.name} ({curr.code})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={saveCurrencyPreference}
              className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            >
              Save Currency Preference
            </Button>

            <div className="text-xs text-muted-foreground">
              <p>Note: Currency preference is saved locally and affects display formatting throughout the app.</p>
            </div>
          </CardContent>
        </Card>

        {/* Location Settings Section */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <MapPin className="h-5 w-5 text-primary" />
              Location Settings
            </CardTitle>
            <CardDescription>
              Set your location for proper date formatting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-card-foreground">
                Your Location
              </label>
              <Select value={tempLocation} onValueChange={setTempLocation} disabled={settingsLoading}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {LOCATIONS.map((loc) => (
                    <SelectItem key={loc.code} value={loc.code}>
                      <div className="flex flex-col">
                        <span>{loc.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {loc.dateFormat}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Preview:</p>
              <p className="text-sm font-medium">
                {(() => {
                  const selectedLocation = LOCATIONS.find(loc => loc.code === tempLocation)
                  const today = new Date()
                  
                  switch (selectedLocation?.dateFormat) {
                    case "dd/MM/yyyy":
                      return `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`
                    case "dd.MM.yyyy":
                      return `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`
                    case "yyyy/MM/dd":
                      return `${today.getFullYear()}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}`
                    default:
                      return `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`
                  }
                })()}
              </p>
            </div>

            <Button
              onClick={saveLocationPreference}
              className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            >
              Save Location Preference
            </Button>

            <div className="text-xs text-muted-foreground">
              <p>Note: Location preference affects date formatting throughout the app.</p>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Subscription Management */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <DollarSign className="h-5 w-5 text-primary" />
              Subscription & Billing
            </CardTitle>
            <CardDescription>
              Manage your subscription, billing, and upgrade your plan
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SubscriptionCheckout />
        </CardContent>
      </Card>

      <div className="flex justify-start">
        <div className="w-full max-w-md">
          {/* Data Management Section */}
          <Card className="bg-card border-border border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <Trash2 className="h-5 w-5 text-destructive" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Permanently delete all your data and reset your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 border border-destructive/50 rounded-lg bg-destructive/5">
                <h4 className="text-sm font-semibold text-destructive mb-2">⚠️ Warning</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  This action will permanently delete ALL your data including inventory, sales, expenses, and user preferences.
                </p>
                <p className="text-xs font-medium text-destructive">
                  This action cannot be undone.
                </p>
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Terminate All Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-destructive">
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                      <p>
                        This action will permanently delete all your ResellAIO data and cannot be undone.
                      </p>
                      <p>
                        Please type <span className="font-mono bg-muted px-1 rounded">DELETE ALL DATA</span> to confirm:
                      </p>
                      <Input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Type DELETE ALL DATA"
                        className="font-mono"
                      />
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConfirmText("")}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={terminateAllData}
                      disabled={isTerminating || confirmText !== "DELETE ALL DATA"}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {isTerminating ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Deleting...
                        </>
                      ) : (
                        "Delete Everything"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}