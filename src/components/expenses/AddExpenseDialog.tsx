import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Repeat, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface AddExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const expenseCategories = [
  "Subscriptions",
  "Packaging Supplies", 
  "Office Supplies",
  "Shipping",
  "Marketing",
  "Software",
  "Equipment",
  "Utilities",
  "Travel",
  "Other"
]

export function AddExpenseDialog({ open, onOpenChange, onSuccess }: AddExpenseDialogProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    description: "",
    category: "",
    amount: "",
    expense_date: new Date().toISOString().split('T')[0],
    receipt_url: "",
    is_recurring: false,
    recurring_period: "" as "monthly" | "3-month" | "6-month" | "12-month" | ""
  })

  const calculateNextDueDate = (startDate: string, period: string): string => {
    const date = new Date(startDate)
    switch (period) {
      case 'monthly':
        date.setMonth(date.getMonth() + 1)
        break
      case '3-month':
        date.setMonth(date.getMonth() + 3)
        break
      case '6-month':
        date.setMonth(date.getMonth() + 6)
        break
      case '12-month':
        date.setFullYear(date.getFullYear() + 1)
        break
    }
    return date.toISOString().split('T')[0]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    try {
      let recurring_series_id = null
      
      if (formData.is_recurring) {
        recurring_series_id = crypto.randomUUID()
      }

      const { error: expenseError } = await supabase
        .from('expenses')
        .insert([
          {
            user_id: user.id,
            description: formData.description,
            category: formData.category,
            amount: parseFloat(formData.amount),
            expense_date: formData.expense_date,
            receipt_url: formData.receipt_url || null,
            is_recurring: formData.is_recurring,
            recurring_period: formData.is_recurring ? formData.recurring_period : null,
            recurring_series_id: recurring_series_id,
            is_parent_expense: formData.is_recurring
          }
        ])

      if (expenseError) throw expenseError

      if (formData.is_recurring && recurring_series_id) {
        const nextDueDate = calculateNextDueDate(formData.expense_date, formData.recurring_period)
        
        const { error: metadataError } = await supabase
          .from('expense_recurring_metadata')
          .insert([
            {
              user_id: user.id,
              series_id: recurring_series_id,
              next_due_date: nextDueDate,
              is_active: true
            }
          ])

        if (metadataError) throw metadataError
      }

      toast({
        title: "Expense added successfully",
        description: formData.is_recurring 
          ? "Your recurring expense has been set up and will be automatically generated."
          : "Your expense has been recorded."
      })

      // Reset form
      setFormData({
        description: "",
        category: "",
        amount: "",
        expense_date: new Date().toISOString().split('T')[0],
        receipt_url: "",
        is_recurring: false,
        recurring_period: ""
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error adding expense:', error)
      toast({
        title: "Error adding expense",
        description: "Could not add your expense. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add New Expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 overflow-visible">
          <div className="space-y-2">
            <Label htmlFor="description" className="text-foreground">Description</Label>
            <Textarea
              id="description"
              placeholder="e.g., Printer ink cartridges"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category" className="text-foreground">Category</Label>
            <Select 
              value={formData.category} 
              onValueChange={(value) => setFormData({ ...formData, category: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {expenseCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount" className="text-foreground">Amount ($)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense_date" className="text-foreground">Expense Date</Label>
            <Input
              id="expense_date"
              type="date"
              value={formData.expense_date}
              onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="receipt_url" className="text-foreground">Receipt URL (Optional)</Label>
            <Input
              id="receipt_url"
              type="url"
              placeholder="https://example.com/receipt.pdf"
              value={formData.receipt_url}
              onChange={(e) => setFormData({ ...formData, receipt_url: e.target.value })}
            />
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Repeat className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="is_recurring" className="text-foreground font-medium">
                  Recurring Expense
                </Label>
              </div>
              <Switch
                id="is_recurring"
                checked={formData.is_recurring}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  is_recurring: checked,
                  recurring_period: checked ? "monthly" : ""
                })}
              />
            </div>
            
            {formData.is_recurring && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="recurring_period" className="text-foreground">Frequency</Label>
                  <Select 
                    value={formData.recurring_period} 
                    onValueChange={(value) => setFormData({ 
                      ...formData, 
                      recurring_period: value as "monthly" | "3-month" | "6-month" | "12-month"
                    })}
                    required={formData.is_recurring}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="3-month">Every 3 Months</SelectItem>
                      <SelectItem value="6-month">Every 6 Months</SelectItem>
                      <SelectItem value="12-month">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    This expense will be automatically generated every {formData.recurring_period === 'monthly' ? 'month' : 
                    formData.recurring_period === '3-month' ? '3 months' : 
                    formData.recurring_period === '6-month' ? '6 months' : 'year'} starting from the expense date.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
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
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary-glow"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {formData.is_recurring ? 'Set Up Recurring Expense' : 'Add Expense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}