import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { Trash2 } from "lucide-react"

interface InventoryItem {
  id: string
  item_name: string
  brand: string | null
  size: string | null
  condition: string
  purchase_price: number
  purchase_date: string
  purchase_from: string | null
  order_number: string | null
  market_value: number | null
  sku: string | null
  notes: string | null
}

interface EditInventoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  item: InventoryItem | null
}

export function EditInventoryDialog({ open, onOpenChange, onSuccess, item }: EditInventoryDialogProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  const [formData, setFormData] = useState({
    item_name: "",
    brand: "",
    size: "",
    condition: "New",
    purchase_price: "",
    purchase_date: "",
    purchase_from: "",
    order_number: "",
    market_value: "",
    sku: "",
    notes: "",
  })

  useEffect(() => {
    if (item) {
      setFormData({
        item_name: item.item_name || "",
        brand: item.brand || "",
        size: item.size || "",
        condition: item.condition || "New",
        purchase_price: item.purchase_price.toString(),
        purchase_date: item.purchase_date || "",
        purchase_from: item.purchase_from || "",
        order_number: item.order_number || "",
        market_value: item.market_value?.toString() || "",
        sku: item.sku || "",
        notes: item.notes || "",
      })
    }
  }, [item])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !item) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('inventory')
        .update({
          item_name: formData.item_name,
          brand: formData.brand || null,
          size: formData.size || null,
          condition: formData.condition,
          purchase_price: parseFloat(formData.purchase_price),
          purchase_date: formData.purchase_date,
          purchase_from: formData.purchase_from || null,
          order_number: formData.order_number || null,
          market_value: formData.market_value ? parseFloat(formData.market_value) : null,
          sku: formData.sku || null,
          notes: formData.notes || null,
        })
        .eq('id', item.id)
        .eq('user_id', user.id)

      if (error) throw error

      toast({
        title: "Item updated successfully",
        description: `${formData.item_name} has been updated in your inventory.`,
      })

      onSuccess()
      onOpenChange(false)
      
      // Reset form
      setFormData({
        item_name: "",
        brand: "",
        size: "",
        condition: "New",
        purchase_price: "",
        purchase_date: "",
        purchase_from: "",
        order_number: "",
        market_value: "",
        sku: "",
        notes: "",
      })
    } catch (error) {
      console.error('Error updating inventory item:', error)
      toast({
        title: "Error updating item",
        description: "Could not update the inventory item. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!user || !item) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', item.id)
        .eq('user_id', user.id)

      if (error) throw error

      toast({
        title: "Item deleted successfully",
        description: `${item.item_name} has been removed from your inventory.`,
      })

      setDeleteDialogOpen(false)
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error deleting inventory item:', error)
      toast({
        title: "Error deleting item",
        description: "Could not delete the inventory item. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] bg-card border-border overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-foreground">Edit Inventory Item</DialogTitle>
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
                <Label htmlFor="brand" className="text-foreground">Brand</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  placeholder="e.g., Nike, Adidas"
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="size" className="text-foreground">Size</Label>
                <Input
                  id="size"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  placeholder="e.g., 10.5, M, L"
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="condition" className="text-foreground">Condition *</Label>
                <Select value={formData.condition} onValueChange={(value) => setFormData({ ...formData, condition: value })}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="New with Tags">New with Tags</SelectItem>
                    <SelectItem value="New with Box">New with Box</SelectItem>
                    <SelectItem value="Used - Like New">Used - Like New</SelectItem>
                    <SelectItem value="Used - Good">Used - Good</SelectItem>
                    <SelectItem value="Used - Fair">Used - Fair</SelectItem>
                  </SelectContent>
                </Select>
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
                <Label htmlFor="market_value" className="text-foreground">Current Market Value</Label>
                <Input
                  id="market_value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.market_value}
                  onChange={(e) => setFormData({ ...formData, market_value: e.target.value })}
                  placeholder="0.00"
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_from" className="text-foreground">Purchase From</Label>
                <Input
                  id="purchase_from"
                  value={formData.purchase_from}
                  onChange={(e) => setFormData({ ...formData, purchase_from: e.target.value })}
                  placeholder="e.g., StockX, eBay, Retail Store"
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="order_number" className="text-foreground">Order Number / Invoice Number</Label>
                <Input
                  id="order_number"
                  value={formData.order_number}
                  onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
                  placeholder="e.g., INV-2024-001, ORD123456"
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_date" className="text-foreground">Purchase Date *</Label>
                <Input
                  id="purchase_date"
                  type="date"
                  value={formData.purchase_date}
                  onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                  required
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sku" className="text-foreground">SKU/Model Number</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="e.g., 555088-134"
                  className="bg-input border-border text-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-foreground">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional notes about this item..."
                className="bg-input border-border text-foreground"
                rows={3}
              />
            </div>
          </form>
        </div>

        {/* Fixed footer with buttons */}
        <div className="flex-shrink-0 border-t border-border pt-4 mt-4">
          <div className="flex justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={loading || deleting}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Item
            </Button>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading || deleting}
                className="border-border text-foreground hover:bg-secondary"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || deleting}
                onClick={handleSubmit}
                className="bg-primary text-primary-foreground hover:bg-primary-glow"
              >
                {loading ? "Updating..." : "Update Item"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Are you sure?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            This will permanently delete "{item?.item_name}" from your inventory. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            className="border-border text-foreground hover:bg-secondary"
            disabled={deleting}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}