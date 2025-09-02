import { useState, useEffect } from "react"
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
import { TrendingUp, DollarSign, Calculator, Percent, CalendarIcon, ArrowUp, ArrowDown, Package, RefreshCw, Clock, AlertTriangle, Receipt } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useNavigate } from "react-router-dom"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { formatDateByLocation } from "@/lib/dateUtils"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import type { DateRange } from "react-day-picker"

interface InsightsMetrics {
  grossSales: number
  netSales: number
  averageGrossPerSale: number
  averageNetPerSale: number
  netProfitMargin: number
  averageNetProfitMarginPerSale: number
  totalSales: number
  totalPurchaseCost: number
  previousGrossSales: number
  previousNetSales: number
  previousAverageGrossPerSale: number
  previousAverageNetPerSale: number
  previousNetProfitMargin: number
  previousAverageNetProfitMarginPerSale: number
  // Inventory Performance KPIs
  sellThroughRate: number
  inventoryTurnover: number
  avgDaysToSell: number
  previousSellThroughRate: number
  previousInventoryTurnover: number
  previousAvgDaysToSell: number
  // Efficiency & Cash Flow KPIs
  monthlyCOGS: number
  ytdCOGS: number
  grossMarginPercent: number
  previousMonthlyCOGS: number
  previousYtdCOGS: number
  previousGrossMarginPercent: number
  // Monthly metrics from Dashboard
  monthlySales: number
  monthlySalesChange: number | null
  monthlyExpenses: number
  monthlyExpensesChange: number | null
  monthlyROI: number
  monthlyROIChange: number | null
  // Aged Stock data
  agedStock: Array<{
    id: string
    item_name: string
    purchase_price: number
    age_months: number
  }>
  hasMoreAgedStock: boolean
}

interface ChartData {
  date: string
  grossSales: number
  netSales: number
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

const formatAge = (months: number) => {
  if (months >= 12) {
    const years = Math.floor(months / 12)
    const remainingMonths = months % 12
    if (remainingMonths === 0) {
      return `${years} year${years > 1 ? 's' : ''}`
    }
    return `${years} year${years > 1 ? 's' : ''} ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`
  }
  return `${months} month${months > 1 ? 's' : ''}`
}

export default function Insights() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [metrics, setMetrics] = useState<InsightsMetrics>({
    grossSales: 0,
    netSales: 0,
    averageGrossPerSale: 0,
    averageNetPerSale: 0,
    netProfitMargin: 0,
    averageNetProfitMarginPerSale: 0,
    totalSales: 0,
    totalPurchaseCost: 0,
    previousGrossSales: 0,
    previousNetSales: 0,
    previousAverageGrossPerSale: 0,
    previousAverageNetPerSale: 0,
    previousNetProfitMargin: 0,
    previousAverageNetProfitMarginPerSale: 0,
    // Inventory Performance KPIs
    sellThroughRate: 0,
    inventoryTurnover: 0,
    avgDaysToSell: 0,
    previousSellThroughRate: 0,
    previousInventoryTurnover: 0,
    previousAvgDaysToSell: 0,
    // Efficiency & Cash Flow KPIs
    monthlyCOGS: 0,
    ytdCOGS: 0,
    grossMarginPercent: 0,
    previousMonthlyCOGS: 0,
    previousYtdCOGS: 0,
    previousGrossMarginPercent: 0,
    // Monthly metrics from Dashboard
    monthlySales: 0,
    monthlySalesChange: null,
    monthlyExpenses: 0,
    monthlyExpensesChange: null,
    monthlyROI: 0,
    monthlyROIChange: null,
    // Aged Stock data
    agedStock: [],
    hasMoreAgedStock: false
  })
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('ytd')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>()
  const [isCustomDateRange, setIsCustomDateRange] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<TimePeriod>('ytd')
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  useEffect(() => {
    if (user) {
      fetchInsightsData()
      fetchChartData()
    }
  }, [user, selectedPeriod, isCustomDateRange, dateRange])

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

