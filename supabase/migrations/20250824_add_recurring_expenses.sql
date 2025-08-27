-- Add recurring expense columns to existing expenses table
ALTER TABLE public.expenses 
ADD COLUMN is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN recurring_period TEXT,
ADD COLUMN recurring_series_id UUID,
ADD COLUMN recurring_end_date DATE,
ADD COLUMN is_parent_expense BOOLEAN NOT NULL DEFAULT FALSE;

-- Create expense_recurring_metadata table
CREATE TABLE public.expense_recurring_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  series_id UUID NOT NULL UNIQUE,
  next_due_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key constraints
ALTER TABLE public.expense_recurring_metadata
ADD CONSTRAINT fk_expense_recurring_metadata_user_id
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable Row Level Security for expense_recurring_metadata
ALTER TABLE public.expense_recurring_metadata ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for expense_recurring_metadata
CREATE POLICY "Users can view their own recurring metadata" 
ON public.expense_recurring_metadata 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recurring metadata" 
ON public.expense_recurring_metadata 
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring metadata" 
ON public.expense_recurring_metadata 
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring metadata" 
ON public.expense_recurring_metadata 
FOR DELETE USING (auth.uid() = user_id);

-- Add check constraints for recurring period values
ALTER TABLE public.expenses 
ADD CONSTRAINT check_recurring_period 
CHECK (recurring_period IN ('monthly', '3-month', '6-month', '12-month') OR recurring_period IS NULL);

-- Create index for better query performance
CREATE INDEX idx_expenses_recurring_series_id ON public.expenses(recurring_series_id) WHERE recurring_series_id IS NOT NULL;
CREATE INDEX idx_expense_recurring_metadata_series_id ON public.expense_recurring_metadata(series_id);
CREATE INDEX idx_expense_recurring_metadata_next_due_date ON public.expense_recurring_metadata(next_due_date) WHERE is_active = TRUE;

-- Add updated_at trigger for expense_recurring_metadata
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.expense_recurring_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();