import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { endRecurringSeries, getRecurringSeriesInfo } from "@/lib/recurringExpenses"
import { Loader2, Trash2, Repeat, StopCircle, Info } from "lucide-react"

interface Expense {
  id: string
  user_id: string
  description: string
  category: string
  amount: number
  expense_date: string
  receipt_url: string | null
  created_at: string
  is_recurring: boolean
  recurring_period: string | null
  recurring_series_id: string | null
  recurring_end_date: string | null
  is_parent_expense: boolean
}

interface EditExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  expense: Expense | null
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

export function EditExpenseDialog({ open, onOpenChange, onSuccess, expense }: EditExpenseDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [endingRecurring, setEndingRecurring] = useState(false)
  const [endRecurringDialogOpen, setEndRecurringDialogOpen] = useState(false)
  const [recurringSeriesInfo, setRecurringSeriesInfo] = useState<{
    expenses: any[]
    metadata: any
    isActive: boolean
  } | null>(null)
  const [formData, setFormData] = useState({
    description: "",
    category: "",
    amount: "",
    expense_date: "",
    receipt_url: ""
  })

  useEffect(() => {
    if (expense) {
      setFormData({
        description: expense.description,
        category: expense.category,
        amount: expense.amount.toString(),
        expense_date: expense.expense_date,
        receipt_url: expense.receipt_url || ""
      })
      
      // Load recurring series info if this is a recurring expense
      if (expense.is_recurring && expense.recurring_series_id) {
        getRecurringSeriesInfo(expense.recurring_series_id, expense.user_id)
          .then(info => setRecurringSeriesInfo(info))
      } else {
        setRecurringSeriesInfo(null)
      }
    }
  }, [expense])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expense) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          description: formData.description,
          category: formData.category,
          amount: parseFloat(formData.amount),
          expense_date: formData.expense_date,
          receipt_url: formData.receipt_url || null
        })
        .eq('id', expense.id)

      if (error) throw error

      toast({
        title: "Expense updated successfully",
        description: "Your expense has been updated."
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error updating expense:', error)
      toast({
        title: "Error updating expense",
        description: "Could not update your expense. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!expense) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expense.id)

      if (error) throw error

      toast({
        title: "Expense deleted successfully",
        description: `The expense "${expense.description}" has been removed.`,
      })

      setDeleteDialogOpen(false)
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error deleting expense:', error)
      toast({
        title: "Error deleting expense",
        description: "Could not delete the expense. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleEndRecurringSeries = async () => {
    if (!expense?.recurring_series_id) return

    setEndingRecurring(true)
    try {
      const result = await endRecurringSeries(expense.recurring_series_id, expense.user_id)
      
      if (result.success) {
        toast({
          title: "Recurring series ended",
          description: "Future recurring expenses have been cancelled. Existing expenses remain."
        })
        
        setEndRecurringDialogOpen(false)
        onSuccess()
        onOpenChange(false)
      } else {
        throw new Error('Failed to end recurring series')
      }
    } catch (error) {
      console.error('Error ending recurring series:', error)
      toast({
        title: "Error ending recurring series",
        description: "Could not end the recurring series. Please try again.",
        variant: "destructive"
      })
    } finally {
      setEndingRecurring(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            Edit Expense
            {expense?.is_recurring && (
              <Badge variant="secondary" className="text-xs">
                <Repeat className="h-3 w-3 mr-1" />
                Recurring
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        
        {expense?.is_recurring && (
          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              This is a recurring expense that occurs every {expense.recurring_period === 'monthly' ? 'month' : 
              expense.recurring_period === '3-month' ? '3 months' : 
              expense.recurring_period === '6-month' ? '6 months' : 'year'}.
              {recurringSeriesInfo?.isActive ? ' The series is currently active.' : ' The series has ended.'}
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-full overflow-hidden">
          <div className="space-y-2 w-full">
            <Label htmlFor="description" className="text-foreground">Description</Label>
            <Textarea
              id="description"
              placeholder="e.g., Printer ink cartridges"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              className="resize-none w-full"
            />
          </div>

          <div className="space-y-2 w-full">
            <Label htmlFor="category" className="text-foreground">Category</Label>
            <Select 
              value={formData.category} 
              onValueChange={(value) => setFormData({ ...formData, category: value })}
              required
            >
              <SelectTrigger className="w-full">
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

          <div className="space-y-2 w-full">
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
              className="w-full"
            />
          </div>

          <div className="space-y-2 w-full">
            <Label htmlFor="expense_date" className="text-foreground">Expense Date</Label>
            <Input
              id="expense_date"
              type="date"
              value={formData.expense_date}
              onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
              required
              className="w-full"
            />
          </div>

          <div className="space-y-2 w-full">
            <Label htmlFor="receipt_url" className="text-foreground">Receipt URL (Optional)</Label>
            <Input
              id="receipt_url"
              type="url"
              placeholder="https://example.com/receipt.pdf"
              value={formData.receipt_url}
              onChange={(e) => setFormData({ ...formData, receipt_url: e.target.value })}
              className="w-full"
            />
          </div>

          <div className="flex justify-between pt-4">
            <div className="flex space-x-2">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading || deleting || endingRecurring}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              {expense?.is_recurring && recurringSeriesInfo?.isActive && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEndRecurringDialogOpen(true)}
                  disabled={loading || deleting || endingRecurring}
                  className="flex items-center gap-2 border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  <StopCircle className="h-4 w-4" />
                  End Series
                </Button>
              )}
            </div>
            <div className="flex space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading || deleting || endingRecurring}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || deleting || endingRecurring}
                className="bg-primary text-primary-foreground hover:bg-primary-glow"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Expense
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Are you sure?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            This will permanently delete the expense "{expense?.description}". This action cannot be undone.
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

    <AlertDialog open={endRecurringDialogOpen} onOpenChange={setEndRecurringDialogOpen}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground flex items-center gap-2">
            <StopCircle className="h-5 w-5 text-orange-500" />
            End Recurring Series?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            This will stop all future recurring expenses for "{expense?.description}". 
            Existing expense records will remain unchanged. This action cannot be undone.
            <br /><br />
            <strong>Frequency:</strong> {expense?.recurring_period === 'monthly' ? 'Monthly' : 
            expense?.recurring_period === '3-month' ? 'Every 3 Months' : 
            expense?.recurring_period === '6-month' ? 'Every 6 Months' : 'Yearly'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            className="border-border text-foreground hover:bg-secondary"
            disabled={endingRecurring}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleEndRecurringSeries}
            disabled={endingRecurring}
            className="bg-orange-600 text-white hover:bg-orange-700"
          >
            {endingRecurring ? "Ending Series..." : "End Series"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}