  const getPreviousPeriodDateRange = () => {
    const { startDate, endDate } = getEffectiveDateRange()
    const periodLength = endDate.getTime() - startDate.getTime()
    
    const previousEndDate = new Date(startDate.getTime() - 1) // Day before current period starts
    const previousStartDate = new Date(previousEndDate.getTime() - periodLength)
    
    return { startDate: previousStartDate, endDate: previousEndDate }
  }

  const fetchChartData = async () => {
    try {
      const { startDate, endDate } = getEffectiveDateRange()
      
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]
      
      const { data: sales, error } = await supabase
        .from('sales')
        .select('sale_price, fees, shipping_cost, sale_date')
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
        setChartData([])
        return
      }

      // Group sales by date
      const salesByDate = sales.reduce((acc, sale) => {
        const date = sale.sale_date
        if (!acc[date]) {
          acc[date] = { grossSales: 0, netSales: 0 }
        }
        const netSale = sale.sale_price - (sale.fees || 0) - (sale.shipping_cost || 0)
        acc[date].grossSales += sale.sale_price
        acc[date].netSales += netSale
        return acc
      }, {} as Record<string, { grossSales: number, netSales: number }>)

      // Create cumulative chart data
      const sortedDates = Object.keys(salesByDate).sort()
      let cumulativeGross = 0
      let cumulativeNet = 0
      
