import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { Package, Truck, Search } from "lucide-react"
import { formatDateByLocation } from "@/lib/dateUtils"

interface Sale {
  id: string
  item_name: string
  sale_date: string
  platform: string | null
  is_shipped: boolean
  tracking_number: string | null
  shipped_date: string | null
}

interface ShippingManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ShippingManagementDialog({ open, onOpenChange, onSuccess }: ShippingManagementDialogProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [unshippedSales, setUnshippedSales] = useState<Sale[]>([])
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set())
  const [batchTrackingNumber, setBatchTrackingNumber] = useState("")
  const [shippedDate, setShippedDate] = useState(new Date().toISOString().split('T')[0])
  const [searchTerm, setSearchTerm] = useState("")

  const fetchUnshippedSales = async () => {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('id, item_name, sale_date, platform, is_shipped, tracking_number, shipped_date')
        .eq('user_id', user?.id)
        .eq('is_shipped', false)
        .order('sale_date', { ascending: false })

      if (error) throw error

      setUnshippedSales(data || [])
    } catch (error) {
      console.error('Error fetching unshipped sales:', error)
      toast({
        title: "Error loading sales",
        description: "Could not load unshipped sales data.",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    if (open && user) {
      fetchUnshippedSales()
    }
  }, [open, user, fetchUnshippedSales])

  const handleSelectSale = (saleId: string, checked: boolean) => {
    const newSelected = new Set(selectedSales)
    if (checked) {
      newSelected.add(saleId)
    } else {
      newSelected.delete(saleId)
    }
    setSelectedSales(newSelected)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSales(new Set(filteredSales.map(sale => sale.id)))
    } else {
      setSelectedSales(new Set())
    }
  }

  const handleMarkAsShipped = async () => {
    if (selectedSales.size === 0) {
      toast({
        title: "No items selected",
        description: "Please select at least one item to mark as shipped.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const updates = Array.from(selectedSales).map(saleId => ({
        id: saleId,
        is_shipped: true,
        shipped_date: shippedDate,
        tracking_number: batchTrackingNumber || null,
      }))

      for (const update of updates) {
        const { error } = await supabase
          .from('sales')
          .update({
            is_shipped: update.is_shipped,
            shipped_date: update.shipped_date,
            tracking_number: update.tracking_number,
          })
          .eq('id', update.id)
          .eq('user_id', user?.id)

        if (error) throw error
      }

      toast({
        title: "Items marked as shipped",
        description: `Successfully marked ${selectedSales.size} item(s) as shipped.`,
      })

      onSuccess()
      onOpenChange(false)
      setSelectedSales(new Set())
      setBatchTrackingNumber("")
      setShippedDate(new Date().toISOString().split('T')[0])
    } catch (error) {
      console.error('Error updating shipping status:', error)
      toast({
        title: "Error updating shipping status",
        description: "Could not update the shipping status. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredSales = unshippedSales.filter(sale =>
    sale.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.platform?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] bg-card border-border flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 p-6 pb-4">
          <DialogTitle className="text-foreground">Shipping Management</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden px-6 pb-6 flex flex-col space-y-4">
          {unshippedSales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Truck className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">All caught up!</h3>
              <p className="text-muted-foreground text-center">
                All your sold items have been marked as shipped.
              </p>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="relative flex-shrink-0">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sales by item name or platform..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-input border-border text-foreground"
                />
              </div>

              {/* Batch Actions */}
              <div className="flex-shrink-0 space-y-4 p-4 bg-secondary/10 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={selectedSales.size === filteredSales.length && filteredSales.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                    <Label className="text-foreground">
                      Select All ({selectedSales.size} of {filteredSales.length} selected)
                    </Label>
                  </div>
                </div>

                {selectedSales.size > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="shipped_date" className="text-foreground">Shipped Date</Label>
                      <Input
                        id="shipped_date"
                        type="date"
                        value={shippedDate}
                        onChange={(e) => setShippedDate(e.target.value)}
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="batch_tracking" className="text-foreground">
                        Tracking Number (optional, same for all selected)
                      </Label>
                      <Input
                        id="batch_tracking"
                        value={batchTrackingNumber}
                        onChange={(e) => setBatchTrackingNumber(e.target.value)}
                        placeholder="Enter tracking number..."
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sales List */}
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-2 pr-4 pb-4">
                    {filteredSales.length === 0 && searchTerm ? (
                      <div className="flex flex-col items-center justify-center py-8">
                        <Search className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground text-center">
                          No items match your search. Try adjusting your search terms.
                        </p>
                      </div>
                    ) : (
                      filteredSales.map((sale) => (
                        <div 
                          key={sale.id} 
                          className="flex items-center space-x-3 p-3 bg-secondary/5 rounded-lg border border-border"
                        >
                          <Checkbox
                            checked={selectedSales.has(sale.id)}
                            onCheckedChange={(checked) => handleSelectSale(sale.id, !!checked)}
                          />
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-foreground">{sale.item_name}</span>
                              {sale.platform && (
                                <Badge variant="outline" className="text-xs">
                                  {sale.platform}
                                </Badge>
                              )}
                              <Badge variant="destructive" className="text-xs">
                                <Package className="h-3 w-3 mr-1" />
                                Needs Shipping
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Sold on {formatDateByLocation(sale.sale_date)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {unshippedSales.length > 0 && (
          <div className="flex-shrink-0 border-t border-border pt-4 px-6">
            <div className="flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="border-border text-foreground hover:bg-secondary"
              >
                Cancel
              </Button>
              
              <Button
                type="button"
                disabled={loading || selectedSales.size === 0}
                onClick={handleMarkAsShipped}
                className="bg-primary text-primary-foreground hover:bg-primary-glow"
              >
                {loading ? "Updating..." : `Mark ${selectedSales.size} Item(s) as Shipped`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}