import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, 
  Calendar, 
  AlertTriangle, 
  CheckCircle,
  ExternalLink,
  Settings,
  RefreshCw,
  TrendingUp,
  Clock
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEnhancedSubscriptionContext } from './EnhancedSubscriptionProvider';
import { DetailedSyncIndicator } from './SubscriptionSyncIndicator';
import { PaymentHistoryTable } from './PaymentHistoryTable';
import { SubscriptionCheckout } from './SubscriptionCheckout';

export function SubscriptionStatusDashboard() {
  const isMobile = useIsMobile();
  const [showCheckout, setShowCheckout] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const {
    subscription,
    enhancedStatus,
    statusDisplay,
    requiresAttention,
    consistencyIssues,
    hasAccess,
    isTrialing,
    daysUntilExpiry,
    plans,
    refreshEnhancedStatus,
    triggerManualSync,
    syncHealth,
    timeSinceSync
  } = useEnhancedSubscriptionContext();

  // Status card styling based on subscription health
  const getStatusCardStyle = () => {
    if (requiresAttention) {
      return "border-red-200 bg-red-50";
    }
    if (syncHealth.needsAttention || consistencyIssues.length > 0) {
      return "border-yellow-200 bg-yellow-50";
    }
    if (hasAccess) {
      return "border-green-200 bg-green-50";
    }
    return "border-gray-200";
  };

  const getStatusIcon = () => {
    if (requiresAttention) {
      return <AlertTriangle className="h-5 w-5 text-red-600" />;
    }
    if (hasAccess) {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    return <Clock className="h-5 w-5 text-gray-600" />;
  };

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const ManageSubscriptionButton = () => (
    <Button 
      variant="outline" 
      className="flex items-center gap-2"
      onClick={() => {
        // In a real app, this would open Stripe customer portal
        window.open('https://billing.stripe.com/p/login/test_00000000', '_blank');
      }}
    >
      <ExternalLink className="h-4 w-4" />
      Manage Billing
    </Button>
  );

  const UpgradeButton = () => {
    const DialogOrDrawer = isMobile ? Drawer : Dialog;
    const DialogOrDrawerContent = isMobile ? DrawerContent : DialogContent;
    const DialogOrDrawerHeader = isMobile ? DrawerHeader : DialogHeader;
    const DialogOrDrawerTitle = isMobile ? DrawerTitle : DialogTitle;
    const DialogOrDrawerDescription = isMobile ? DrawerDescription : DialogDescription;
    const DialogOrDrawerTrigger = isMobile ? DrawerTrigger : DialogTrigger;

    return (
      <DialogOrDrawer open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogOrDrawerTrigger asChild>
          <Button className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Upgrade Plan
          </Button>
        </DialogOrDrawerTrigger>
        <DialogOrDrawerContent className="sm:max-w-4xl">
          <DialogOrDrawerHeader>
            <DialogOrDrawerTitle>Choose Your Plan</DialogOrDrawerTitle>
            <DialogOrDrawerDescription>
              Select a subscription plan that fits your business needs
            </DialogOrDrawerDescription>
          </DialogOrDrawerHeader>
          <div className="p-4">
            <SubscriptionCheckout />
          </div>
        </DialogOrDrawerContent>
      </DialogOrDrawer>
    );
  };

  const ViewHistoryButton = () => {
    const DialogOrDrawer = isMobile ? Drawer : Dialog;
    const DialogOrDrawerContent = isMobile ? DrawerContent : DialogContent;
    const DialogOrDrawerHeader = isMobile ? DrawerHeader : DialogHeader;
    const DialogOrDrawerTitle = isMobile ? DrawerTitle : DialogTitle;
    const DialogOrDrawerDescription = isMobile ? DrawerDescription : DialogDescription;
    const DialogOrDrawerTrigger = isMobile ? DrawerTrigger : DialogTrigger;

    return (
      <DialogOrDrawer open={showHistory} onOpenChange={setShowHistory}>
        <DialogOrDrawerTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Payment History
          </Button>
        </DialogOrDrawerTrigger>
        <DialogOrDrawerContent className="sm:max-w-6xl">
          <DialogOrDrawerHeader>
            <DialogOrDrawerTitle>Payment History</DialogOrDrawerTitle>
            <DialogOrDrawerDescription>
              View all your subscription and payment events
            </DialogOrDrawerDescription>
          </DialogOrDrawerHeader>
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            <PaymentHistoryTable />
          </div>
        </DialogOrDrawerContent>
      </DialogOrDrawer>
    );
  };

  return (
    <div className="space-y-6">
      {/* Status Overview Card */}
      <Card className={getStatusCardStyle()}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <CardTitle>Subscription Status</CardTitle>
                <CardDescription>
                  Current plan and billing information
                </CardDescription>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={refreshEnhancedStatus}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Display */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge 
                  variant={requiresAttention ? "destructive" : hasAccess ? "default" : "secondary"}
                  className="text-sm"
                >
                  {statusDisplay}
                </Badge>
                {subscription && (
                  <Badge variant="outline" className="text-sm">
                    {subscription.plan_id.replace('_', ' ').toUpperCase()}
                  </Badge>
                )}
              </div>
              {isTrialing && daysUntilExpiry && (
                <p className="text-sm text-muted-foreground">
                  Trial ends in {daysUntilExpiry} days
                </p>
              )}
              {subscription?.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  {subscription.cancel_at_period_end ? 'Ends' : 'Renews'} on{' '}
                  {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {!hasAccess || isTrialing ? (
                <UpgradeButton />
              ) : (
                <ManageSubscriptionButton />
              )}
            </div>
          </div>

          {/* Alerts for issues */}
          {requiresAttention && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Your subscription requires attention. Please update your payment method or contact support.
              </AlertDescription>
            </Alert>
          )}

          {consistencyIssues.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Subscription data sync issues detected. Try manual sync or contact support if issues persist.
              </AlertDescription>
            </Alert>
          )}

          <Separator />

          {/* Subscription Details */}
          {subscription && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4" />
                  Billing Period
                </div>
                <div className="text-sm text-muted-foreground">
                  {subscription.current_period_start && subscription.current_period_end ? (
                    <>
                      {format(new Date(subscription.current_period_start), 'MMM d')} -{' '}
                      {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                    </>
                  ) : (
                    'N/A'
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="h-4 w-4" />
                  Payment Status
                </div>
                <div className="text-sm text-muted-foreground">
                  {enhancedStatus?.payment_method_status || 'Unknown'}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings className="h-4 w-4" />
                  Sync Status
                </div>
                <div className="text-sm">
                  <DetailedSyncIndicator />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <ViewHistoryButton />
        
        <Button 
          variant="outline" 
          onClick={triggerManualSync}
          disabled={syncHealth.isPending}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncHealth.isPending ? 'animate-spin' : ''}`} />
          Sync Status
        </Button>
        
        {!hasAccess && (
          <UpgradeButton />
        )}
      </div>

      {/* Additional Information */}
      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Customer ID:</span>{' '}
                <span className="text-muted-foreground font-mono">
                  {subscription.stripe_customer_id?.substring(0, 20)}...
                </span>
              </div>
              <div>
                <span className="font-medium">Subscription ID:</span>{' '}
                <span className="text-muted-foreground font-mono">
                  {subscription.stripe_subscription_id?.substring(0, 20)}...
                </span>
              </div>
              <div>
                <span className="font-medium">Created:</span>{' '}
                <span className="text-muted-foreground">
                  {format(new Date(subscription.created_at), 'MMM d, yyyy')}
                </span>
              </div>
              <div>
                <span className="font-medium">Last Updated:</span>{' '}
                <span className="text-muted-foreground">
                  {format(new Date(subscription.updated_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}