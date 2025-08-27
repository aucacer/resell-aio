import { supabase } from "@/integrations/supabase/client"

export type RecurringPeriod = 'monthly' | '3-month' | '6-month' | '12-month'

export const calculateNextDueDate = (startDate: string, period: RecurringPeriod): string => {
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

export const generateUpcomingExpenses = async (userId: string) => {
  try {
    // Get all active recurring expense metadata that are due within the next 30 days
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    const thirtyDaysFromNowStr = thirtyDaysFromNow.toISOString().split('T')[0]
    
    const { data: recurringMetadata, error: metadataError } = await supabase
      .from('expense_recurring_metadata')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lte('next_due_date', thirtyDaysFromNowStr)

    if (metadataError) throw metadataError

    for (const metadata of recurringMetadata || []) {
      // Get the parent expense details
      const { data: parentExpenses, error: parentError } = await supabase
        .from('expenses')
        .select('*')
        .eq('recurring_series_id', metadata.series_id)
        .eq('is_parent_expense', true)
        .single()

      if (parentError || !parentExpenses) continue

      // Check if we already have an expense for the next due date
      const { data: existingExpense, error: existingError } = await supabase
        .from('expenses')
        .select('*')
        .eq('recurring_series_id', metadata.series_id)
        .eq('expense_date', metadata.next_due_date)
        .single()

      if (existingError && existingError.code !== 'PGRST116') continue // PGRST116 = no rows returned
      if (existingExpense) continue // Already exists

      // Create the new recurring expense
      const { error: insertError } = await supabase
        .from('expenses')
        .insert([
          {
            user_id: userId,
            description: parentExpenses.description,
            category: parentExpenses.category,
            amount: parentExpenses.amount,
            expense_date: metadata.next_due_date,
            receipt_url: parentExpenses.receipt_url,
            is_recurring: true,
            recurring_period: parentExpenses.recurring_period,
            recurring_series_id: metadata.series_id,
            is_parent_expense: false
          }
        ])

      if (insertError) {
        console.error('Error creating recurring expense:', insertError)
        continue
      }

      // Update the next due date in metadata
      const nextDueDate = calculateNextDueDate(
        metadata.next_due_date, 
        parentExpenses.recurring_period as RecurringPeriod
      )

      const { error: updateError } = await supabase
        .from('expense_recurring_metadata')
        .update({ next_due_date: nextDueDate })
        .eq('id', metadata.id)

      if (updateError) {
        console.error('Error updating recurring metadata:', updateError)
      }
    }
  } catch (error) {
    console.error('Error generating upcoming expenses:', error)
  }
}

export const endRecurringSeries = async (seriesId: string, userId: string) => {
  try {
    const currentDate = new Date().toISOString().split('T')[0]
    
    // Update the parent expense to mark the end date
    const { error: expenseError } = await supabase
      .from('expenses')
      .update({ recurring_end_date: currentDate })
      .eq('recurring_series_id', seriesId)
      .eq('user_id', userId)

    if (expenseError) throw expenseError

    // Deactivate the recurring metadata
    const { error: metadataError } = await supabase
      .from('expense_recurring_metadata')
      .update({ is_active: false })
      .eq('series_id', seriesId)
      .eq('user_id', userId)

    if (metadataError) throw metadataError

    // Delete any future pre-generated expenses
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .eq('recurring_series_id', seriesId)
      .eq('user_id', userId)
      .gte('expense_date', currentDate)
      .eq('is_parent_expense', false)

    if (deleteError) throw deleteError

    return { success: true }
  } catch (error) {
    console.error('Error ending recurring series:', error)
    return { success: false, error }
  }
}

export const getRecurringSeriesInfo = async (seriesId: string, userId: string) => {
  try {
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('*')
      .eq('recurring_series_id', seriesId)
      .eq('user_id', userId)
      .order('expense_date', { ascending: true })

    if (expensesError) throw expensesError

    const { data: metadata, error: metadataError } = await supabase
      .from('expense_recurring_metadata')
      .select('*')
      .eq('series_id', seriesId)
      .eq('user_id', userId)
      .single()

    if (metadataError) throw metadataError

    return {
      expenses: expenses || [],
      metadata,
      isActive: metadata?.is_active || false
    }
  } catch (error) {
    console.error('Error getting recurring series info:', error)
    return null
  }
}