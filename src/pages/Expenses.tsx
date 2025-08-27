import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, Receipt, ChevronUp, ChevronDown, Edit, Repeat } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"
import { formatDateByLocation } from "@/lib/dateUtils"
import { generateUpcomingExpenses } from "@/lib/recurringExpenses"
import { AddExpenseDialog } from "@/components/expenses/AddExpenseDialog"
import { EditExpenseDialog } from "@/components/expenses/EditExpenseDialog"
import { PaginationControls } from "@/components/ui/pagination-controls"

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

export default function Expenses() {
  const { user } = useAuth()
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [sortField, setSortField] = useState<keyof Expense>('expense_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('expensesPageSize')
    return saved ? parseInt(saved) : 25
  })

  useEffect(() => {
    if (user) {
      fetchExpenses()
    }
  }, [user])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortField, sortDirection])

  useEffect(() => {
    localStorage.setItem('expensesPageSize', pageSize.toString())
    setCurrentPage(1)
  }, [pageSize])

  const fetchExpenses = async () => {
    try {
      // First, generate any upcoming recurring expenses
      if (user?.id) {
        await generateUpcomingExpenses(user.id)
      }

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user?.id)
        .order('expense_date', { ascending: false })

      if (error) throw error

      setExpenses(data || [])
    } catch (error) {
      console.error('Error fetching expenses:', error)
      toast({
        title: "Error loading expenses",
        description: "Could not load your expenses.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (field: keyof Expense) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense)
    setIsEditDialogOpen(true)
  }

  const filteredExpenses = expenses.filter(expense =>
    expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.category?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
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
  const totalPages = Math.ceil(sortedExpenses.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedExpenses = sortedExpenses.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // Scroll to top of page on page change
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
  }

  const SortIcon = ({ field }: { field: keyof Expense }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
  }

  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  const MobileExpenseCard = ({ expense }: { expense: Expense }) => (
    <Card className="bg-gradient-card shadow-card border-border">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-lg leading-tight">
              {expense.description}
            </h3>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                {expense.category}
              </Badge>
              {expense.is_recurring && (
                <Badge variant="outline" className="text-xs text-blue-700 border-blue-200">
                  <Repeat className="h-3 w-3 mr-1" />
                  {expense.recurring_period === 'monthly' ? 'Monthly' : 
                   expense.recurring_period === '3-month' ? '3-Month' : 
                   expense.recurring_period === '6-month' ? '6-Month' : 'Yearly'}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-lg font-bold text-foreground">
              ${expense.amount.toLocaleString()}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(expense)}
              className="hover:bg-secondary h-8 w-8 p-0"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Date</span>
            <p className="text-foreground">
              {formatDateByLocation(expense.expense_date)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Receipt</span>
            <p className="text-foreground">
              {expense.receipt_url ? (
                <a 
                  href={expense.receipt_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View Receipt
                </a>
              ) : (
                <span className="text-muted-foreground">No receipt</span>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-foreground">Expenses</h1>
          <Button disabled className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
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
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm lg:text-base text-muted-foreground">
            {expenses.length} expenses • Total: ${totalExpenses.toLocaleString()}
          </p>
        </div>
        <Button 
          onClick={() => setIsAddDialogOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary-glow shadow-primary"
          size={isMobile ? "sm" : "default"}
        >
          <Plus className="h-4 w-4 mr-2" />
          {isMobile ? "Add" : "Add Expense"}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search expenses by description or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Expenses Display */}
      {sortedExpenses.length === 0 ? (
        <Card className="bg-gradient-card shadow-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {expenses.length === 0 ? "No expenses recorded" : "No expenses match your search"}
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              {expenses.length === 0 
                ? "Start tracking your business expenses by adding your first expense."
                : "Try adjusting your search terms or clear the search to see all expenses."
              }
            </p>
            {expenses.length === 0 && (
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                className="mt-4 bg-primary text-primary-foreground"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Expense
              </Button>
            )}
          </CardContent>
        </Card>
      ) : isMobile ? (
        // Mobile Card Layout
        <>
          <div className="space-y-4">
            {paginatedExpenses.map((expense) => (
              <MobileExpenseCard key={expense.id} expense={expense} />
            ))}
          </div>
          {sortedExpenses.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sortedExpenses.length}
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
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-secondary/50">
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('description')}
                  >
                    <div className="flex items-center gap-2">
                      Description
                      <SortIcon field="description" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('category')}
                  >
                    <div className="flex items-center gap-2">
                      Category
                      <SortIcon field="category" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors text-right"
                    onClick={() => handleSort('amount')}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      Amount
                      <SortIcon field="amount" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => handleSort('expense_date')}
                  >
                    <div className="flex items-center gap-2">
                      Date
                      <SortIcon field="expense_date" />
                    </div>
                  </TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedExpenses.map((expense) => (
                  <TableRow key={expense.id} className="border-border hover:bg-secondary/30">
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {expense.is_recurring && (
                          <Repeat className="h-4 w-4 text-blue-600" />
                        )}
                        {expense.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary" className="text-xs w-fit">
                          {expense.category}
                        </Badge>
                        {expense.is_recurring && (
                          <Badge variant="outline" className="text-xs text-blue-700 border-blue-200 w-fit">
                            <Repeat className="h-3 w-3 mr-1" />
                            {expense.recurring_period === 'monthly' ? 'Monthly' : 
                             expense.recurring_period === '3-month' ? '3-Month' : 
                             expense.recurring_period === '6-month' ? '6-Month' : 'Yearly'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-foreground">
                      ${expense.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateByLocation(expense.expense_date)}
                    </TableCell>
                    <TableCell>
                      {expense.receipt_url ? (
                        <a 
                          href={expense.receipt_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm"
                        >
                          View Receipt
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">No receipt</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(expense)}
                        className="hover:bg-secondary"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination Controls for Desktop */}
      {!isMobile && sortedExpenses.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedExpenses.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      <AddExpenseDialog 
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={fetchExpenses}
      />

      <EditExpenseDialog 
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={fetchExpenses}
        expense={editingExpense}
      />
    </div>
  )
}