      const chartData = sortedDates.map(date => {
        cumulativeGross += salesByDate[date].grossSales
        cumulativeNet += salesByDate[date].netSales
        return {
          date: new Date(date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          }),
          grossSales: cumulativeGross,
          netSales: cumulativeNet
        }
      })

      setChartData(chartData)
    } catch (error) {
      console.error('Error fetching chart data:', error)
      setChartData([])
    }
  }

  const fetchInsightsData = async () => {
    try {
      const { startDate, endDate } = getEffectiveDateRange()
      const { startDate: prevStartDate, endDate: prevEndDate } = getPreviousPeriodDateRange()
      
      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]
      const prevStartDateStr = prevStartDate.toISOString().split('T')[0]
      const prevEndDateStr = prevEndDate.toISOString().split('T')[0]

      // Check if this is current month or YTD for COGS calculations
      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      const periodStart = new Date(startDate)
      const periodEnd = new Date(endDate)
      
      // Check if we're looking at current month data (period covers current month)
      const isCurrentMonth = periodStart.getMonth() === currentMonth && periodStart.getFullYear() === currentYear && 
                            periodEnd.getMonth() === currentMonth && periodEnd.getFullYear() === currentYear
      
      // Check if we're looking at YTD data (starts Jan 1 of current year)
      const isYTD = periodStart.getMonth() === 0 && periodStart.getDate() === 1 && periodStart.getFullYear() === currentYear

      // Calculate period length in days
      const periodDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // Fetch current period sales with inventory data
      const { data: currentSales } = await supabase
        .from('sales')
        .select(`
          sale_price, 
          fees, 
          shipping_cost, 
          profit, 
          purchase_price, 
          sale_date,
          inventory!inner(purchase_date, purchase_price, id)
        `)
        .eq('user_id', user?.id)
        .gte('sale_date', startDateStr)
        .lte('sale_date', endDateStr)

      // Fetch current month sales separately for Monthly COGS
      const currentMonthStart = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0]
      const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0]
      
      const { data: currentMonthSales } = await supabase
        .from('sales')
        .select('purchase_price')
        .eq('user_id', user?.id)
        .gte('sale_date', currentMonthStart)
        .lte('sale_date', currentMonthEnd)

      // Fetch last month sales separately for Last Month COGS
      const lastMonthStart = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0]
      const lastMonthEnd = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0]
      
      const { data: lastMonthSales } = await supabase
        .from('sales')
        .select('purchase_price')
        .eq('user_id', user?.id)
        .gte('sale_date', lastMonthStart)
        .lte('sale_date', lastMonthEnd)

      // Fetch previous period sales with inventory data
      const { data: previousSales } = await supabase
        .from('sales')
        .select(`
          sale_price, 
          fees, 
          shipping_cost, 
          profit, 
          purchase_price,
          sale_date,
          inventory!inner(purchase_date, purchase_price, id)
        `)
        .eq('user_id', user?.id)
        .gte('sale_date', prevStartDateStr)
        .lte('sale_date', prevEndDateStr)

      // Fetch inventory acquired in current period
      const { data: currentInventory } = await supabase
        .from('inventory')
        .select('id, purchase_price, purchase_date, is_sold')
        .eq('user_id', user?.id)
        .gte('purchase_date', startDateStr)
        .lte('purchase_date', endDateStr)

      // Fetch inventory acquired in previous period
      const { data: previousInventory } = await supabase
        .from('inventory')
        .select('id, purchase_price, purchase_date, is_sold')
        .eq('user_id', user?.id)
        .gte('purchase_date', prevStartDateStr)
        .lte('purchase_date', prevEndDateStr)

      // Calculate beginning inventory value (unsold items at period start)
      const { data: beginningInventory } = await supabase
        .from('inventory')
        .select('purchase_price, market_value')
        .eq('user_id', user?.id)
        .lt('purchase_date', startDateStr)
        .eq('is_sold', false)

      // Calculate ending inventory value (unsold items at period end)
      const { data: endingInventory } = await supabase
        .from('inventory')
        .select('purchase_price, market_value')
        .eq('user_id', user?.id)
        .lte('purchase_date', endDateStr)
        .eq('is_sold', false)

      // Calculate average inventory value
      const beginningValue = beginningInventory?.reduce((sum, item) => 
        sum + (item.market_value || item.purchase_price), 0) || 0
      const endingValue = endingInventory?.reduce((sum, item) => 
        sum + (item.market_value || item.purchase_price), 0) || 0
      const avgInventoryValue = (beginningValue + endingValue) / 2

      // Fetch aged stock data (items older than 10 months)
      const tenMonthsAgo = new Date()
      tenMonthsAgo.setMonth(tenMonthsAgo.getMonth() - 10)
      const tenMonthsAgoStr = tenMonthsAgo.toISOString().split('T')[0]
      
      const { data: agedStockData } = await supabase
        .from('inventory')
        .select('id, item_name, purchase_price, purchase_date')
        .eq('user_id', user?.id)
        .eq('is_sold', false)
        .lt('purchase_date', tenMonthsAgoStr)
        .order('purchase_date', { ascending: true })
        .limit(5)

      // Calculate age in months for each item
      const agedStockWithAge = (agedStockData || []).map(item => {
        const purchaseDate = new Date(item.purchase_date)
        const now = new Date()
        const monthsDiff = (now.getFullYear() - purchaseDate.getFullYear()) * 12 + 
                          (now.getMonth() - purchaseDate.getMonth())
        return {
          ...item,
          age_months: monthsDiff
        }
      })

      // Check if there are more aged stock items
      const { count: totalAgedCount } = await supabase
        .from('inventory')
        .select('id', { count: 'exact' })
        .eq('user_id', user?.id)
        .eq('is_sold', false)
        .lt('purchase_date', tenMonthsAgoStr)

      // Calculate Monthly, Last Month, and YTD COGS separately
      const monthlyCOGS = currentMonthSales?.reduce((sum, sale) => sum + (sale.purchase_price || 0), 0) || 0
      const lastMonthCOGS = lastMonthSales?.reduce((sum, sale) => sum + (sale.purchase_price || 0), 0) || 0
      const ytdCOGS = isYTD ? currentSales?.reduce((sum, sale) => sum + (sale.purchase_price || 0), 0) || 0 : 0

      // Fetch monthly expenses for the monthly metrics cards
      const { data: monthlyExpensesData } = await supabase
        .from('expenses')
        .select('amount')
        .eq('user_id', user?.id)
        .gte('expense_date', currentMonthStart)
        .lte('expense_date', currentMonthEnd)

      const { data: lastMonthExpensesData } = await supabase
        .from('expenses')
        .select('amount')
        .eq('user_id', user?.id)
        .gte('expense_date', lastMonthStart)
        .lte('expense_date', lastMonthEnd)

      // Calculate monthly metrics similar to Dashboard
      const monthlySalesAmount = currentMonthSales?.reduce((sum, sale) => sum + sale.sale_price, 0) || 0
      const lastMonthSalesAmount = lastMonthSales?.reduce((sum, sale) => sum + sale.sale_price, 0) || 0
      const monthlyExpensesAmount = monthlyExpensesData?.reduce((sum, expense) => sum + expense.amount, 0) || 0
      const lastMonthExpensesAmount = lastMonthExpensesData?.reduce((sum, expense) => sum + expense.amount, 0) || 0

      // Calculate monthly ROI
      const currentMonthCost = currentMonthSales?.reduce((sum, sale) => sum + (sale.purchase_price || 0), 0) || 0
      const currentMonthNetReturn = currentMonthSales?.reduce((sum, sale) => {
        const netReturn = sale.sale_price - (sale.fees || 0) - (sale.shipping_cost || 0)
        return sum + netReturn
      }, 0) || 0
      
      const monthlyROI = currentMonthCost > 0 ? ((currentMonthNetReturn - currentMonthCost) / currentMonthCost) * 100 : 0
      
      // Calculate previous month ROI for comparison
      const lastMonthCost = lastMonthSales?.reduce((sum, sale) => sum + (sale.purchase_price || 0), 0) || 0
      const lastMonthNetReturn = lastMonthSales?.reduce((sum, sale) => {
        const netReturn = sale.sale_price - (sale.fees || 0) - (sale.shipping_cost || 0)
        return sum + netReturn
      }, 0) || 0
      
      const lastMonthROI = lastMonthCost > 0 ? ((lastMonthNetReturn - lastMonthCost) / lastMonthCost) * 100 : 0

      // Calculate percentage changes
      const calculatePercentageChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : null
        return ((current - previous) / previous) * 100
      }

      const monthlySalesChange = calculatePercentageChange(monthlySalesAmount, lastMonthSalesAmount)
      const monthlyExpensesChange = calculatePercentageChange(monthlyExpensesAmount, lastMonthExpensesAmount)
      const monthlyROIChange = lastMonthROI > 0 ? calculatePercentageChange(monthlyROI, lastMonthROI) : monthlyROI > 0 ? 100 : null

      // Prepare additional data for current period
      const currentAdditionalData = {
        inventoryAcquired: currentInventory?.length || 0,
        salesWithInventory: currentSales?.map(sale => ({
          ...sale,
          purchase_date: (sale.inventory as any)?.purchase_date,
          sale_date: sale.sale_date
        })) || [],
        avgInventoryValue,
        monthlyCOGS,
        lastMonthCOGS,
        ytdCOGS,
        periodDays
      }

      // Prepare additional data for previous period
      const previousAdditionalData = {
        inventoryAcquired: previousInventory?.length || 0,
        salesWithInventory: previousSales?.map(sale => ({
          ...sale,
          purchase_date: (sale.inventory as any)?.purchase_date,
          sale_date: sale.sale_date
        })) || [],
        avgInventoryValue: 0, // Previous period inventory calculation would be more complex
        isCurrentMonth: false,
        isYTD: false,
        periodDays
      }

      // Calculate current period metrics
      const currentMetrics = calculateMetrics(currentSales || [], currentAdditionalData)
      const previousMetrics = calculateMetrics(previousSales || [], previousAdditionalData)

      setMetrics({
        ...currentMetrics,
        previousGrossSales: previousMetrics.grossSales,
        previousNetSales: previousMetrics.netSales,
        previousAverageGrossPerSale: previousMetrics.averageGrossPerSale,
        previousAverageNetPerSale: previousMetrics.averageNetPerSale,
        previousNetProfitMargin: previousMetrics.netProfitMargin,
        previousAverageNetProfitMarginPerSale: previousMetrics.averageNetProfitMarginPerSale,
        // Previous period inventory KPIs
        previousSellThroughRate: previousMetrics.sellThroughRate,
        previousInventoryTurnover: previousMetrics.inventoryTurnover,
        previousAvgDaysToSell: previousMetrics.avgDaysToSell,
        // Previous period efficiency KPIs - use lastMonthCOGS as previousMonthlyCOGS
        previousMonthlyCOGS: lastMonthCOGS,
        previousYtdCOGS: previousMetrics.ytdCOGS,
        previousGrossMarginPercent: previousMetrics.grossMarginPercent,
        // Monthly metrics from Dashboard
        monthlySales: monthlySalesAmount,
        monthlySalesChange,
        monthlyExpenses: monthlyExpensesAmount,
        monthlyExpensesChange,
        monthlyROI,
        monthlyROIChange,
        // Aged Stock data
        agedStock: agedStockWithAge,
        hasMoreAgedStock: (totalAgedCount || 0) > 5
      })
    } catch (error) {
      console.error('Error fetching insights data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateMetrics = (sales: any[], additionalData?: any): InsightsMetrics => {
    if (!sales || sales.length === 0) {
      return {
        grossSales: 0,
        netSales: 0,
        averageGrossPerSale: 0,
        averageNetPerSale: 0,
        netProfitMargin: 0,
        averageNetProfitMarginPerSale: 0,
        totalSales: 0,
        totalPurchaseCost: 0,
        previousGrossSales: 0,
        previousNetSales: 0,
        previousAverageGrossPerSale: 0,
        previousAverageNetPerSale: 0,
        previousNetProfitMargin: 0,
        previousAverageNetProfitMarginPerSale: 0,
        // Inventory Performance KPIs
        sellThroughRate: 0,
        inventoryTurnover: 0,
        avgDaysToSell: 0,
        previousSellThroughRate: 0,
        previousInventoryTurnover: 0,
        previousAvgDaysToSell: 0,
        // Efficiency & Cash Flow KPIs
        monthlyCOGS: 0,
        ytdCOGS: 0,
        grossMarginPercent: 0,
        previousMonthlyCOGS: 0,
        previousYtdCOGS: 0,
        previousGrossMarginPercent: 0,
        // Monthly metrics from Dashboard
        monthlySales: 0,
        monthlySalesChange: null,
        monthlyExpenses: 0,
        monthlyExpensesChange: null,
        monthlyROI: 0,
        monthlyROIChange: null,
        // Aged Stock data
        agedStock: [],
        hasMoreAgedStock: false
      }
    }

    const grossSales = sales.reduce((sum, sale) => sum + sale.sale_price, 0)
    const totalFees = sales.reduce((sum, sale) => sum + (sale.fees || 0), 0)
    const totalShipping = sales.reduce((sum, sale) => sum + (sale.shipping_cost || 0), 0)
    const totalPurchaseCost = sales.reduce((sum, sale) => sum + (sale.purchase_price || 0), 0)
    
    const netSales = grossSales - totalFees - totalShipping
    const totalSales = sales.length
    
    const averageGrossPerSale = totalSales > 0 ? grossSales / totalSales : 0
    const averageNetPerSale = totalSales > 0 ? netSales / totalSales : 0
    
    // Net Profit Margin = (Net Sales - Total Purchase Costs) / Net Sales * 100
    const netProfitMargin = netSales > 0 ? ((netSales - totalPurchaseCost) / netSales) * 100 : 0
    
    // Average Net Profit Margin per Sale = Average of individual sale profit margins
    const individualMargins = sales.map(sale => {
      const saleNetRevenue = sale.sale_price - (sale.fees || 0) - (sale.shipping_cost || 0)
      return saleNetRevenue > 0 ? ((saleNetRevenue - (sale.purchase_price || 0)) / saleNetRevenue) * 100 : 0
    })
    const averageNetProfitMarginPerSale = totalSales > 0 
      ? individualMargins.reduce((sum, margin) => sum + margin, 0) / totalSales 
      : 0

    // Calculate additional KPIs if data is provided
    let sellThroughRate = 0
    let inventoryTurnover = 0
    let avgDaysToSell = 0
    let monthlyCOGS = 0
    let ytdCOGS = 0
    let grossMarginPercent = 0

    if (additionalData) {
      const { inventoryAcquired, salesWithInventory, avgInventoryValue, monthlyCOGS: providedMonthlyCOGS, lastMonthCOGS: providedLastMonthCOGS, ytdCOGS: providedYtdCOGS, periodDays } = additionalData
      
      // Sell-Through Rate
      if (inventoryAcquired > 0) {
        sellThroughRate = (totalSales / inventoryAcquired) * 100
      }
      
      // Inventory Turnover (annualized)
      if (avgInventoryValue > 0) {
        const cogs = totalPurchaseCost
        inventoryTurnover = cogs / avgInventoryValue
        // Annualize if period is less than a year
        if (periodDays && periodDays < 365) {
          inventoryTurnover = inventoryTurnover * (365 / periodDays)
        }
      }
      
      // Average Days to Sell
      if (salesWithInventory && salesWithInventory.length > 0) {
        const daysDiff = salesWithInventory.map((sale: any) => {
          const purchaseDate = new Date(sale.purchase_date)
          const saleDate = new Date(sale.sale_date)
          return Math.floor((saleDate.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24))
        })
        avgDaysToSell = daysDiff.reduce((sum: number, days: number) => sum + days, 0) / daysDiff.length
      }
      
      // COGS calculations - use pre-calculated values
      monthlyCOGS = providedMonthlyCOGS || 0
      ytdCOGS = providedYtdCOGS || 0
      
      // Gross Margin %
      grossMarginPercent = grossSales > 0 ? ((grossSales - totalPurchaseCost) / grossSales) * 100 : 0
    }

    return {
      grossSales,
      netSales,
      averageGrossPerSale,
      averageNetPerSale,
      netProfitMargin,
      averageNetProfitMarginPerSale,
      totalSales,
      totalPurchaseCost,
      previousGrossSales: 0,
      previousNetSales: 0,
      previousAverageGrossPerSale: 0,
      previousAverageNetPerSale: 0,
      previousNetProfitMargin: 0,
      previousAverageNetProfitMarginPerSale: 0,
      // Inventory Performance KPIs
      sellThroughRate,
      inventoryTurnover,
      avgDaysToSell,
      previousSellThroughRate: 0,
      previousInventoryTurnover: 0,
      previousAvgDaysToSell: 0,
      // Efficiency & Cash Flow KPIs
      monthlyCOGS,
      ytdCOGS,
      grossMarginPercent,
      previousMonthlyCOGS: 0,
      previousYtdCOGS: 0,
      previousGrossMarginPercent: 0,
      // Monthly metrics from Dashboard
      monthlySales: 0,
      monthlySalesChange: null,
      monthlyExpenses: 0,
      monthlyExpensesChange: null,
      monthlyROI: 0,
      monthlyROIChange: null,
      // Aged Stock data
      agedStock: [],
      hasMoreAgedStock: false
    }
  }

  const calculatePercentageChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : null
    return ((current - previous) / previous) * 100
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Insights</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
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
      <div className="space-y-1 lg:space-y-2 px-4 sm:px-6 lg:px-0">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Insights</h1>
        <p className="text-sm lg:text-base text-muted-foreground">Detailed KPIs and analytics for your reselling business</p>
      </div>

      {/* Date Range Picker */}
      <div className="mx-6 lg:mx-0 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">Analytics Period</h3>
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
                    {/* Preset Options */}
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
                            setDateRange(tempDateRange)
                            setIsCustomDateRange(true)
                          } else if (selectedPreset !== selectedPeriod) {
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
                      
                      <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (tempDateRange?.from && tempDateRange?.to) {
                              setDateRange(tempDateRange)
                              setIsCustomDateRange(true)
                            } else if (selectedPreset !== selectedPeriod) {
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
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mx-6 lg:mx-0">
        {/* Average Gross per Sale */}
        <Card className="bg-gradient-card shadow-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
              Average Gross per Sale
            </CardTitle>
            <DollarSign className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-lg lg:text-2xl font-bold text-foreground">
              ${metrics.averageGrossPerSale.toFixed(2)}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Per Sale Average
              </p>
              <PercentageIndicator 
                change={calculatePercentageChange(metrics.averageGrossPerSale, metrics.previousAverageGrossPerSale)} 
              />
            </div>
          </CardContent>
        </Card>

        {/* Average Net per Sale */}
        <Card className="bg-gradient-card shadow-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
              Average Net per Sale
            </CardTitle>
            <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-lg lg:text-2xl font-bold text-success">
              ${metrics.averageNetPerSale.toFixed(2)}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                After Fees & Shipping
              </p>
              <PercentageIndicator 
                change={calculatePercentageChange(metrics.averageNetPerSale, metrics.previousAverageNetPerSale)} 
              />
            </div>
          </CardContent>
        </Card>

        {/* Net Profit Margin */}
        <Card className="bg-gradient-card shadow-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
              Net Profit Margin
            </CardTitle>
            <Percent className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-lg lg:text-2xl font-bold text-foreground">
              {metrics.netProfitMargin.toFixed(1)}%
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Overall Margin
              </p>
              <PercentageIndicator 
                change={calculatePercentageChange(metrics.netProfitMargin, metrics.previousNetProfitMargin)} 
              />
            </div>
          </CardContent>
        </Card>

        {/* Average Net Profit Margin per Sale */}
        <Card className="bg-gradient-card shadow-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
              Avg Net Profit Margin per Sale
            </CardTitle>
            <Calculator className="h-3 w-3 lg:h-4 lg:w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-lg lg:text-2xl font-bold text-foreground">
              {metrics.averageNetProfitMarginPerSale.toFixed(1)}%
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Per Sale Average
              </p>
              <PercentageIndicator 
                change={calculatePercentageChange(metrics.averageNetProfitMarginPerSale, metrics.previousAverageNetProfitMarginPerSale)} 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gross/Net Sales Chart */}
      <div className="mx-6 lg:mx-0">
        <Card className="bg-gradient-card shadow-card border-border">
          <CardHeader className="space-y-1 pb-3 lg:pb-4 px-3 sm:px-4 lg:px-6">
            <CardTitle className="text-base lg:text-lg text-foreground">Gross vs Net Sales</CardTitle>
            <p className="text-xs lg:text-sm text-muted-foreground">
              Cumulative sales comparison over selected period
            </p>
            
            {/* Sales Figures Display */}
            <div className="flex items-center gap-6 lg:gap-8 pt-2 lg:pt-3">
              <div className="flex flex-col">
                <div className="text-xl lg:text-2xl font-bold text-primary">
                  ${metrics.grossSales.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Gross sales</p>
              </div>
              <div className="flex flex-col">
                <div className="text-xl lg:text-2xl font-bold text-success">
                  ${metrics.netSales.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Net sales</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-3 lg:px-6">
            <div className="h-[180px] sm:h-[220px] lg:h-[320px] w-full overflow-hidden">
              {chartData && chartData.length > 0 ? (
                <ChartContainer
                  className="aspect-auto h-full w-full"
                  config={{
                    grossSales: {
                      label: "Gross Sales",
                      color: "hsl(var(--primary))",
                    },
                    netSales: {
                      label: "Net Sales",
                      color: "hsl(142.1 76.2% 36.3%)",
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
                        <linearGradient id="grossGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
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
                        dataKey="grossSales"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#grossGradient)"
                        dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 3 }}
                        activeDot={{ r: 5, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="netSales"
                        stroke="hsl(142.1 76.2% 36.3%)"
                        strokeWidth={2}
                        fill="url(#netGradient)"
                        dot={{ fill: "hsl(142.1 76.2% 36.3%)", strokeWidth: 2, r: 3 }}
                        activeDot={{ r: 5, stroke: "hsl(142.1 76.2% 36.3%)", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <TrendingUp className="h-6 w-6 lg:h-8 lg:w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm lg:text-base">No sales data available</p>
                    <p className="text-xs lg:text-sm">Make some sales to see your analytics!</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Metrics Section */}
      <div className="mx-6 lg:mx-0">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-foreground">Monthly Performance Metrics</h2>
          <p className="text-sm text-muted-foreground">Current month performance compared to previous month</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {/* Monthly Sales */}
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

          {/* Monthly ROI */}
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

          {/* Monthly Expenses */}
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
        </div>
      </div>

      {/* Inventory Performance Section */}
      <div className="mx-6 lg:mx-0">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-success" />
            Inventory Performance
          </h2>
          <p className="text-sm text-muted-foreground">Track how efficiently your inventory moves and generates returns</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          {/* Sell-Through Rate */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Sell-Through Rate (STR)
              </CardTitle>
              <Package className="h-3 w-3 lg:h-4 lg:w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-foreground">
                {metrics.sellThroughRate.toFixed(1)}%
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Items Sold vs Acquired
                </p>
                <PercentageIndicator 
                  change={calculatePercentageChange(metrics.sellThroughRate, metrics.previousSellThroughRate)} 
                />
              </div>
            </CardContent>
          </Card>

          {/* Inventory Turnover */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Inventory Turnover
              </CardTitle>
              <RefreshCw className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-foreground">
                {metrics.inventoryTurnover.toFixed(1)}x
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Times per Year
                </p>
                <PercentageIndicator 
                  change={calculatePercentageChange(metrics.inventoryTurnover, metrics.previousInventoryTurnover)} 
                />
              </div>
            </CardContent>
          </Card>

          {/* Average Days to Sell */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Average Days to Sell
              </CardTitle>
              <Clock className="h-3 w-3 lg:h-4 lg:w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-foreground">
                {Math.round(metrics.avgDaysToSell)}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Days Average
                </p>
                <PercentageIndicator 
                  change={calculatePercentageChange(metrics.avgDaysToSell, metrics.previousAvgDaysToSell)} 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Aged Stock Section */}
        <div className="mt-6">
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
        </div>
      </div>

      {/* Efficiency & Cash Flow Section */}
      <div className="mx-6 lg:mx-0">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            📊 Efficiency & Cash Flow
          </h2>
          <p className="text-sm text-muted-foreground">Monitor cost efficiency and true profitability metrics</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
          {/* Cost of Goods Sold (COGS) */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Cost of Goods Sold (COGS)
              </CardTitle>
              <DollarSign className="h-3 w-3 lg:h-4 lg:w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <div className="text-lg lg:text-xl font-bold text-foreground">
                    ${metrics.monthlyCOGS.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date().toLocaleDateString('en-US', { month: 'short' })} COGS
                  </p>
                </div>
                <div>
                  <div className="text-sm font-semibold text-muted-foreground">
                    ${metrics.previousMonthlyCOGS.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'short' })} COGS
                  </p>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">
                    ${metrics.ytdCOGS.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">YTD COGS</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end">
                <PercentageIndicator 
                  change={calculatePercentageChange(metrics.monthlyCOGS, metrics.previousMonthlyCOGS)} 
                />
              </div>
            </CardContent>
          </Card>

          {/* Gross Margin % */}
          <Card className="bg-gradient-card shadow-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium text-foreground">
                Gross Margin %
              </CardTitle>
              <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-lg lg:text-2xl font-bold text-success">
                {metrics.grossMarginPercent.toFixed(1)}%
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  (Sales - COGS) / Sales
                </p>
                <PercentageIndicator 
                  change={calculatePercentageChange(metrics.grossMarginPercent, metrics.previousGrossMarginPercent)} 
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}