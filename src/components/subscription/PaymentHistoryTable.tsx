import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { format } from 'date-fns';
import { Download, RefreshCw, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPaymentEventHistory } from '@/lib/subscriptionUtils';
import { useAuth } from '@/contexts/AuthContext';

interface PaymentEvent {
  event_id: string;
  stripe_event_id: string;
  event_type: string;
  event_data: Record<string, any>;
  processing_status: 'pending' | 'processed' | 'failed' | 'skipped';
  processed_at: string | null;
  error_details: Record<string, any> | null;
  retry_count: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export function PaymentHistoryTable() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPaymentHistory = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await getPaymentEventHistory(user.id);
      if (result.success && result.events) {
        setEvents(result.events);
      } else {
        setError(result.error || 'Failed to load payment history');
      }
    } catch (err: any) {
      console.error('Payment history load error:', err);
      setError('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPaymentHistory();
  }, [user]);

  const getEventTypeDisplay = (eventType: string) => {
    const typeMap: Record<string, string> = {
      'customer.subscription.created': 'Subscription Created',
      'customer.subscription.updated': 'Subscription Updated',
      'customer.subscription.deleted': 'Subscription Cancelled',
      'invoice.payment_succeeded': 'Payment Successful',
      'invoice.payment_failed': 'Payment Failed',
      'checkout.session.completed': 'Checkout Completed',
    };
    return typeMap[eventType] || eventType;
  };

  const getStatusBadge = (status: PaymentEvent['processing_status']) => {
    switch (status) {
      case 'processed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Processed</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'skipped':
        return <Badge variant="outline" className="bg-gray-100 text-gray-600">Skipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getEventAmount = (eventData: Record<string, any>): string | null => {
    // Extract amount from various event types
    if (eventData.data?.object?.amount_paid) {
      return `$${(eventData.data.object.amount_paid / 100).toFixed(2)}`;
    }
    if (eventData.data?.object?.total) {
      return `$${(eventData.data.object.total / 100).toFixed(2)}`;
    }
    if (eventData.data?.object?.amount_due) {
      return `$${(eventData.data.object.amount_due / 100).toFixed(2)}`;
    }
    return null;
  };

  const getEventDescription = (event: PaymentEvent): string => {
    const obj = event.event_data.data?.object;
    
    switch (event.event_type) {
      case 'invoice.payment_succeeded':
        return `Payment of ${getEventAmount(event.event_data) || 'amount'} processed successfully`;
      case 'invoice.payment_failed':
        return `Payment of ${getEventAmount(event.event_data) || 'amount'} failed`;
      case 'customer.subscription.created':
        return `New subscription started`;
      case 'customer.subscription.updated':
        if (obj?.cancel_at_period_end) {
          return 'Subscription cancelled (active until period end)';
        }
        return 'Subscription details updated';
      case 'customer.subscription.deleted':
        return 'Subscription ended';
      case 'checkout.session.completed':
        return `Checkout completed for ${getEventAmount(event.event_data) || 'subscription'}`;
      default:
        return 'Subscription event';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Payment History
            <RefreshCw className="h-4 w-4 animate-spin" />
          </CardTitle>
          <CardDescription>Loading your payment and subscription events...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Payment History
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={loadPaymentHistory}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
          <CardDescription>Your payment and subscription history</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <p className="mb-4">Failed to load payment history</p>
            <Button variant="outline" onClick={loadPaymentHistory}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Payment History
            </CardTitle>
            <CardDescription>
              Your payment and subscription events ({events.length} total)
            </CardDescription>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={loadPaymentHistory}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>No payment history found</p>
            <p className="text-sm mt-1">Payment events will appear here once you have subscription activity</p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.event_id}>
                    <TableCell>
                      <div className="font-medium">
                        {format(new Date(event.created_at), 'MMM d, yyyy')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(event.created_at), 'h:mm a')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {getEventTypeDisplay(event.event_type)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        ID: {event.stripe_event_id.substring(0, 20)}...
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        {getEventDescription(event)}
                      </div>
                      {event.error_details && (
                        <div className="text-sm text-red-600 mt-1">
                          Error: {event.error_details.message || 'Processing failed'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(event.processing_status)}
                      {event.retry_count > 0 && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {event.retry_count} retries
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {getEventAmount(event.event_data) || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}