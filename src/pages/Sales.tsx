import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Edit, Package, Truck } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"
import { formatDateByLocation } from "@/lib/dateUtils"
import { RecordSaleDialog } from "@/components/sales/RecordSaleDialog"
import { EditSaleDialog } from "@/components/sales/EditSaleDialog"
import { ShippingManagementDialog } from "@/components/sales/ShippingManagementDialog"
import { PaginationControls } from "@/components/ui/pagination-controls"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface Sale {
  id: string
  item_name: string
  sale_price: number
  purchase_price: number
  profit: number
  sale_date: string
  platform: string
  fees: number
  shipping_cost: number
  notes: string
  created_at: string
  inventory_id: string
  brand: string | null
  is_shipped: boolean
  tracking_number: string | null
  shipped_date: string | null
}

export default function Sales() {
  const { user } = useAuth()
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isShippingDialogOpen, setIsShippingDialogOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [sortField, setSortField] = useState<keyof Sale>('sale_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('salesPageSize')
    return saved ? parseInt(saved) : 25
  })

  useEffect(() => {
    if (user) {
      fetchSales()
    }
  }, [user])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortField, sortDirection])

  useEffect(() => {
    localStorage.setItem('salesPageSize', pageSize.toString())
    setCurrentPage(1)
  }, [pageSize])

  const fetchSales = async () => {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          inventory!inner(brand)
        `)
        .eq('user_id', user?.id)
        .order('sale_date', { ascending: false })

      if (error) throw error

      // Transform the data to flatten the brand field
      const transformedData = data?.map(sale => ({
        ...sale,
        brand: (sale.inventory as any)?.brand || null
      })) || []

      setSales(transformedData)
    } catch (error) {
      console.error('Error fetching sales:', error)
      toast({
        title: "Error loading sales",
        description: "Could not load your sales data.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (field: keyof Sale) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredSales = sales.filter(sale =>
    sale.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.platform?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.brand?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const sortedSales = [...filteredSales].sort((a, b) => {
    const aVal = a[sortField]
    const bVal = b[sortField]
    
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
    }
    
    return sortDirection === 'asc' 
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal))
  })

  // Pagination calculations
  const totalPages = Math.ceil(sortedSales.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedSales = sortedSales.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // Scroll to top of page on page change
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
  }

  const SortIcon = ({ field }: { field: keyof Sale }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
  }

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.sale_price, 0)
  const totalProfit = sales.reduce((sum, sale) => sum + sale.profit, 0)
  const averageProfit = sales.length > 0 ? totalProfit / sales.length : 0

  const handleEditSale = (sale: Sale) => {
    setSelectedSale(sale)
    setIsEditDialogOpen(true)
  }

  const calculateROI = (profit: number, purchasePrice: number) => {
    if (purchasePrice === 0) return 0
    return ((profit / purchasePrice) * 100).toFixed(1)
  }

  const MobileSaleCard = ({ sale }: { sale: Sale }) => (
    <Card className="bg-gradient-card shadow-card border-border">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-lg leading-tight">
              {sale.item_name}
            </h3>
            <div className="flex gap-2 mt-2 flex-wrap">
              {sale.platform && (
                <Badge variant="outline" className="text-xs">
                  {sale.platform}
                </Badge>
              )}
              {sale.brand && (
                <Badge variant="secondary" className="text-xs">
                  {sale.brand}
                </Badge>
              )}
              {!sale.is_shipped && (
                <Badge variant="destructive" className="text-xs">
                  <Package className="h-3 w-3 mr-1" />
                  Needs Shipping
                </Badge>
              )}
              {sale.is_shipped && (
                <Badge variant="default" className="text-xs bg-success text-success-foreground">
                  <Truck className="h-3 w-3 mr-1" />
                  Shipped
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <div className={`text-lg font-bold ${sale.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {sale.profit >= 0 ? '+' : ''}${sale.profit.toLocaleString()}
                    </div>
                    <span className="text-xs text-muted-foreground">Profit</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-semibold">
                    ROI: {calculateROI(sale.profit, sale.purchase_price)}%
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Sale Price</span>
            <p className="font-medium text-foreground">
              ${sale.sale_price.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Purchase Price</span>
            <p className="font-medium text-foreground">
              ${sale.purchase_price.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Fees</span>
            <p className="text-foreground">
              ${(sale.fees || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Sale Date</span>
            <p className="text-foreground">
              {formatDateByLocation(sale.sale_date)}
            </p>
          </div>
          {sale.shipping_cost > 0 && (
            <div>
              <span className="text-muted-foreground">Shipping Cost</span>
              <p className="text-foreground">${sale.shipping_cost.toLocaleString()}</p>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Shipping Status</span>
            <p className="text-foreground">
              {sale.is_shipped ? (
                <span className="text-success">
                  Shipped {sale.shipped_date ? `on ${formatDateByLocation(sale.shipped_date)}` : ''}
                </span>
              ) : (
                <span className="text-destructive">Needs Shipping</span>
              )}
            </p>
          </div>
          {sale.tracking_number && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Tracking Number</span>
              <p className="text-foreground font-mono text-sm">{sale.tracking_number}</p>
            </div>
          )}
        </div>
        
        {sale.notes && (
          <div className="mt-3 pt-3 border-t border-border">
            <span className="text-muted-foreground text-sm">Notes</span>
            <p className="text-sm text-foreground mt-1">{sale.notes}</p>
          </div>
        )}

        {/* Edit Button */}
        <div className="mt-3 pt-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEditSale(sale)}
            className="w-full"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit Sale
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-foreground">Sales</h1>
          <Button disabled className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Record Sale
          </Button>
        </div>
        <Card className="bg-gradient-card shadow-card">
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-muted rounded"></div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Sales</h1>
          <p className="text-sm lg:text-base text-muted-foreground">
            {sales.length} sales • ${totalRevenue.toLocaleString()} revenue
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setIsShippingDialogOpen(true)}
            variant="outline"
            className="border-border text-foreground hover:bg-secondary"
            size={isMobile ? "sm" : "default"}
          >
            <Package className="h-4 w-4 mr-2" />
            {isMobile ? "Ship" : "Manage Shipping"}
          </Button>
          <Button 
            onClick={() => setIsRecordDialogOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow shadow-primary"
            size={isMobile ? "sm" : "default"}
          >
            <Plus className="h-4 w-4 mr-2" />
            {isMobile ? "Record" : "Record Sale"}
          </Button>
        </div>
      </div>


      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search sales by item name, platform, or brand..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Sales Display */}
      {sortedSales.length === 0 ? (
        <Card className="bg-gradient-card shadow-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {sales.length === 0 ? "No sales recorded" : "No sales match your search"}
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              {sales.length === 0 
                ? "Start tracking your reselling success by recording your first sale."
                : "Try adjusting your search terms or clear the search to see all sales."
              }
            </p>
            {sales.length === 0 && (
              <Button 
                onClick={() => setIsRecordDialogOpen(true)}
                className="mt-4 bg-primary text-primary-foreground"
              >
                <Plus className="h-4 w-4 mr-2" />
                Record Your First Sale
              </Button>
            )}
          </CardContent>
        </Card>
      ) : isMobile ? (
        // Mobile Card Layout
        <>
          <div className="space-y-4">
            {paginatedSales.map((sale) => (
              <MobileSaleCard key={sale.id} sale={sale} />
            ))}
          </div>
          {sortedSales.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sortedSales.length}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              className="mt-4"
            />
          )}
        </>
      ) : (
        // Desktop Table Layout
        <Card className="bg-gradient-card shadow-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-secondary/50">
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('brand')}
                  >
                    <div className="flex items-center gap-2">
                      Brand
                      <SortIcon field="brand" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('item_name')}
                  >
                    <div className="flex items-center gap-2">
                      Item Name
                      <SortIcon field="item_name" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('platform')}
                  >
                    <div className="flex items-center gap-2">
                      Platform
                      <SortIcon field="platform" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors text-right"
                    onClick={() => handleSort('purchase_price')}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      Purchase Price
                      <SortIcon field="purchase_price" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors text-right"
                    onClick={() => handleSort('sale_price')}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      Sale Price
                      <SortIcon field="sale_price" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors text-right"
                    onClick={() => handleSort('fees')}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      Fees
                      <SortIcon field="fees" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors text-right"
                    onClick={() => handleSort('profit')}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      Profit
                      <SortIcon field="profit" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('sale_date')}
                  >
                    <div className="flex items-center gap-2">
                      Sale Date
                      <SortIcon field="sale_date" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('is_shipped')}
                  >
                    <div className="flex items-center gap-2">
                      Shipping
                      <SortIcon field="is_shipped" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSales.map((sale) => (
                  <TableRow key={sale.id} className="border-border hover:bg-secondary/30">
                    <TableCell>
                      {sale.brand ? (
                        <Badge variant="secondary">{sale.brand}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      <div>
                        <div className="font-semibold">{sale.item_name}</div>
                        {sale.notes && (
                          <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {sale.notes}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {sale.platform ? (
                        <Badge variant="outline">{sale.platform}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium text-foreground">
                      ${sale.purchase_price.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium text-foreground">
                      ${sale.sale_price.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium text-muted-foreground">
                      ${(sale.fees || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`cursor-help ${sale.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                              {sale.profit >= 0 ? '+' : ''}${sale.profit.toLocaleString()}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-semibold">
                              ROI: {calculateROI(sale.profit, sale.purchase_price)}%
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateByLocation(sale.sale_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {sale.is_shipped ? (
                          <Badge variant="default" className="text-xs bg-success text-success-foreground w-fit">
                            <Truck className="h-3 w-3 mr-1" />
                            Shipped
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs w-fit">
                            <Package className="h-3 w-3 mr-1" />
                            Needs Shipping
                          </Badge>
                        )}
                        {sale.tracking_number && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {sale.tracking_number}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditSale(sale)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination Controls for Desktop */}
      {!isMobile && sortedSales.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedSales.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      <RecordSaleDialog 
        open={isRecordDialogOpen}
        onOpenChange={setIsRecordDialogOpen}
        onSuccess={fetchSales}
      />

      <EditSaleDialog 
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={fetchSales}
        sale={selectedSale}
      />

      <ShippingManagementDialog 
        open={isShippingDialogOpen}
        onOpenChange={setIsShippingDialogOpen}
        onSuccess={fetchSales}
      />
    </div>
  )
}