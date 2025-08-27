import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"

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
  inventory_id: string
  is_shipped: boolean
  tracking_number: string | null
  shipped_date: string | null
}

interface EditSaleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  sale: Sale | null
}

export function EditSaleDialog({ open, onOpenChange, onSuccess, sale }: EditSaleDialogProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    item_name: "",
    sale_price: "",
    purchase_price: "",
    sale_date: "",
    platform: "",
    fees: "",
    shipping_cost: "",
    notes: "",
    is_shipped: false,
    tracking_number: "",
    shipped_date: "",
  })

  useEffect(() => {
    if (sale) {
      setFormData({
        item_name: sale.item_name || "",
        sale_price: sale.sale_price.toString(),
        purchase_price: sale.purchase_price.toString(),
        sale_date: sale.sale_date || "",
        platform: sale.platform || "",
        fees: (sale.fees || 0).toString(),
        shipping_cost: (sale.shipping_cost || 0).toString(),
        notes: sale.notes || "",
        is_shipped: sale.is_shipped || false,
        tracking_number: sale.tracking_number || "",
        shipped_date: sale.shipped_date || "",
      })
    }
  }, [sale])

  const calculateProfit = () => {
    const salePrice = parseFloat(formData.sale_price) || 0
    const purchasePrice = parseFloat(formData.purchase_price) || 0
    const fees = parseFloat(formData.fees) || 0
    const shippingCost = parseFloat(formData.shipping_cost) || 0
    
    return salePrice - purchasePrice - fees - shippingCost
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !sale) return

    setLoading(true)
    try {
      const profit = calculateProfit()

      const { error } = await supabase
        .from('sales')
        .update({
          item_name: formData.item_name,
          sale_price: parseFloat(formData.sale_price),
          purchase_price: parseFloat(formData.purchase_price),
          sale_date: formData.sale_date,
          platform: formData.platform || null,
          fees: parseFloat(formData.fees) || 0,
          shipping_cost: parseFloat(formData.shipping_cost) || 0,
          profit: profit,
          notes: formData.notes || null,
          is_shipped: formData.is_shipped,
          tracking_number: formData.tracking_number || null,
          shipped_date: formData.shipped_date || null,
        })
        .eq('id', sale.id)
        .eq('user_id', user.id)

      if (error) throw error

      toast({
        title: "Sale updated successfully",
        description: `${formData.item_name} sale has been updated.`,
      })

      onSuccess()
      onOpenChange(false)
      
      // Reset form
      setFormData({
        item_name: "",
        sale_price: "",
        purchase_price: "",
        sale_date: "",
        platform: "",
        fees: "",
        shipping_cost: "",
        notes: "",
        is_shipped: false,
        tracking_number: "",
        shipped_date: "",
      })
    } catch (error) {
      console.error('Error updating sale:', error)
      toast({
        title: "Error updating sale",
        description: "Could not update the sale record. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!user || !sale) return

    setLoading(true)
    try {
      // Start transaction: delete sale and update inventory
      const { error: deleteError } = await supabase
        .from('sales')
        .delete()
        .eq('id', sale.id)
        .eq('user_id', user.id)

      if (deleteError) throw deleteError

      // Revert inventory item back to available
      const { error: inventoryError } = await supabase
        .from('inventory')
        .update({ is_sold: false })
        .eq('id', sale.inventory_id)
        .eq('user_id', user.id)

      if (inventoryError) throw inventoryError

      toast({
        title: "Sale deleted successfully",
        description: `${formData.item_name} has been returned to inventory.`,
      })

      onSuccess()
      onOpenChange(false)
      
      // Reset form
      setFormData({
        item_name: "",
        sale_price: "",
        purchase_price: "",
        sale_date: "",
        platform: "",
        fees: "",
        shipping_cost: "",
        notes: "",
        is_shipped: false,
        tracking_number: "",
        shipped_date: "",
      })
    } catch (error) {
      console.error('Error deleting sale:', error)
      toast({
        title: "Error deleting sale",
        description: "Could not delete the sale record. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const calculatedProfit = calculateProfit()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] bg-card border-border overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-foreground">Edit Sale Record</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <form onSubmit={handleSubmit} className="space-y-4 p-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item_name" className="text-foreground">Item Name *</Label>
                <Input
                  id="item_name"
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  placeholder="e.g., Air Jordan 1 High OG"
                  required
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform" className="text-foreground">Platform</Label>
                <Select value={formData.platform} onValueChange={(value) => setFormData({ ...formData, platform: value })}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="eBay">eBay</SelectItem>
                    <SelectItem value="StockX">StockX</SelectItem>
                    <SelectItem value="GOAT">GOAT</SelectItem>
                    <SelectItem value="Mercari">Mercari</SelectItem>
                    <SelectItem value="Poshmark">Poshmark</SelectItem>
                    <SelectItem value="Facebook Marketplace">Facebook Marketplace</SelectItem>
                    <SelectItem value="Local Sale">Local Sale</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sale_price" className="text-foreground">Sale Price *</Label>
                <Input
                  id="sale_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.sale_price}
                  onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                  placeholder="0.00"
                  required
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_price" className="text-foreground">Purchase Price *</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                  placeholder="0.00"
                  required
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fees" className="text-foreground">Fees</Label>
                <Input
                  id="fees"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fees}
                  onChange={(e) => setFormData({ ...formData, fees: e.target.value })}
                  placeholder="0.00"
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shipping_cost" className="text-foreground">Shipping Cost</Label>
                <Input
                  id="shipping_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.shipping_cost}
                  onChange={(e) => setFormData({ ...formData, shipping_cost: e.target.value })}
                  placeholder="0.00"
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sale_date" className="text-foreground">Sale Date *</Label>
                <Input
                  id="sale_date"
                  type="date"
                  value={formData.sale_date}
                  onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
                  required
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">Calculated Profit</Label>
                <div className={`text-2xl font-bold ${calculatedProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {calculatedProfit >= 0 ? '+' : ''}${calculatedProfit.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-foreground">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional notes about this sale..."
                className="bg-input border-border text-foreground"
                rows={3}
              />
            </div>

            {/* Shipping Section */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-lg font-semibold text-foreground">Shipping Information</h3>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_shipped"
                  checked={formData.is_shipped}
                  onCheckedChange={(checked) => {
                    setFormData({ 
                      ...formData, 
                      is_shipped: !!checked,
                      shipped_date: checked ? formData.shipped_date || new Date().toISOString().split('T')[0] : ""
                    })
                  }}
                />
                <Label htmlFor="is_shipped" className="text-foreground">
                  Item has been shipped
                </Label>
              </div>

              {formData.is_shipped && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                  <div className="space-y-2">
                    <Label htmlFor="shipped_date" className="text-foreground">Shipped Date</Label>
                    <Input
                      id="shipped_date"
                      type="date"
                      value={formData.shipped_date}
                      onChange={(e) => setFormData({ ...formData, shipped_date: e.target.value })}
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="tracking_number" className="text-foreground">Tracking Number</Label>
                    <Input
                      id="tracking_number"
                      value={formData.tracking_number}
                      onChange={(e) => setFormData({ ...formData, tracking_number: e.target.value })}
                      placeholder="Enter tracking number..."
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Fixed footer with buttons */}
        <div className="flex-shrink-0 border-t border-border pt-4 mt-4">
          <div className="flex justify-between items-center">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={loading}
                >
                  Delete Sale
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-foreground">Delete Sale Record</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    This will permanently delete the sale record and return the item back to your inventory. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-border text-foreground hover:bg-secondary">Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDelete}
                    disabled={loading}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {loading ? "Deleting..." : "Delete Sale"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex gap-3">
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
                type="submit"
                disabled={loading}
                onClick={handleSubmit}
                className="bg-primary text-primary-foreground hover:bg-primary-glow"
              >
                {loading ? "Updating..." : "Update Sale"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}