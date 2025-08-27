import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { StripePaymentData, PaymentResult, PaymentStatus } from '@/types/stripe';

export function useStripePayment() {
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const { toast } = useToast();

  const createPaymentIntent = async (paymentData: StripePaymentData): Promise<string | null> => {
    setLoading(true);
    
    try {
      // In a real implementation, this would call your backend API
      // Example endpoint: /api/create-payment-intent
      
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      });

      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      const { client_secret } = await response.json();
      return client_secret;
      
    } catch (error: any) {
      toast({
        title: 'Payment Error',
        description: error.message || 'Failed to initialize payment',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentResult = (result: PaymentResult) => {
    if (result.success) {
      setPaymentStatus('succeeded');
      toast({
        title: 'Payment Successful',
        description: 'Your payment has been processed successfully.',
      });
    } else {
      setPaymentStatus('failed');
      toast({
        title: 'Payment Failed',
        description: result.error || 'Payment processing failed.',
        variant: 'destructive',
      });
    }
  };

  const resetPaymentStatus = () => {
    setPaymentStatus('pending');
  };

  return {
    loading,
    paymentStatus,
    createPaymentIntent,
    handlePaymentResult,
    resetPaymentStatus,
  };
}