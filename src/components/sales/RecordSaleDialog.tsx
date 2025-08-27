import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { X, Search } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"

interface RecordSaleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface InventoryItem {
  id: string
  item_name: string
  purchase_price: number
  brand: string
  size: string
}

export function RecordSaleDialog({ open, onOpenChange, onSuccess }: RecordSaleDialogProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [selectedItems, setSelectedItems] = useState<InventoryItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [formData, setFormData] = useState({
    sale_price: "",
    sale_date: new Date().toISOString().split('T')[0],
    platform: "",
    fees: "",
    shipping_cost: "",
    notes: "",
  })

  useEffect(() => {
    if (open && user) {
      fetchInventoryItems()
    }
  }, [open, user])

  const fetchInventoryItems = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('id, item_name, purchase_price, brand, size')
        .eq('user_id', user?.id)
        .eq('is_sold', false)
        .order('created_at', { ascending: false })

      if (error) throw error
      setInventoryItems(data || [])
    } catch (error) {
      console.error('Error fetching inventory:', error)
    }
  }

  const handleItemToggle = (item: InventoryItem) => {
    setSelectedItems(prev => {
      const isSelected = prev.some(i => i.id === item.id)
      if (isSelected) {
        return prev.filter(i => i.id !== item.id)
      } else {
        return [...prev, item]
      }
    })
  }

  const removeItem = (itemId: string) => {
    setSelectedItems(prev => prev.filter(i => i.id !== itemId))
  }

  const calculateTotalProfit = () => {
    if (selectedItems.length === 0 || !formData.sale_price) return 0
    const salePrice = parseFloat(formData.sale_price)
    const fees = parseFloat(formData.fees || "0")
    const shipping = parseFloat(formData.shipping_cost || "0")
    const totalPurchasePrice = selectedItems.reduce((sum, item) => sum + item.purchase_price, 0)
    return salePrice - totalPurchasePrice - fees - shipping
  }

  const calculateIndividualProfits = () => {
    if (selectedItems.length === 0 || !formData.sale_price) return []
    const salePrice = parseFloat(formData.sale_price)
    const totalPurchasePrice = selectedItems.reduce((sum, item) => sum + item.purchase_price, 0)
    const fees = parseFloat(formData.fees || "0")
    const shipping = parseFloat(formData.shipping_cost || "0")
    
    return selectedItems.map(item => {
      // Distribute sale price proportionally based on purchase price
      const proportion = item.purchase_price / totalPurchasePrice
      const individualSalePrice = salePrice * proportion
      const individualFees = fees * proportion
      const individualShipping = shipping * proportion
      const individualProfit = individualSalePrice - item.purchase_price - individualFees - individualShipping
      
      return {
        ...item,
        individualSalePrice,
        individualFees,
        individualShipping,
        individualProfit
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || selectedItems.length === 0) return

    setLoading(true)
    try {
      const individualProfits = calculateIndividualProfits()
      
      // Create sale records for each item
      const saleRecords = individualProfits.map(item => ({
        user_id: user.id,
        inventory_id: item.id,
        item_name: item.item_name,
        sale_price: item.individualSalePrice,
        purchase_price: item.purchase_price,
        profit: item.individualProfit,
        sale_date: formData.sale_date,
        platform: formData.platform || null,
        fees: item.individualFees,
        shipping_cost: item.individualShipping,
        notes: formData.notes || null,
      }))

      const { error: saleError } = await supabase
        .from('sales')
        .insert(saleRecords)

      if (saleError) throw saleError

      // Mark all inventory items as sold
      const { error: inventoryError } = await supabase
        .from('inventory')
        .update({ is_sold: true })
        .in('id', selectedItems.map(item => item.id))

      if (inventoryError) throw inventoryError

      const totalProfit = calculateTotalProfit()
      toast({
        title: "Sale recorded successfully",
        description: `${selectedItems.length} item(s) sold for $${formData.sale_price} with $${totalProfit.toFixed(2)} total profit.`,
      })

      // Reset form
      setFormData({
        sale_price: "",
        sale_date: new Date().toISOString().split('T')[0],
        platform: "",
        fees: "",
        shipping_cost: "",
        notes: "",
      })
      setSelectedItems([])
      setSearchTerm("")

      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      toast({
        title: "Error recording sale",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const totalProfit = calculateTotalProfit()
  const totalPurchasePrice = selectedItems.reduce((sum, item) => sum + item.purchase_price, 0)

  // Filter inventory items based on search term
  const filteredInventoryItems = inventoryItems.filter(item =>
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.size && item.size.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Sale</DialogTitle>
          <DialogDescription>
            Select multiple items to include in this sale and they will be automatically removed from your inventory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label>Select Items to Sell *</Label>
            
            {selectedItems.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-secondary rounded-lg">
                {selectedItems.map((item) => (
                  <Badge key={item.id} variant="secondary" className="flex items-center gap-1">
                    {item.item_name} {item.brand && `- ${item.brand}`}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items by name, brand, or size..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-2">
              {filteredInventoryItems.map((item) => (
                <div key={item.id} className="flex items-center space-x-3 p-2 hover:bg-secondary rounded">
                  <Checkbox
                    checked={selectedItems.some(i => i.id === item.id)}
                    onCheckedChange={() => handleItemToggle(item)}
                  />
                  <div className="flex-1 text-sm">
                    <span className="font-medium">{item.item_name}</span>
                    {item.brand && <span className="text-muted-foreground"> - {item.brand}</span>}
                    {item.size && <span className="text-muted-foreground"> ({item.size})</span>}
                    <span className="text-muted-foreground"> - Purchased for ${item.purchase_price}</span>
                  </div>
                </div>
              ))}
              
              {filteredInventoryItems.length === 0 && inventoryItems.length > 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No items found matching "{searchTerm}"
                </p>
              )}
            </div>
            
            {inventoryItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No items available for sale. Add items to your inventory first.
              </p>
            )}
          </div>

          {selectedItems.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sale_price">Total Sale Price *</Label>
                  <Input
                    id="sale_price"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.sale_price}
                    onChange={(e) => handleInputChange('sale_price', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sale_date">Sale Date *</Label>
                  <Input
                    id="sale_date"
                    type="date"
                    value={formData.sale_date}
                    onChange={(e) => handleInputChange('sale_date', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform">Platform</Label>
                  <Select value={formData.platform} onValueChange={(value) => handleInputChange('platform', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="StockX">StockX</SelectItem>
                      <SelectItem value="GOAT">GOAT</SelectItem>
                      <SelectItem value="eBay">eBay</SelectItem>
                      <SelectItem value="Facebook Marketplace">Facebook Marketplace</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Local Sale">Local Sale</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fees">Total Platform Fees</Label>
                  <Input
                    id="fees"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.fees}
                    onChange={(e) => handleInputChange('fees', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shipping_cost">Total Shipping Cost</Label>
                  <Input
                    id="shipping_cost"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.shipping_cost}
                    onChange={(e) => handleInputChange('shipping_cost', e.target.value)}
                  />
                </div>
              </div>

              {formData.sale_price && (
                <div className="p-4 bg-secondary rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-foreground">Total Estimated Profit:</span>
                    <span className={`font-bold text-lg ${totalProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Sale Price: ${formData.sale_price} - Total Purchase Price: ${totalPurchasePrice.toFixed(2)} - 
                    Fees: ${formData.fees || 0} - Shipping: ${formData.shipping_cost || 0}
                  </div>
                  <div className="text-xs text-muted-foreground pt-1 border-t">
                    Note: Profit will be distributed proportionally across items based on their purchase prices
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about the sale..."
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || selectedItems.length === 0 || !formData.sale_price}
              className="bg-primary text-primary-foreground"
            >
              {loading ? "Recording..." : `Record Sale (${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''})`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}