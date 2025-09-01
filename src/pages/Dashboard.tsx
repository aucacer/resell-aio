import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { useIsMobile } from "@/hooks/use-mobile"
import { DollarSign, TrendingUp, Calculator, Award, CalendarIcon, Receipt, ArrowUp, ArrowDown, Percent, AlertTriangle, Clock } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts"
import { formatDateByLocation } from "@/lib/dateUtils"
import { format, differenceInMonths } from "date-fns"
import { useNavigate, useSearchParams } from "react-router-dom"
import { PaymentSuccessHandler } from "@/components/PaymentSuccessHandler"
import { cn } from "@/lib/utils"
import type { DateRange } from "react-day-picker"

interface DashboardMetrics {
  totalInventoryValue: number
  totalInventoryItems: number
  totalSales: number
  monthlySales: number
  monthlySalesChange: number | null
  totalProfit: number
  totalProfitChange: number | null
  totalExpenses: number
  monthlyExpenses: number
  monthlyExpensesChange: number | null
  netProfit: number
  netProfitChange: number | null
  monthlyROI: number
  monthlyROIChange: number | null
  yearlyROI: number
  yearlyROIChange: number | null
  agedStock: Array<{
    id: string
    item_name: string
    purchase_price: number
    purchase_date: string
    age_months: number
  }>
  hasMoreAgedStock: boolean
  topBrands: Array<{
    brand: string
    totalProfit: number
    itemsSold: number
  }>
}

interface ChartData {
  date: string
  profit: number
}

interface SalesChartData {
  date: string
  sales: number
}

type TimePeriod = '1d' | '1w' | '1m' | '3m' | '6m' | 'ytd' | 'lastyear'

