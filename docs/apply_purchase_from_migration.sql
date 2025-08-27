-- Add purchase_from field to inventory table
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS purchase_from TEXT;

-- Add index for better query performance on purchase_from
CREATE INDEX IF NOT EXISTS idx_inventory_purchase_from ON public.inventory(purchase_from);