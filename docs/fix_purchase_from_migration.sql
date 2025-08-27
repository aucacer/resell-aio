-- Fix for 'purchase_from' column missing error
-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard/project/tofckkpzdbcplxkgxcsr/sql/new)

-- Step 1: Add the purchase_from column to the inventory table
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS purchase_from TEXT;

-- Step 2: Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_purchase_from ON public.inventory(purchase_from);

-- Step 3: Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'inventory'
  AND column_name = 'purchase_from';

-- Expected result: Should show the purchase_from column with data_type 'text'