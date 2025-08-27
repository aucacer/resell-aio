import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { differenceInMonths } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, Package, ChevronUp, ChevronDown, Edit, X, AlertTriangle } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useSubscriptionContext } from "@/contexts/SubscriptionContext"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"
import { formatDateByLocation } from "@/lib/dateUtils"
import { AddInventoryDialog } from "@/components/inventory/AddInventoryDialog"
import { EditInventoryDialog } from "@/components/inventory/EditInventoryDialog"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { InventoryLimitBanner } from "@/components/subscription/InventoryLimitBanner"

interface InventoryItem {
  id: string
  item_name: string
  brand: string
  size: string
  condition: string
  purchase_price: number
  purchase_date: string
  market_value: number
  sku: string
  notes: string
  is_sold: boolean
  created_at: string
}

export default function Inventory() {
  const { user } = useAuth()
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAgedFilter, setIsAgedFilter] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [sortField, setSortField] = useState<keyof InventoryItem>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('inventoryPageSize')
    return saved ? parseInt(saved) : 25
  })

  useEffect(() => {
    const filter = searchParams.get('filter')
    setIsAgedFilter(filter === 'aged')
  }, [searchParams])

  useEffect(() => {
    if (user) {
      fetchInventory()
    }
  }, [user, isAgedFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortField, sortDirection])

  useEffect(() => {
    localStorage.setItem('inventoryPageSize', pageSize.toString())
    setCurrentPage(1)
  }, [pageSize])

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_sold', false)
        .order('created_at', { ascending: false })

      if (error) throw error

      let inventoryItems = data || []
      
      // Apply aged filter if active
      if (isAgedFilter) {
        const now = new Date()
        inventoryItems = inventoryItems.filter(item => {
          const purchaseDate = new Date(item.purchase_date)
          const ageMonths = differenceInMonths(now, purchaseDate)
          return ageMonths >= 10
        }).sort((a, b) => {
          // Sort by purchase date, oldest first
          return new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime()
        })
      }

      setItems(inventoryItems)
    } catch (error) {
      console.error('Error fetching inventory:', error)
      toast({
        title: "Error loading inventory",
        description: "Could not load your inventory items.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (field: keyof InventoryItem) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item)
    setIsEditDialogOpen(true)
  }

  const filteredItems = items.filter(item =>
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const sortedItems = [...filteredItems].sort((a, b) => {
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
  const totalPages = Math.ceil(sortedItems.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedItems = sortedItems.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // Scroll to top of page on page change
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
  }

  const SortIcon = ({ field }: { field: keyof InventoryItem }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
  }

  const totalValue = items.reduce((sum, item) => sum + (item.market_value || item.purchase_price), 0)

  const MobileInventoryCard = ({ item }: { item: InventoryItem }) => (
    <Card className="bg-gradient-card shadow-card border-border">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-lg leading-tight">
              {item.item_name}
            </h3>
            {item.brand && (
              <p className="text-sm text-muted-foreground mt-1">{item.brand}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="secondary" className="text-xs">
              {item.condition}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(item)}
              className="hover:bg-secondary h-8 w-8 p-0"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Purchase Price</span>
            <p className="font-medium text-foreground">
              ${item.purchase_price.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Market Value</span>
            <p className="font-medium text-primary">
              ${(item.market_value || item.purchase_price).toLocaleString()}
            </p>
          </div>
          {item.size && (
            <div>
              <span className="text-muted-foreground">Size</span>
              <p className="text-foreground">{item.size}</p>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Purchase Date</span>
            <p className="text-foreground">
              {formatDateByLocation(item.purchase_date)}
            </p>
          </div>
          {item.sku && (
            <div className="col-span-2">
              <span className="text-muted-foreground">SKU</span>
              <p className="font-mono text-foreground">{item.sku}</p>
            </div>
          )}
        </div>
        
        {item.notes && (
          <div className="mt-3 pt-3 border-t border-border">
            <span className="text-muted-foreground text-sm">Notes</span>
            <p className="text-sm text-foreground mt-1">{item.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
          <Button disabled className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Add Item
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
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm lg:text-base text-muted-foreground">
            {items.length} items • ${totalValue.toLocaleString()}
          </p>
        </div>
        <Button 
          onClick={() => setIsAddDialogOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary-glow shadow-primary"
          size={isMobile ? "sm" : "default"}
        >
          <Plus className="h-4 w-4 mr-2" />
          {isMobile ? "Add" : "Add Item"}
        </Button>
      </div>

      {/* Inventory Limit Banner */}
      <InventoryLimitBanner currentCount={items.length} />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search inventory by name, brand, or SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Aged Stock Filter Indicator */}
      {isAgedFilter && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="text-sm font-medium text-foreground">
            Showing aged stock items (older than 10 months)
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchParams({})
              setIsAgedFilter(false)
            }}
            className="ml-auto hover:bg-warning/20"
          >
            <X className="h-4 w-4 mr-1" />
            Clear Filter
          </Button>
        </div>
      )}

      {/* Inventory Display */}
      {sortedItems.length === 0 ? (
        <Card className="bg-gradient-card shadow-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {items.length === 0 ? "No inventory items" : "No items match your search"}
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              {items.length === 0 
                ? "Start building your inventory by adding your first item."
                : "Try adjusting your search terms or clear the search to see all items."
              }
            </p>
            {items.length === 0 && (
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                className="mt-4 bg-primary text-primary-foreground"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Item
              </Button>
            )}
          </CardContent>
        </Card>
      ) : isMobile ? (
        // Mobile Card Layout
        <>
          <div className="space-y-4">
            {paginatedItems.map((item) => (
              <MobileInventoryCard key={item.id} item={item} />
            ))}
          </div>
          {sortedItems.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sortedItems.length}
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
                    onClick={() => handleSort('size')}
                  >
                    <div className="flex items-center gap-2">
                      Size
                      <SortIcon field="size" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('condition')}
                  >
                    <div className="flex items-center gap-2">
                      Condition
                      <SortIcon field="condition" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors text-center"
                    onClick={() => handleSort('purchase_price')}
                  >
                    <div className="flex items-center gap-2 justify-center">
                      Purchase Price
                      <SortIcon field="purchase_price" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors text-center"
                    onClick={() => handleSort('market_value')}
                  >
                    <div className="flex items-center gap-2 justify-center">
                      Market Value
                      <SortIcon field="market_value" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('purchase_date')}
                  >
                    <div className="flex items-center gap-2">
                      Purchase Date
                      <SortIcon field="purchase_date" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('sku')}
                  >
                    <div className="flex items-center gap-2">
                      SKU
                      <SortIcon field="sku" />
                    </div>
                  </TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((item) => (
                  <TableRow key={item.id} className="border-border hover:bg-secondary/30">
                    <TableCell className="text-muted-foreground">
                      {item.brand || '-'}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      <div>
                        <div className="font-semibold">{item.item_name}</div>
                        {item.notes && (
                          <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {item.notes}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {item.size || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {item.condition}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-medium text-foreground">
                      ${item.purchase_price.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center font-medium text-primary">
                      ${(item.market_value || item.purchase_price).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateByLocation(item.purchase_date)}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {item.sku || '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(item)}
                        className="hover:bg-secondary"
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
      {!isMobile && sortedItems.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedItems.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      <AddInventoryDialog 
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={fetchInventory}
      />

      <EditInventoryDialog 
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={fetchInventory}
        item={editingItem}
      />
    </div>
  )
}