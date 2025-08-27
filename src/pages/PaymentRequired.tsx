import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { SubscriptionCheckout } from '@/components/subscription/SubscriptionCheckout';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Clock, AlertTriangle } from 'lucide-react';

export default function PaymentRequired() {
  const { user } = useAuth();
  const { subscription, hasAccess, isTrialing, daysUntilExpiry, loading } = useSubscriptionContext();
  const navigate = useNavigate();

  // Redirect to dashboard if user has access
  useEffect(() => {
    if (!loading && hasAccess) {
      navigate('/dashboard');
    }
  }, [loading, hasAccess, navigate]);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const getStatusInfo = () => {
    if (!subscription) {
      return {
        title: 'No Active Subscription',
        description: 'You need an active subscription to access ResellAIO.',
        icon: <AlertTriangle className="h-16 w-16 text-destructive" />,
        variant: 'destructive' as const,
      };
    }

    if (isTrialing && daysUntilExpiry !== null && daysUntilExpiry > 0) {
      return {
        title: 'Trial Period Active',
        description: `Your free trial expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}. Subscribe now to continue using ResellAIO.`,
        icon: <Clock className="h-16 w-16 text-warning" />,
        variant: 'secondary' as const,
      };
    }

    if (subscription.status === 'past_due') {
      return {
        title: 'Payment Past Due',
        description: 'Your subscription payment is past due. Please update your payment method to restore access.',
        icon: <AlertTriangle className="h-16 w-16 text-destructive" />,
        variant: 'destructive' as const,
      };
    }

    return {
      title: 'Subscription Required',
      description: 'Your subscription has expired. Please subscribe to continue using ResellAIO.',
      icon: <CreditCard className="h-16 w-16 text-muted-foreground" />,
      variant: 'secondary' as const,
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">ResellAIO</h1>
          <p className="text-xl text-muted-foreground">Professional Reseller Inventory Management</p>
        </div>

        {/* Status Card */}
        <Card className="max-w-2xl mx-auto mb-12">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              {statusInfo.icon}
            </div>
            <CardTitle className="text-2xl mb-2">{statusInfo.title}</CardTitle>
            <p className="text-muted-foreground">{statusInfo.description}</p>
            {subscription && (
              <div className="flex justify-center mt-4">
                <Badge variant={statusInfo.variant}>
                  Status: {subscription.status}
                </Badge>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {subscription?.status === 'past_due' && (
              <div className="text-center">
                <Button
                  onClick={async () => {
                    // This would open the Stripe customer portal for payment update
                    // Implementation similar to SubscriptionCheckout
                  }}
                  size="lg"
                  className="bg-primary hover:bg-primary/90"
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  Update Payment Method
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Plans */}
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Choose Your Plan
            </h2>
            <p className="text-xl text-muted-foreground">
              Select the plan that best fits your reselling business needs
            </p>
          </div>

          <SubscriptionCheckout showCurrentPlan={false} />
        </div>

        {/* Support Section */}
        <div className="text-center mt-16 pt-8 border-t">
          <p className="text-muted-foreground mb-4">
            Need help? Contact our support team
          </p>
          <Button variant="outline" asChild>
            <a href="mailto:support@resell-aio.com">
              Contact Support
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}