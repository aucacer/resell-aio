import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StripeProvider } from './StripeProvider';
import { StripePaymentForm } from './StripePaymentForm';
import type { StripePaymentData, PaymentResult } from '@/types/stripe';

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentData: StripePaymentData;
  onPaymentSuccess: (result: PaymentResult) => void;
  onPaymentError?: (error: string) => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  paymentData,
  onPaymentSuccess,
  onPaymentError = () => {}
}: PaymentDialogProps) {
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  const handlePaymentSuccess = (result: PaymentResult) => {
    setPaymentProcessing(false);
    onPaymentSuccess(result);
    onOpenChange(false);
  };

  const handlePaymentError = (error: string) => {
    setPaymentProcessing(false);
    onPaymentError(error);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Complete Payment</DialogTitle>
          <DialogDescription>
            Secure payment processing powered by Stripe
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <StripeProvider>
            <StripePaymentForm
              paymentData={paymentData}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              disabled={paymentProcessing}
            />
          </StripeProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}