const PercentageIndicator = ({ change }: { change: number | null }) => {
  if (change === null) return null
  
  const isPositive = change >= 0
  const Icon = isPositive ? ArrowUp : ArrowDown
  const color = isPositive ? 'text-success' : 'text-destructive'
  
  return (
    <div className={`flex items-center gap-0.5 text-xs ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="font-medium">{Math.abs(change).toFixed(1)}%</span>
    </div>
  )
}

const formatAge = (months: number): string => {
  if (months < 12) {
    return `${months} month${months !== 1 ? 's' : ''}`
  }
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  if (remainingMonths === 0) {
    return `${years} year${years !== 1 ? 's' : ''}`
  }
  return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`
}

export default function Dashboard() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalInventoryValue: 0,
    totalInventoryItems: 0,
    totalSales: 0,
    monthlySales: 0,
    monthlySalesChange: null,
    totalProfit: 0,
    totalProfitChange: null,
    totalExpenses: 0,
    monthlyExpenses: 0,
    monthlyExpensesChange: null,
    netProfit: 0,
    netProfitChange: null,
    monthlyROI: 0,
    monthlyROIChange: null,
    yearlyROI: 0,
    yearlyROIChange: null,
    agedStock: [],
    hasMoreAgedStock: false,
    topBrands: []
  })
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [salesChartData, setSalesChartData] = useState<SalesChartData[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('ytd')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>()
  const [isCustomDateRange, setIsCustomDateRange] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<TimePeriod>('ytd')
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  useEffect(() => {
    if (user) {
      fetchDashboardData()
      fetchChartData(selectedPeriod)
      fetchSalesChartData(selectedPeriod)
    }
  }, [user, selectedPeriod, isCustomDateRange, dateRange])

  // Realtime updates: refresh metrics and chart when sales change for this user
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('dashboard-sales-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sales',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchDashboardData()
        fetchChartData(selectedPeriod)
        fetchSalesChartData(selectedPeriod)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, selectedPeriod])

  const getDateRange = (period: TimePeriod) => {
    const now = new Date()
    const startDate = new Date()
    
    switch (period) {
      case '1d':
        startDate.setDate(now.getDate() - 1)
        break
      case '1w':
        startDate.setDate(now.getDate() - 7)
        break
      case '1m':
        startDate.setMonth(now.getMonth() - 1)
        break
      case '3m':
        startDate.setMonth(now.getMonth() - 3)
        break
      case '6m':
        startDate.setMonth(now.getMonth() - 6)
        break
      case 'ytd':
        startDate.setMonth(0, 1) // January 1st of current year
        break
      case 'lastyear': {
        startDate.setFullYear(now.getFullYear() - 1, 0, 1) // January 1st of last year
        const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31) // December 31st of last year
        return { startDate, endDate: endOfLastYear }
      }
    }
    
    return { startDate, endDate: now }
  }

  const getEffectiveDateRange = () => {
    if (isCustomDateRange && dateRange?.from && dateRange?.to) {
      return { startDate: dateRange.from, endDate: dateRange.to }
    }
    return getDateRange(selectedPeriod)
  }

  const fetchSalesChartData = async (period: TimePeriod) => {
    try {
      const { startDate, endDate } = getEffectiveDateRange()
      
      // Format dates as YYYY-MM-DD for proper comparison
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]
      
      console.log('Fetching sales chart data from', startDateStr, 'to', endDateStr)
      
      const { data: sales, error } = await supabase
        .from('sales')
        .select('sale_price, sale_date')
        .eq('user_id', user?.id)
        .gte('sale_date', startDateStr)
        .lte('sale_date', endDateStr)
        .order('sale_date', { ascending: true })

      if (error) {
        console.error('Error fetching sales data:', error)
        setSalesChartData([])
        return
      }

      if (!sales || sales.length === 0) {
        console.log('No sales data found for the selected period')
        setSalesChartData([])
        return
      }

      console.log('Found sales data:', sales)

      // Group sales by date
      const salesByDate = sales.reduce((acc, sale) => {
        const date = sale.sale_date
        acc[date] = (acc[date] || 0) + sale.sale_price
        return acc
      }, {} as Record<string, number>)

      console.log('Sales by date:', salesByDate)

      // Create cumulative sales data
      const sortedDates = Object.keys(salesByDate).sort()
      let cumulativeSales = 0
      
      const salesChartData = sortedDates.map(date => {
        cumulativeSales += salesByDate[date]
        return {
          date: new Date(date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          }),
          sales: cumulativeSales
        }
      })

      console.log('Sales chart data:', salesChartData)
      setSalesChartData(salesChartData)
    } catch (error) {
      console.error('Error fetching sales chart data:', error)
      setSalesChartData([])
    }
  }

  const fetchChartData = async (period: TimePeriod) => {
    try {
      const { startDate, endDate } = getEffectiveDateRange()
      
      // Format dates as YYYY-MM-DD for proper comparison
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]
      
      console.log('Fetching chart data from', startDateStr, 'to', endDateStr)
      
      const { data: sales, error } = await supabase
        .from('sales')
        .select('profit, sale_date')
        .eq('user_id', user?.id)
        .gte('sale_date', startDateStr)
        .lte('sale_date', endDateStr)
        .order('sale_date', { ascending: true })

      if (error) {
        console.error('Error fetching sales data:', error)
        setChartData([])
        return
      }

      if (!sales || sales.length === 0) {
        console.log('No sales data found for the selected period')
        setChartData([])
        return
      }

      console.log('Found sales data:', sales)

      // Group profits by date
      const profitByDate = sales.reduce((acc, sale) => {
        const date = sale.sale_date
        acc[date] = (acc[date] || 0) + sale.profit
        return acc
      }, {} as Record<string, number>)

      console.log('Profit by date:', profitByDate)

      // Create cumulative profit data
      const sortedDates = Object.keys(profitByDate).sort()
      let cumulativeProfit = 0
      
      const chartData = sortedDates.map(date => {
        cumulativeProfit += profitByDate[date]
        return {
          date: new Date(date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          }),
          profit: cumulativeProfit
        }
      })

      console.log('Chart data:', chartData)
      setChartData(chartData)
    } catch (error) {
      console.error('Error fetching chart data:', error)
      setChartData([])
    }
  }

  const fetchDashboardData = async () => {
    try {
      // Get current and previous month dates
      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      
      const prevMonthDate = new Date(currentYear, currentMonth - 1, 1)
      const prevMonth = prevMonthDate.getMonth()
      const prevYear = prevMonthDate.getFullYear()
      
      // Fetch inventory metrics
      const { data: inventory } = await supabase
        .from('inventory')
        .select('purchase_price, market_value')
        .eq('user_id', user?.id)
        .eq('is_sold', false)

      // Fetch all sales data
      const { data: allSales } = await supabase
        .from('sales')
        .select(`
          sale_price, 
          profit, 
          item_name, 
          sale_date, 
          id,
          purchase_price,
          fees,
          shipping_cost,
          inventory(brand)
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })

      // Fetch aged inventory items (older than 10 months)
      const { data: agedInventory } = await supabase
        .from('inventory')
        .select('id, item_name, purchase_price, purchase_date')
        .eq('user_id', user?.id)
        .eq('is_sold', false)
        .order('purchase_date', { ascending: true })

      // Fetch all expenses (for calculating current and previous month expenses)
      const { data: allExpenses } = await supabase
        .from('expenses')
        .select('amount, expense_date')
        .eq('user_id', user?.id)

      // Fetch top brands by profit
      const { data: brandData } = await supabase
        .from('sales')
        .select(`
          profit,
          inventory!inner(brand)
        `)
        .eq('user_id', user?.id)
        .not('inventory.brand', 'is', null)


      const totalInventoryValue = inventory?.reduce((sum, item) => 
        sum + (item.market_value || item.purchase_price), 0) || 0
      
      // Calculate overall totals
      const totalSales = allSales?.reduce((sum, sale) => sum + sale.sale_price, 0) || 0
      const totalProfit = allSales?.reduce((sum, sale) => sum + sale.profit, 0) || 0
      const totalExpenses = allExpenses?.reduce((sum, expense) => sum + expense.amount, 0) || 0
      
      // Calculate current month metrics
      const currentMonthSales = allSales?.filter(sale => {
        const saleDate = new Date(sale.sale_date)
        return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear
      }) || []
      
      const currentMonthExpenses = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date)
        return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear
      }) || []
      
      const currentMonthProfit = currentMonthSales.reduce((sum, sale) => sum + sale.profit, 0)
      const monthlySales = currentMonthSales.reduce((sum, sale) => sum + sale.sale_price, 0)
      const monthlyExpenses = currentMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0)
      
      // Calculate previous month metrics
      const prevMonthSales = allSales?.filter(sale => {
        const saleDate = new Date(sale.sale_date)
        return saleDate.getMonth() === prevMonth && saleDate.getFullYear() === prevYear
      }) || []
      
      const prevMonthExpenses = allExpenses?.filter(expense => {
        const expenseDate = new Date(expense.expense_date)
        return expenseDate.getMonth() === prevMonth && expenseDate.getFullYear() === prevYear
      }) || []
      
      const prevMonthProfit = prevMonthSales.reduce((sum, sale) => sum + sale.profit, 0)
      const prevMonthSalesTotal = prevMonthSales.reduce((sum, sale) => sum + sale.sale_price, 0)
      const prevMonthExpensesTotal = prevMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0)
      const prevMonthNetProfit = prevMonthProfit - prevMonthExpensesTotal
      
      // Calculate percentage changes
      const calculatePercentageChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : null
        return ((current - previous) / previous) * 100
      }
      
      const monthlySalesChange = calculatePercentageChange(monthlySales, prevMonthSalesTotal)
      const totalProfitChange = calculatePercentageChange(currentMonthProfit, prevMonthProfit)
      const monthlyExpensesChange = calculatePercentageChange(monthlyExpenses, prevMonthExpensesTotal)
      const currentMonthNetProfit = currentMonthProfit - monthlyExpenses
      const netProfitChange = calculatePercentageChange(currentMonthNetProfit, prevMonthNetProfit)
      
      const netProfit = totalProfit - totalExpenses

      // Calculate monthly and yearly ROI
      // ROI = ((Net Return - Cost Price) / Cost Price) * 100
      // Net Return = Sale Price - Platform Fees - Shipping Cost
      
      // For monthly ROI, calculate total cost and net return for current month
      const currentMonthCost = currentMonthSales.reduce((sum, sale) => {
        return sum + (sale.purchase_price || 0)
      }, 0)
      
      const currentMonthNetReturn = currentMonthSales.reduce((sum, sale) => {
        const netReturn = sale.sale_price - (sale.fees || 0) - (sale.shipping_cost || 0)
        return sum + netReturn
      }, 0)
      
      const monthlyROI = currentMonthCost > 0 ? ((currentMonthNetReturn - currentMonthCost) / currentMonthCost) * 100 : 0
      
      // For yearly ROI, calculate total cost and net return for current year
      const currentYearSales = allSales?.filter(sale => {
        const saleDate = new Date(sale.sale_date)
        return saleDate.getFullYear() === currentYear
      }) || []
      
      const currentYearCost = currentYearSales.reduce((sum, sale) => {
        return sum + (sale.purchase_price || 0)
      }, 0)
      
      const currentYearNetReturn = currentYearSales.reduce((sum, sale) => {
        const netReturn = sale.sale_price - (sale.fees || 0) - (sale.shipping_cost || 0)
        return sum + netReturn
      }, 0)
      
      const currentYearProfit = currentYearSales.reduce((sum, sale) => sum + sale.profit, 0)
      const yearlyROI = currentYearCost > 0 ? ((currentYearNetReturn - currentYearCost) / currentYearCost) * 100 : 0
      
      // Calculate previous month ROI for comparison
      const prevMonthCost = prevMonthSales.reduce((sum, sale) => {
        return sum + (sale.purchase_price || 0)
      }, 0)
      
      const prevMonthNetReturn = prevMonthSales.reduce((sum, sale) => {
        const netReturn = sale.sale_price - (sale.fees || 0) - (sale.shipping_cost || 0)
        return sum + netReturn
      }, 0)
      
      const prevMonthROI = prevMonthCost > 0 ? ((prevMonthNetReturn - prevMonthCost) / prevMonthCost) * 100 : 0
      const monthlyROIChange = prevMonthROI > 0 ? ((monthlyROI - prevMonthROI) / prevMonthROI) * 100 : monthlyROI > 0 ? 100 : null
      
      // Calculate previous year ROI for comparison
      const prevYearSales = allSales?.filter(sale => {
        const saleDate = new Date(sale.sale_date)
        return saleDate.getFullYear() === (currentYear - 1)
      }) || []
      
      const prevYearCost = prevYearSales.reduce((sum, sale) => {
        return sum + (sale.purchase_price || 0)
      }, 0)
      
      const prevYearNetReturn = prevYearSales.reduce((sum, sale) => {
        const netReturn = sale.sale_price - (sale.fees || 0) - (sale.shipping_cost || 0)
        return sum + netReturn
      }, 0)
      
      const prevYearProfit = prevYearSales.reduce((sum, sale) => sum + sale.profit, 0)
      const prevYearROI = prevYearCost > 0 ? ((prevYearNetReturn - prevYearCost) / prevYearCost) * 100 : 0
      const yearlyROIChange = prevYearROI > 0 ? ((yearlyROI - prevYearROI) / prevYearROI) * 100 : yearlyROI > 0 ? 100 : null

      // Calculate top brands
      const brandProfits = brandData?.reduce((acc, sale) => {
        const rawBrand = (sale.inventory as { brand?: string })?.brand
        // Normalize brand name - trim whitespace and use consistent casing for aggregation
        const brand = rawBrand?.trim()
        
        if (brand) {
          // Use normalized brand as key
          if (!acc[brand]) {
            acc[brand] = { totalProfit: 0, itemsSold: 0 }
          }
          acc[brand].totalProfit += sale.profit || 0
          acc[brand].itemsSold += 1
        }
        return acc
      }, {} as Record<string, { totalProfit: number, itemsSold: number }>) || {}
      

      const allBrands = Object.entries(brandProfits)
        .map(([brand, data]) => ({
          brand,
          totalProfit: data.totalProfit,
          itemsSold: data.itemsSold
        }))
        .sort((a, b) => b.totalProfit - a.totalProfit)
      
      // Get top 4 brands and calculate "Other" category
      const top4Brands = allBrands.slice(0, 4)
      const otherBrands = allBrands.slice(4)
      
      const topBrands = otherBrands.length > 0
        ? [
            ...top4Brands,
            {
              brand: 'Other',
              totalProfit: otherBrands.reduce((sum, brand) => sum + brand.totalProfit, 0),
              itemsSold: otherBrands.reduce((sum, brand) => sum + brand.itemsSold, 0)
            }
          ]
        : [...top4Brands]

      // Process aged inventory items
      const processedAgedStock = agedInventory?.map(item => {
        const purchaseDate = new Date(item.purchase_date)
        const ageMonths = differenceInMonths(now, purchaseDate)
        return {
          ...item,
          age_months: ageMonths
        }
      }).filter(item => item.age_months >= 10) || []

      // Sort by oldest first and limit to 4 for dashboard
      const displayAgedStock = processedAgedStock.slice(0, 4)
      const hasMoreAgedStock = processedAgedStock.length > 4

      setMetrics({
        totalInventoryValue,
        totalInventoryItems: inventory?.length || 0,
        totalSales,
        monthlySales,
        monthlySalesChange,
        totalProfit,
        totalProfitChange,
        totalExpenses,
        monthlyExpenses,
        monthlyExpensesChange,
        netProfit,
        netProfitChange,
        monthlyROI,
        monthlyROIChange,
        yearlyROI,
        yearlyROIChange,
        agedStock: displayAgedStock,
        hasMoreAgedStock,
        topBrands
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="bg-gradient-card shadow-card">
              <CardContent className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-8 bg-muted rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 lg:space-y-6 w-full max-w-full overflow-hidden">
      <PaymentSuccessHandler />
      <div className="space-y-1 lg:space-y-2 px-4 sm:px-6 lg:px-0">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm lg:text-base text-muted-foreground">Overview of your reselling business</p>
      </div>

      {/* Desktop Layout - Cards first, then charts */}
      <div className="hidden sm:block space-y-4 lg:space-y-6">
        {/* Key Metrics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-3 lg:gap-6 mx-6 lg:mx-0">
          {/* 1. Monthly Sales */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Monthly Sales
              </CardTitle>
              <DollarSign className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-foreground">
                ${metrics.monthlySales.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { month: 'short' })} Revenue
                </p>
                <PercentageIndicator change={metrics.monthlySalesChange} />
              </div>
            </CardContent>
          </Card>

          {/* 2. Monthly ROI */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Monthly ROI
              </CardTitle>
              <Percent className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-foreground">
                {metrics.monthlyROI.toFixed(1)}%
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { month: 'short' })} Return
                </p>
                <PercentageIndicator change={metrics.monthlyROIChange} />
              </div>
            </CardContent>
          </Card>

          {/* 3. Total Sales YTD */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Total Sales YTD
              </CardTitle>
              <DollarSign className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-foreground">
                ${metrics.totalSales.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Jan 1 - {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </CardContent>
          </Card>

          {/* 4. Total Profit YTD */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Total Profit YTD
              </CardTitle>
              <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-success">
                ${metrics.totalProfit.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Jan 1 - {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <PercentageIndicator change={metrics.totalProfitChange} />
              </div>
            </CardContent>
          </Card>

          {/* 5. Monthly Expenses */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Monthly Expenses
              </CardTitle>
              <Receipt className="h-3 w-3 lg:h-4 lg:w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-foreground">
                ${metrics.monthlyExpenses.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { month: 'short' })}
                </p>
                <PercentageIndicator change={metrics.monthlyExpensesChange} />
              </div>
            </CardContent>
          </Card>

          {/* 6. Net Profit YTD */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Net Profit YTD
              </CardTitle>
              <Calculator className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={`text-lg lg:text-2xl font-bold ${metrics.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                ${metrics.netProfit.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Jan 1 - {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <PercentageIndicator change={metrics.netProfitChange} />
              </div>
            </CardContent>
          </Card>

          {/* 7. Yearly ROI */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Yearly ROI
              </CardTitle>
              <Percent className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-foreground">
                {metrics.yearlyROI.toFixed(1)}%
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date().getFullYear()} Return
                </p>
                <PercentageIndicator change={metrics.yearlyROIChange} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Date Range Picker - Above both charts */}
        <div className="mx-6 lg:mx-0 mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">Analytics Overview</h3>
            <div className="flex items-center gap-2">
              {isMobile ? (
                <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                  <DrawerTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        (!dateRange && !selectedPeriod) && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {isCustomDateRange && dateRange?.from && dateRange?.to 
                        ? `${format(dateRange.from, "MMM d")} ~ ${format(dateRange.to, "MMM d, yyyy")}`
                        : selectedPeriod === '1d' ? 'Last 1 Day' :
                          selectedPeriod === '1w' ? 'Last 1 Week' : 
                          selectedPeriod === '1m' ? 'Last 1 Month' : 
                          selectedPeriod === '3m' ? 'Last 3 Months' : 
                          selectedPeriod === '6m' ? 'Last 6 Months' : 
                          selectedPeriod === 'ytd' ? 'Year to Date' :
                          selectedPeriod === 'lastyear' ? 'Last Year' : 'Select period'
                      }
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent className="max-h-[90vh]">
                    <DrawerHeader>
                      <DrawerTitle>Select Date Range</DrawerTitle>
                    </DrawerHeader>
                    
                    <div className="px-4 pb-4 space-y-6 overflow-y-auto">
                      {/* Preset Options - Mobile First */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-muted-foreground">Quick Presets</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {(['1d', '1w', '1m', '3m', '6m', 'ytd', 'lastyear'] as TimePeriod[]).map((period) => (
                            <Button
                              key={period}
                              variant={!isCustomDateRange && selectedPreset === period ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                setSelectedPreset(period)
                                setIsCustomDateRange(false)
                                setTempDateRange(undefined)
                                setDateRange(undefined)
                              }}
                              className="h-12 text-center"
                            >
                              {period === '1d' ? '1 Day' :
                               period === '1w' ? '1 Week' : 
                               period === '1m' ? '1 Month' : 
                               period === '3m' ? '3 Months' : 
                               period === '6m' ? '6 Months' : 
                               period === 'ytd' ? 'Year to Date' :
                               period === 'lastyear' ? 'Last Year' : period}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Date Range */}
                      <div className="space-y-3 border-t border-border pt-4">
                        <h4 className="text-sm font-medium text-muted-foreground">Custom Date Range</h4>
                        <Calendar
                          mode="range"
                          selected={tempDateRange}
                          onSelect={(range) => {
                            setTempDateRange(range)
                            if (range?.from || range?.to) {
                              setIsCustomDateRange(true)
                            }
                          }}
                          numberOfMonths={1}
                          className={cn("w-full pointer-events-auto")}
                        />
                      </div>
                    </div>

                    <DrawerFooter className="px-4 pb-6">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            if (tempDateRange?.from && tempDateRange?.to) {
                              // Apply custom date range
                              setDateRange(tempDateRange)
                              setIsCustomDateRange(true)
                            } else if (selectedPreset !== selectedPeriod) {
                              // Apply preset selection
                              setSelectedPeriod(selectedPreset)
                              setIsCustomDateRange(false)
                              setDateRange(undefined)
                              setTempDateRange(undefined)
                            }
                            setIsDrawerOpen(false)
                          }}
                          disabled={!((tempDateRange?.from && tempDateRange?.to) || (selectedPreset !== selectedPeriod))}
                          className="flex-1"
                        >
                          Apply
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTempDateRange(undefined)
                            setIsDrawerOpen(false)
                          }}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDateRange(undefined)
                          setTempDateRange(undefined)
                          setIsCustomDateRange(false)
                          setSelectedPeriod('ytd')
                          setSelectedPreset('ytd')
                          setIsDrawerOpen(false)
                        }}
                        className="text-destructive"
                      >
                        Clear selection
                      </Button>
                    </DrawerFooter>
                  </DrawerContent>
                </Drawer>
              ) : (
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal min-w-[200px]",
                        (!dateRange && !selectedPeriod) && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {isCustomDateRange && dateRange?.from && dateRange?.to 
                        ? `${format(dateRange.from, "MMM d")} ~ ${format(dateRange.to, "MMM d, yyyy")}`
                        : selectedPeriod === '1d' ? 'Last 1 Day' :
                          selectedPeriod === '1w' ? 'Last 1 Week' : 
                          selectedPeriod === '1m' ? 'Last 1 Month' : 
                          selectedPeriod === '3m' ? 'Last 3 Months' : 
                          selectedPeriod === '6m' ? 'Last 6 Months' : 
                          selectedPeriod === 'ytd' ? 'Year to Date' :
                          selectedPeriod === 'lastyear' ? 'Last Year' : 'Select period'
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex">
                      {/* Calendar Section */}
                      <div className="border-r border-border p-4">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">SELECT DATE RANGE</label>
                          <Calendar
                            mode="range"
                            selected={tempDateRange}
                            onSelect={(range) => {
                              setTempDateRange(range)
                              if (range?.from || range?.to) {
                                setIsCustomDateRange(true)
                              }
                            }}
                            numberOfMonths={2}
                            className={cn("p-0 pointer-events-auto")}
                          />
                        </div>
                        
                        {/* OK and Cancel buttons */}
                        <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                          <Button
                            size="sm"
                            onClick={() => {
                              if (tempDateRange?.from && tempDateRange?.to) {
                                // Apply custom date range
                                setDateRange(tempDateRange)
                                setIsCustomDateRange(true)
                              } else if (selectedPreset !== selectedPeriod) {
                                // Apply preset selection
                                setSelectedPeriod(selectedPreset)
                                setIsCustomDateRange(false)
                                setDateRange(undefined)
                                setTempDateRange(undefined)
                              }
                              setIsPopoverOpen(false)
                            }}
                            disabled={!((tempDateRange?.from && tempDateRange?.to) || (selectedPreset !== selectedPeriod))}
                            className="flex-1"
                          >
                            OK
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTempDateRange(undefined)
                            }}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                      
                      {/* Preset Options */}
                      <div className="w-48 p-4 space-y-2">
                        <div className="space-y-1">
                          {(['1d', '1w', '1m', '3m', '6m', 'ytd', 'lastyear'] as TimePeriod[]).map((period) => (
                            <Button
                              key={period}
                              variant={!isCustomDateRange && selectedPreset === period ? "default" : "ghost"}
                              size="sm"
                              onClick={() => {
                                setSelectedPreset(period)
                                setIsCustomDateRange(false)
                                setTempDateRange(undefined)
                                setDateRange(undefined)
                              }}
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !isCustomDateRange && selectedPreset === period && "bg-primary text-primary-foreground"
                              )}
                            >
                              {period === '1d' ? '1D' :
                               period === '1w' ? '1W' : 
                               period === '1m' ? '1M' : 
                               period === '3m' ? '3M' : 
                               period === '6m' ? '6M' : 
                               period === 'ytd' ? 'YTD' :
                               period === 'lastyear' ? 'Last Year' : period}
                            </Button>
                          ))}
                        </div>
                        
                        <div className="border-t border-border pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDateRange(undefined)
                              setTempDateRange(undefined)
                              setIsCustomDateRange(false)
                              setSelectedPeriod('ytd')
                              setSelectedPreset('ytd')
                            }}
                            className="w-full justify-start text-left font-normal text-destructive"
                          >
                            Clear selection
                          </Button>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>

        {/* Charts Grid - Side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mx-6 lg:mx-0">
          {/* Profit Chart */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="space-y-1 pb-3 lg:pb-4 px-3 sm:px-4 lg:px-6">
              <CardTitle className="text-base lg:text-lg text-foreground">Profit Overview</CardTitle>
            </CardHeader>
        <CardContent className="px-2 sm:px-3 lg:px-6">
          <div className="h-[180px] sm:h-[220px] lg:h-[280px] w-full overflow-hidden">
            {chartData && chartData.length > 0 ? (
              <ChartContainer
                className="aspect-auto h-full w-full"
                config={{
                  profit: {
                    label: "Profit",
                    color: "hsl(var(--primary))",
                  },
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={chartData} 
                    margin={{ 
                      top: 10, 
                      right: 8, 
                      left: 8, 
                      bottom: 10 
                    }}
                  >
                    <defs>
                      <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      className="opacity-60"
                      interval="preserveStartEnd"
                      height={25}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                      className="opacity-60"
                      width={35}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#profitGradient)"
                      dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 5, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="h-6 w-6 lg:h-8 lg:w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm lg:text-base">No sales data available</p>
                  <p className="text-xs lg:text-sm">Make some sales to see your profit chart!</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sales Chart */}
      <Card className="bg-gradient-card shadow-card border-border">
        <CardHeader className="space-y-1 pb-3 lg:pb-4 px-3 sm:px-4 lg:px-6">
          <CardTitle className="text-base lg:text-lg text-foreground">Sales Overview</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-3 lg:px-6">
          <div className="h-[180px] sm:h-[220px] lg:h-[280px] w-full overflow-hidden">
            {salesChartData && salesChartData.length > 0 ? (
              <ChartContainer
                className="aspect-auto h-full w-full"
                config={{
                  sales: {
                    label: "Sales",
                    color: "hsl(142.1 76.2% 36.3%)",
                  },
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={salesChartData} 
                    margin={{ 
                      top: 10, 
                      right: 8, 
                      left: 8, 
                      bottom: 10 
                    }}
                  >
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(142.1 76.2% 36.3%)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(142.1 76.2% 36.3%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      className="opacity-60"
                      interval="preserveStartEnd"
                      height={25}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                      className="opacity-60"
                      width={35}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="hsl(142.1 76.2% 36.3%)"
                      strokeWidth={2}
                      fill="url(#salesGradient)"
                      dot={{ fill: "hsl(142.1 76.2% 36.3%)", strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 5, stroke: "hsl(142.1 76.2% 36.3%)", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <DollarSign className="h-6 w-6 lg:h-8 lg:w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm lg:text-base">No sales data available</p>
                  <p className="text-xs lg:text-sm">Make some sales to see your revenue chart!</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>

        {/* Aged Stock and Top Brands Grid - Side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mx-6 lg:mx-0">
        {/* Aged Stock */}
        <Card className="bg-gradient-card shadow-card border-border">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base lg:text-lg text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 lg:h-5 lg:w-5 text-warning" />
              Aged Stock Attention
            </CardTitle>
            <p className="text-xs lg:text-sm text-muted-foreground">
              Items older than 10 months that need attention
            </p>
          </CardHeader>
          <CardContent>
            {metrics.agedStock.length > 0 ? (
              <>
                <div className="space-y-3">
                  {metrics.agedStock.map((item) => (
                    <div key={item.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border border-border gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate text-sm lg:text-base">{item.item_name}</p>
                        <div className="flex items-center gap-1 text-xs lg:text-sm text-warning">
                          <Clock className="h-3 w-3" />
                          <span className="font-medium">{formatAge(item.age_months)} old</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">Cost</p>
                        <p className="font-medium text-foreground text-sm lg:text-base">${item.purchase_price.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {metrics.hasMoreAgedStock && (
                  <Button 
                    variant="outline" 
                    className="w-full mt-4"
                    onClick={() => navigate('/inventory?filter=aged')}
                  >
                    Show All Aged Stock
                  </Button>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No aged stock items</p>
                <p className="text-xs mt-1">All inventory is less than 10 months old</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Brands by Profit - Horizontal Bar Chart */}
        {metrics.topBrands.length > 0 && (
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base lg:text-lg text-foreground flex items-center gap-2">
                <Award className="h-4 w-4 lg:h-5 lg:w-5 text-warning" />
                Top Brands by Profit
              </CardTitle>
              <p className="text-xs lg:text-sm text-muted-foreground">
                Leading brands this month
              </p>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 lg:px-6">
              <div className="h-[280px] w-full">
                <ChartContainer
                  className="h-full w-full"
                  config={{
                    totalProfit: {
                      label: "Profit",
                      color: "hsl(var(--primary))",
                    },
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={metrics.topBrands}
                      layout="vertical"
                      margin={{
                        top: 5,
                        right: 30,
                        left: 60,
                        bottom: 5,
                      }}
                    >
                      <XAxis 
                        type="number"
                        domain={[0, 'auto']}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                        tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                      />
                      <YAxis
                        dataKey="brand"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                        width={55}
                      />
                      <ChartTooltip
                        cursor={{ fill: 'transparent' }}
                        content={
                          <ChartTooltipContent 
                            hideLabel
                            formatter={(value) => `$${Number(value).toFixed(2)}`}
                          />
                        }
                      />
                      <Bar 
                        dataKey="totalProfit" 
                        radius={[0, 6, 6, 0]}
                        maxBarSize={35}
                      >
                        {metrics.topBrands.map((entry, index) => {
                          // Define gradient of blue colors from light cyan to deep blue
                          const gradientColors = [
                            '#5DCEEF',  // Light cyan/blue (1st bar)
                            '#4DA6E8',  // Medium cyan-blue (2nd bar)
                            '#3D7FE0',  // Medium blue (3rd bar)
                            '#2E59D9',  // Darker blue (4th bar)
                            '#1E3A8A'   // Deep blue (5th bar - Other)
                          ];
                          
                          // Use the "Other" color for the "Other" category, otherwise use index-based color
                          const fillColor = entry.brand === 'Other' 
                            ? gradientColors[4] 
                            : gradientColors[index] || gradientColors[3];
                          
                          return (
                            <Cell 
                              key={`cell-${index}`}
                              fill={fillColor}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
              <div className="mt-4 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <Award className="h-3 w-3 text-warning" />
                  <span className="font-medium text-foreground">
                    {metrics.topBrands[0]?.brand || 'Top brand'} leads with ${metrics.topBrands[0]?.totalProfit.toLocaleString() || 0} in profit
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Total profit across top {metrics.topBrands.length} brands: ${metrics.topBrands.reduce((sum, brand) => sum + brand.totalProfit, 0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div> {/* End desktop layout */}

      {/* Mobile Layout - Charts first, then cards */}
      <div className="block sm:hidden space-y-4">
        {/* Date Range Picker - Above both charts on mobile */}
        <div className="mx-4 mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">Analytics Overview</h3>
            <div className="flex-1">
              <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <DrawerTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal w-full",
                      (!dateRange && !selectedPeriod) && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {isCustomDateRange && dateRange?.from && dateRange?.to 
                      ? `${format(dateRange.from, "MMM d")} ~ ${format(dateRange.to, "MMM d, yyyy")}`
                      : selectedPeriod === '1d' ? 'Last 1 Day' :
                        selectedPeriod === '1w' ? 'Last 1 Week' : 
                        selectedPeriod === '1m' ? 'Last 1 Month' : 
                        selectedPeriod === '3m' ? 'Last 3 Months' : 
                        selectedPeriod === '6m' ? 'Last 6 Months' : 
                        selectedPeriod === 'ytd' ? 'Year to Date' :
                        selectedPeriod === 'lastyear' ? 'Last Year' : 'Select period'
                    }
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="max-h-[90vh]">
                  <DrawerHeader>
                    <DrawerTitle>Select Date Range</DrawerTitle>
                  </DrawerHeader>
                  
                  <div className="px-4 pb-4 space-y-6 overflow-y-auto">
                    {/* Preset Options - Mobile First */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">Quick Presets</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {(['1d', '1w', '1m', '3m', '6m', 'ytd', 'lastyear'] as TimePeriod[]).map((period) => (
                          <Button
                            key={period}
                            variant={!isCustomDateRange && selectedPreset === period ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setSelectedPreset(period)
                              setIsCustomDateRange(false)
                              setTempDateRange(undefined)
                              setDateRange(undefined)
                            }}
                            className="h-12 text-center"
                          >
                            {period === '1d' ? '1 Day' :
                             period === '1w' ? '1 Week' : 
                             period === '1m' ? '1 Month' : 
                             period === '3m' ? '3 Months' : 
                             period === '6m' ? '6 Months' : 
                             period === 'ytd' ? 'Year to Date' :
                             period === 'lastyear' ? 'Last Year' : period}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Date Range */}
                    <div className="space-y-3 border-t border-border pt-4">
                      <h4 className="text-sm font-medium text-muted-foreground">Custom Date Range</h4>
                      <Calendar
                        mode="range"
                        selected={tempDateRange}
                        onSelect={(range) => {
                          setTempDateRange(range)
                          if (range?.from || range?.to) {
                            setIsCustomDateRange(true)
                          }
                        }}
                        numberOfMonths={1}
                        className={cn("w-full pointer-events-auto")}
                      />
                    </div>
                  </div>

                  <DrawerFooter className="px-4 pb-6">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          if (tempDateRange?.from && tempDateRange?.to) {
                            // Apply custom date range
                            setDateRange(tempDateRange)
                            setIsCustomDateRange(true)
                          } else if (selectedPreset !== selectedPeriod) {
                            // Apply preset selection
                            setSelectedPeriod(selectedPreset)
                            setIsCustomDateRange(false)
                            setDateRange(undefined)
                            setTempDateRange(undefined)
                          }
                          setIsDrawerOpen(false)
                        }}
                        disabled={!((tempDateRange?.from && tempDateRange?.to) || (selectedPreset !== selectedPeriod))}
                        className="flex-1"
                      >
                        Apply
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setTempDateRange(undefined)
                          setIsDrawerOpen(false)
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDateRange(undefined)
                        setTempDateRange(undefined)
                        setIsCustomDateRange(false)
                        setSelectedPeriod('ytd')
                        setSelectedPreset('ytd')
                        setIsDrawerOpen(false)
                      }}
                      className="text-destructive"
                    >
                      Clear selection
                    </Button>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
        </div>
        
        {/* Charts Grid - Stacked on mobile */}
        <div className="grid grid-cols-1 gap-4 mx-4">
          {/* Profit Chart */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="space-y-1 pb-3 px-3">
              <CardTitle className="text-base text-foreground">Profit Overview</CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              <div className="h-[180px] w-full overflow-hidden">
                {chartData && chartData.length > 0 ? (
                  <ChartContainer
                    className="aspect-auto h-full w-full"
                    config={{
                      profit: {
                        label: "Profit",
                        color: "hsl(var(--primary))",
                      },
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart 
                        data={chartData} 
                        margin={{ 
                          top: 10, 
                          right: 8, 
                          left: 8, 
                          bottom: 10 
                        }}
                      >
                        <defs>
                          <linearGradient id="profitGradientMobile" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                          tickLine={false}
                          axisLine={false}
                          className="opacity-60"
                          interval="preserveStartEnd"
                          height={25}
                        />
                        <YAxis 
                          tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                          className="opacity-60"
                          width={35}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="profit"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          fill="url(#profitGradientMobile)"
                          dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 3 }}
                          activeDot={{ r: 5, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <TrendingUp className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No sales data available</p>
                      <p className="text-xs">Make some sales to see your profit chart!</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sales Chart */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="space-y-1 pb-3 px-3">
              <CardTitle className="text-base text-foreground">Sales Overview</CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              <div className="h-[180px] w-full overflow-hidden">
                {salesChartData && salesChartData.length > 0 ? (
                  <ChartContainer
                    className="aspect-auto h-full w-full"
                    config={{
                      sales: {
                        label: "Sales",
                        color: "hsl(142.1 76.2% 36.3%)",
                      },
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart 
                        data={salesChartData} 
                        margin={{ 
                          top: 10, 
                          right: 8, 
                          left: 8, 
                          bottom: 10 
                        }}
                      >
                        <defs>
                          <linearGradient id="salesGradientMobile" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142.1 76.2% 36.3%)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(142.1 76.2% 36.3%)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                          tickLine={false}
                          axisLine={false}
                          className="opacity-60"
                          interval="preserveStartEnd"
                          height={25}
                        />
                        <YAxis 
                          tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                          className="opacity-60"
                          width={35}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          stroke="hsl(142.1 76.2% 36.3%)"
                          strokeWidth={2}
                          fill="url(#salesGradientMobile)"
                          dot={{ fill: "hsl(142.1 76.2% 36.3%)", strokeWidth: 2, r: 3 }}
                          activeDot={{ r: 5, stroke: "hsl(142.1 76.2% 36.3%)", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <DollarSign className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No sales data available</p>
                      <p className="text-xs">Make some sales to see your revenue chart!</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Key Metrics Cards - After charts on mobile */}
        <div className="grid grid-cols-1 gap-3 mx-4">
          {/* 1. Monthly Sales */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-foreground">
                Monthly Sales
              </CardTitle>
              <DollarSign className="h-3 w-3 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-foreground">
                ${metrics.monthlySales.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { month: 'short' })} Revenue
                </p>
                <PercentageIndicator change={metrics.monthlySalesChange} />
              </div>
            </CardContent>
          </Card>

          {/* 2. Monthly ROI */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-foreground">
                Monthly ROI
              </CardTitle>
              <Percent className="h-3 w-3 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-foreground">
                {metrics.monthlyROI.toFixed(1)}%
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { month: 'short' })} Return
                </p>
                <PercentageIndicator change={metrics.monthlyROIChange} />
              </div>
            </CardContent>
          </Card>

          {/* 3. Total Sales YTD */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-foreground">
                Total Sales YTD
              </CardTitle>
              <DollarSign className="h-3 w-3 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-foreground">
                ${metrics.totalSales.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Jan 1 - {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </CardContent>
          </Card>

          {/* 4. Total Profit YTD */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-foreground">
                Total Profit YTD
              </CardTitle>
              <TrendingUp className="h-3 w-3 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-success">
                ${metrics.totalProfit.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Jan 1 - {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <PercentageIndicator change={metrics.totalProfitChange} />
              </div>
            </CardContent>
          </Card>

          {/* 5. Monthly Expenses */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-foreground">
                Monthly Expenses
              </CardTitle>
              <Receipt className="h-3 w-3 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-foreground">
                ${metrics.monthlyExpenses.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { month: 'short' })}
                </p>
                <PercentageIndicator change={metrics.monthlyExpensesChange} />
              </div>
            </CardContent>
          </Card>

          {/* 6. Net Profit YTD */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-foreground">
                Net Profit YTD
              </CardTitle>
              <Calculator className="h-3 w-3 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={`text-lg font-bold ${metrics.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                ${metrics.netProfit.toLocaleString()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Jan 1 - {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <PercentageIndicator change={metrics.netProfitChange} />
              </div>
            </CardContent>
          </Card>

          {/* 7. Yearly ROI */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-foreground">
                Yearly ROI
              </CardTitle>
              <Percent className="h-3 w-3 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-foreground">
                {metrics.yearlyROI.toFixed(1)}%
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date().getFullYear()} Return
                </p>
                <PercentageIndicator change={metrics.yearlyROIChange} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Aged Stock and Top Brands - Stacked on mobile */}
        <div className="grid grid-cols-1 gap-4 mx-4">
          {/* Aged Stock */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Aged Stock Attention
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Items older than 10 months that need attention
              </p>
            </CardHeader>
            <CardContent>
              {metrics.agedStock.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {metrics.agedStock.map((item) => (
                      <div key={item.id} className="flex flex-col p-3 rounded-lg border border-border gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate text-sm">{item.item_name}</p>
                          <div className="flex items-center gap-1 text-xs text-warning">
                            <Clock className="h-3 w-3" />
                            <span className="font-medium">{formatAge(item.age_months)} old</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Cost</span>
                          <p className="font-medium text-foreground text-sm">${item.purchase_price.toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {metrics.hasMoreAgedStock && (
                    <Button 
                      variant="outline" 
                      className="w-full mt-4"
                      onClick={() => navigate('/inventory?filter=aged')}
                    >
                      Show All Aged Stock
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No aged stock items</p>
                  <p className="text-xs mt-1">All inventory is less than 10 months old</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Brands by Profit - Mobile */}
          {metrics.topBrands.length > 0 && (
            <Card className="bg-gradient-card shadow-card border-border">
              <CardHeader className="space-y-1">
                <CardTitle className="text-base text-foreground flex items-center gap-2">
                  <Award className="h-4 w-4 text-warning" />
                  Top Brands by Profit
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Leading brands this month
                </p>
              </CardHeader>
              <CardContent className="px-3">
                <div className="h-[280px] w-full">
                  <ChartContainer
                    className="h-full w-full"
                    config={{
                      totalProfit: {
                        label: "Profit",
                        color: "hsl(var(--primary))",
                      },
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={metrics.topBrands}
                        layout="vertical"
                        margin={{
                          top: 5,
                          right: 30,
                          left: 60,
                          bottom: 5,
                        }}
                      >
                        <XAxis 
                          type="number"
                          domain={[0, 'auto']}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                          tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                        />
                        <YAxis
                          dataKey="brand"
                          type="category"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                          width={55}
                        />
                        <ChartTooltip
                          cursor={{ fill: 'transparent' }}
                          content={
                            <ChartTooltipContent 
                              hideLabel
                              formatter={(value) => `$${Number(value).toFixed(2)}`}
                            />
                          }
                        />
                        <Bar 
                          dataKey="totalProfit" 
                          radius={[0, 6, 6, 0]}
                          maxBarSize={35}
                        >
                          {metrics.topBrands.map((entry, index) => {
                            const gradientColors = [
                              '#5DCEEF',
                              '#4DA6E8',
                              '#3D7FE0',
                              '#2E59D9',
                              '#1E3A8A'
                            ];
                            
                            const fillColor = entry.brand === 'Other' 
                              ? gradientColors[4] 
                              : gradientColors[index] || gradientColors[3];
                            
                            return (
                              <Cell 
                                key={`cell-${index}`}
                                fill={fillColor}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
                <div className="mt-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Award className="h-3 w-3 text-warning" />
                    <span className="font-medium text-foreground">
                      {metrics.topBrands[0]?.brand || 'Top brand'} leads with ${metrics.topBrands[0]?.totalProfit.toLocaleString() || 0} in profit
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total profit across top {metrics.topBrands.length} brands: ${metrics.topBrands.reduce((sum, brand) => sum + brand.totalProfit, 0).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div> {/* End mobile layout */}
    </div>
  )
}