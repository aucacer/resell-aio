import { Button } from "@/components/ui/button";
import { ArrowRight, Play, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
const dashboardPreview = "/lovable-uploads/25f111d8-8b61-4387-9781-ac75149a8f2f.png";

export const Hero = () => {
  const navigate = useNavigate();

  const handleStartTrial = () => {
    navigate("/auth");
  };

  const handleLogin = () => {
    navigate("/auth");
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-hero overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
      
      {/* Login Button - Top Right */}
      <div className="absolute top-6 right-6 z-20">
        <Button 
          onClick={handleLogin}
          variant="outline" 
          size="sm"
          className="bg-background/80 backdrop-blur-sm border border-border hover:bg-background"
        >
          <LogIn className="h-4 w-4 mr-2" />
          Login
        </Button>
      </div>
      
      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="text-center max-w-4xl mx-auto animate-fade-up">
          {/* Badge */}
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            🎉 Now with Multi-Currency Support
          </div>
          
          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6 leading-tight">
            Master Your{" "}
            <span className="text-gradient">
              Reselling Business
            </span>{" "}
            with ResellAIO
          </h1>
          
          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed max-w-3xl mx-auto">
            The complete inventory management platform designed for resellers. Track inventory, manage sales, monitor expenses, and maximize profits - all in one place.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button onClick={handleStartTrial} size="lg" className="btn-gradient text-lg px-8 py-4 h-auto">
              Start Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button variant="outline" size="lg" className="text-lg px-8 py-4 h-auto">
              <Play className="mr-2 h-5 w-5" />
              Watch Demo
            </Button>
          </div>
          
          {/* Trust Indicators */}
          <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground mb-16">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-success rounded-full"></div>
              30-day free trial
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-success rounded-full"></div>
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-success rounded-full"></div>
              Cancel anytime
            </div>
          </div>
        </div>
        
        {/* Dashboard Preview */}
        <div className="relative max-w-6xl mx-auto animate-slide-up">
          <div className="relative rounded-2xl overflow-hidden shadow-large border border-border/50 bg-card/50 backdrop-blur-sm">
            <img
              src={dashboardPreview}
              alt="ResellAIO Dashboard Preview - Analytics and Inventory Management"
              className="w-full h-auto"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent"></div>
          </div>
          
          {/* Floating Elements */}
          <div className="absolute -top-4 -right-4 bg-success text-success-foreground px-4 py-2 rounded-lg font-semibold shadow-medium">
            +$2,847 Profit This Month
          </div>
          <div className="absolute -bottom-4 -left-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold shadow-medium">
            156 Items Tracked
          </div>
        </div>
      </div>
    </section>
  );
};