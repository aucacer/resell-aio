export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  client_secret: string;
  metadata?: {
    inventory_id?: string;
    sale_id?: string;
    user_id?: string;
  };
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  status: string;
  payment_intent?: string;
  metadata?: {
    inventory_id?: string;
    sale_id?: string;
    user_id?: string;
  };
}

export interface StripePaymentData {
  amount: number;
  currency: string;
  inventory_id: string;
  sale_id?: string;
  description: string;
  metadata?: Record<string, string>;
}

export type PaymentStatus = 
  | 'pending' 
  | 'processing' 
  | 'succeeded' 
  | 'failed' 
  | 'canceled';

export interface PaymentResult {
  success: boolean;
  payment_intent_id?: string;
  error?: string;
  status?: PaymentStatus;
}