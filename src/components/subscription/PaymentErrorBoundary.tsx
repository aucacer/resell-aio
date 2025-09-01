import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Mail } from 'lucide-react';

interface PaymentErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface PaymentErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
}

class PaymentErrorBoundary extends React.Component<PaymentErrorBoundaryProps, PaymentErrorBoundaryState> {
  constructor(props: PaymentErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): PaymentErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('PaymentErrorBoundary caught an error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });

    this.setState({
      hasError: true,
      error,
      errorInfo,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleContactSupport = () => {
    const subject = encodeURIComponent('Payment System Error');
    const body = encodeURIComponent(
      `I encountered an error in the payment system.\n\nError: ${this.state.error?.message}\nTime: ${new Date().toISOString()}\n\nPlease help resolve this issue.`
    );
    window.open(`mailto:support@resello.ai?subject=${subject}&body=${body}`);
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error!} retry={this.handleRetry} />;
      }

      // Default error UI
      return (
        <Card className="max-w-lg mx-auto border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Payment System Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>
                We encountered an unexpected error while loading the payment system. 
                This might be a temporary issue.
              </p>
              {this.state.error?.message && (
                <details className="mt-2 p-2 bg-muted rounded text-xs">
                  <summary className="cursor-pointer font-medium">Technical Details</summary>
                  <pre className="mt-2 whitespace-pre-wrap">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={this.handleRetry}
                variant="outline"
                className="flex-1"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button
                onClick={this.handleContactSupport}
                variant="default"
                className="flex-1"
              >
                <Mail className="mr-2 h-4 w-4" />
                Contact Support
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              If this issue persists, please contact our support team for assistance.
            </p>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default PaymentErrorBoundary;