import { Button } from "@/components/ui/button";
import { Check, Star, Shield } from "lucide-react";

const plans = [
  {
    name: "Free Trial",
    price: "Free",
    period: "30 days",
    description: "Perfect for trying out ResellAIO",
    features: [
      "Up to 50 inventory items",
      "Basic analytics dashboard",
      "Sales tracking (3 platforms)",
      "Expense tracking",
      "CSV export",
      "Email support"
    ],
    cta: "Start Free Trial",
    popular: false
  },
  {
    name: "Pro Plan",
    price: "$29",
    period: "per month",
    description: "Best for serious resellers",
    features: [
      "Unlimited inventory items",
      "Advanced analytics & reports",
      "All platform integrations",
      "Multi-currency support",
      "Automated expense tracking",
      "Priority support",
      "Data backup & export",
      "Mobile app access"
    ],
    cta: "Get Started",
    popular: true
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    description: "For large operations & teams",
    features: [
      "Everything in Pro",
      "Custom integrations",
      "Team collaboration tools", 
      "Advanced API access",
      "Dedicated account manager",
      "Custom training",
      "SLA guarantee",
      "White-label options"
    ],
    cta: "Contact Sales",
    popular: false
  }
];

export const Pricing = () => {
  return (
    <section className="py-24 bg-card/30" id="pricing">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-up">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Choose Your{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Growth Plan
            </span>
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Start with our free trial, then choose the plan that scales with your reselling business.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <div 
              key={index}
              className={`pricing-card relative animate-fade-up ${
                plan.popular ? 'pricing-card-featured' : ''
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-primary text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1 shadow-medium">
                    <Star className="h-4 w-4 fill-current" />
                    Most Popular
                  </div>
                </div>
              )}
              
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-foreground mb-2">{plan.name}</h3>
                <p className="text-muted-foreground mb-4">{plan.description}</p>
                <div className="mb-4">
                  <span className="text-4xl md:text-5xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground ml-2">/{plan.period}</span>
                </div>
              </div>
              
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <Button 
                className={`w-full ${
                  plan.popular 
                    ? 'btn-gradient' 
                    : 'bg-background border border-border hover:bg-muted text-foreground'
                }`}
                size="lg"
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
        
        {/* Money Back Guarantee */}
        <div className="text-center mt-16 animate-fade-up">
          <div className="inline-flex items-center gap-3 bg-success/10 text-success px-6 py-3 rounded-full">
            <Shield className="h-5 w-5" />
            <span className="font-semibold">30-day money-back guarantee</span>
          </div>
        </div>
      </div>
    </section>
  );
};