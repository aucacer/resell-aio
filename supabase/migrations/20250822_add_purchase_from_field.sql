-- Add purchase_from field to inventory table
ALTER TABLE public.inventory 
ADD COLUMN purchase_from TEXT;

-- Add index for better query performance on purchase_from
CREATE INDEX idx_inventory_purchase_from ON public.inventory(purchase_from);