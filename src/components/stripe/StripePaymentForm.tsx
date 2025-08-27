import { useState, useEffect } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { StripePaymentData, PaymentResult } from '@/types/stripe';

interface StripePaymentFormProps {
  paymentData: StripePaymentData;
  onPaymentSuccess: (result: PaymentResult) => void;
  onPaymentError: (error: string) => void;
  disabled?: boolean;
}

export function StripePaymentForm({
  paymentData,
  onPaymentSuccess,
  onPaymentError,
  disabled = false
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      onPaymentError('Stripe has not loaded yet.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      onPaymentError('Card element not found.');
      return;
    }

    setProcessing(true);

    try {
      // Create payment method
      const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          // Add billing details if needed
        },
      });

      if (paymentMethodError) {
        throw new Error(paymentMethodError.message);
      }

      // Here you would typically create a payment intent on your server
      // For now, we'll simulate a successful payment
      // In a real implementation, you'd call your backend API
      
      const result: PaymentResult = {
        success: true,
        payment_intent_id: 'pi_simulated_' + Date.now(),
        status: 'succeeded'
      };

      onPaymentSuccess(result);
      
      toast({
        title: 'Payment successful',
        description: `Payment of $${(paymentData.amount / 100).toFixed(2)} processed successfully.`,
      });

    } catch (error: any) {
      const errorMessage = error.message || 'An unexpected error occurred.';
      onPaymentError(errorMessage);
      
      toast({
        title: 'Payment failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#9e2146',
      },
    },
    hidePostalCode: true,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg">
        <CardElement options={cardElementOptions} />
      </div>
      
      <div className="text-sm text-muted-foreground">
        <p>Amount: ${(paymentData.amount / 100).toFixed(2)} {paymentData.currency.toUpperCase()}</p>
        <p>Description: {paymentData.description}</p>
      </div>

      <Button
        type="submit"
        disabled={!stripe || processing || disabled}
        className="w-full"
      >
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing Payment...
          </>
        ) : (
          `Pay $${(paymentData.amount / 100).toFixed(2)}`
        )}
      </Button>
    </form>
  );
}