-- Add order_number field to inventory table for tracking purchase orders/invoices
ALTER TABLE public.inventory 
ADD COLUMN order_number TEXT;

-- Add index for better query performance on order_number
CREATE INDEX idx_inventory_order_number ON public.inventory(order_number);

