import { useState } from "react"
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
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useSubscriptionContext } from "@/contexts/SubscriptionContext"
import { useToast } from "@/hooks/use-toast"

interface AddInventoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AddInventoryDialog({ open, onOpenChange, onSuccess }: AddInventoryDialogProps) {
  const { user } = useAuth()
  const { checkCanAddInventory } = useSubscriptionContext()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    item_name: "",
    brand: "",
    size: "",
    condition: "",
    purchase_price: "",
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_from: "",
    order_number: "",
    market_value: "",
    sku: "",
    notes: "",
    quantity: "1",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    // Check if user can add inventory items
    const canAdd = await checkCanAddInventory()
    if (!canAdd) {
      toast({
        title: "Inventory limit reached",
        description: "You've reached your inventory limit. Upgrade your plan to add more items.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const quantity = parseInt(formData.quantity)
      const itemsToInsert = Array.from({ length: quantity }, () => ({
        user_id: user.id,
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
      }))

      const { error } = await supabase
        .from('inventory')
        .insert(itemsToInsert)

      if (error) throw error

      const successMessage = quantity === 1 
        ? `${formData.item_name} has been added to your inventory.`
        : `${quantity} items of ${formData.item_name} have been added to your inventory.`

      toast({
        title: "Item(s) added successfully",
        description: successMessage,
      })

      // Reset form
      setFormData({
        item_name: "",
        brand: "",
        size: "",
        condition: "",
        purchase_price: "",
        purchase_date: new Date().toISOString().split('T')[0],
        purchase_from: "",
        order_number: "",
        market_value: "",
        sku: "",
        notes: "",
        quantity: "1",
      })

      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      toast({
        title: "Error adding item(s)",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Inventory Item</DialogTitle>
          <DialogDescription>
            Add a new item to your reselling inventory. Fill in as much detail as possible.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item_name">Item Name *</Label>
              <Input
                id="item_name"
                placeholder="e.g., Air Jordan 1 Retro High"
                value={formData.item_name}
                onChange={(e) => handleInputChange('item_name', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                placeholder="e.g., Nike, Adidas"
                value={formData.brand}
                onChange={(e) => handleInputChange('brand', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="size">Size</Label>
              <Input
                id="size"
                placeholder="e.g., 10.5, M, L"
                value={formData.size}
                onChange={(e) => handleInputChange('size', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="condition">Condition *</Label>
              <Select value={formData.condition} onValueChange={(value) => handleInputChange('condition', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Like New">Like New</SelectItem>
                  <SelectItem value="Very Good">Very Good</SelectItem>
                  <SelectItem value="Good">Good</SelectItem>
                  <SelectItem value="Fair">Fair</SelectItem>
                  <SelectItem value="Poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchase_price">Purchase Price *</Label>
              <Input
                id="purchase_price"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.purchase_price}
                onChange={(e) => handleInputChange('purchase_price', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="market_value">Market Value</Label>
              <Input
                id="market_value"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.market_value}
                onChange={(e) => handleInputChange('market_value', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchase_from">Purchase From</Label>
              <Input
                id="purchase_from"
                placeholder="e.g., StockX, eBay, Retail Store"
                value={formData.purchase_from}
                onChange={(e) => handleInputChange('purchase_from', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order_number">Order Number / Invoice Number</Label>
              <Input
                id="order_number"
                placeholder="e.g., INV-2024-001, ORD123456"
                value={formData.order_number}
                onChange={(e) => handleInputChange('order_number', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchase_date">Purchase Date *</Label>
              <Input
                id="purchase_date"
                type="date"
                value={formData.purchase_date}
                onChange={(e) => handleInputChange('purchase_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                placeholder="e.g., AJ1-BLK-10.5"
                value={formData.sku}
                onChange={(e) => handleInputChange('sku', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max="100"
                placeholder="1"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes about the item..."
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              rows={3}
            />
          </div>

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
              disabled={loading || !formData.item_name || !formData.condition || !formData.purchase_price || !formData.quantity}
              className="bg-primary text-primary-foreground"
            >
              {loading ? "Adding..." : parseInt(formData.quantity) === 1 ? "Add Item" : `Add ${formData.quantity} Items`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}