import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PaymentDialog } from '@/components/stripe/PaymentDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard, Loader2 } from 'lucide-react';
import type { StripePaymentData, PaymentResult } from '@/types/stripe';

interface InventoryItem {
  id: string;
  item_name: string;
  purchase_price: number;
  brand?: string;
  size?: string;
}

interface StripePaymentSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItem: InventoryItem;
  salePrice: number;
  onSuccess: () => void;
}

export function StripePaymentSaleDialog({
  open,
  onOpenChange,
  selectedItem,
  salePrice,
  onSuccess
}: StripePaymentSaleDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [processing, setProcessing] = useState(false);

  const paymentData: StripePaymentData = {
    amount: salePrice * 100, // Convert to cents
    currency: 'usd',
    inventory_id: selectedItem.id,
    description: `Sale of ${selectedItem.item_name}${selectedItem.brand ? ` - ${selectedItem.brand}` : ''}`,
    metadata: {
      inventory_id: selectedItem.id,
      user_id: user?.id || '',
    }
  };

  const handlePaymentSuccess = async (result: PaymentResult) => {
    if (!user) return;
    
    setProcessing(true);
    
    try {
      const profit = salePrice - selectedItem.purchase_price;
      
      // Record the sale in Supabase
      const { error: saleError } = await supabase
        .from('sales')
        .insert({
          user_id: user.id,
          inventory_id: selectedItem.id,
          item_name: selectedItem.item_name,
          sale_price: salePrice,
          purchase_price: selectedItem.purchase_price,
          profit: profit,
          sale_date: new Date().toISOString().split('T')[0],
          platform: 'Stripe',
          notes: `Payment ID: ${result.payment_intent_id}`,
        });

      if (saleError) throw saleError;

      // Mark inventory item as sold
      const { error: inventoryError } = await supabase
        .from('inventory')
        .update({ is_sold: true })
        .eq('id', selectedItem.id);

      if (inventoryError) throw inventoryError;

      toast({
        title: 'Sale completed successfully',
        description: `${selectedItem.item_name} sold for $${salePrice.toFixed(2)} with $${profit.toFixed(2)} profit.`,
      });

      setShowPaymentDialog(false);
      onOpenChange(false);
      onSuccess();
      
    } catch (error: any) {
      toast({
        title: 'Error recording sale',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handlePaymentError = (error: string) => {
    toast({
      title: 'Payment failed',
      description: error,
      variant: 'destructive',
    });
  };

  const profit = salePrice - selectedItem.purchase_price;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Stripe Payment Sale</DialogTitle>
            <DialogDescription>
              Process a sale with secure Stripe payment for the selected item.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex justify-between">
                <span className="font-medium">Item:</span>
                <span>{selectedItem.item_name}</span>
              </div>
              {selectedItem.brand && (
                <div className="flex justify-between">
                  <span className="font-medium">Brand:</span>
                  <span>{selectedItem.brand}</span>
                </div>
              )}
              {selectedItem.size && (
                <div className="flex justify-between">
                  <span className="font-medium">Size:</span>
                  <span>{selectedItem.size}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-medium">Sale Price:</span>
                <span className="font-bold">${salePrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Purchase Price:</span>
                <span>${selectedItem.purchase_price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t pt-3">
                <span className="font-medium">Estimated Profit:</span>
                <span className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                </span>
              </div>
            </div>

            <Button
              onClick={() => setShowPaymentDialog(true)}
              disabled={processing}
              className="w-full"
              size="lg"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Process Payment (${salePrice.toFixed(2)})
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        paymentData={paymentData}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentError={handlePaymentError}
      />
    </>
  );
}