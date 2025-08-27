import { 
  Package, 
  BarChart3, 
  DollarSign, 
  FileText, 
  Globe, 
  Download, 
  Shield, 
  Smartphone 
} from "lucide-react";

const features = [
  {
    icon: Package,
    title: "Smart Inventory Management",
    description: "Track items with detailed information including name, brand, size, condition, and SKU. Get aged stock alerts for items over 10 months old."
  },
  {
    icon: BarChart3,
    title: "Comprehensive Analytics Dashboard", 
    description: "Real-time profit tracking, ROI calculations, interactive sales charts, and trend analysis with customizable date ranges."
  },
  {
    icon: DollarSign,
    title: "Sales Management",
    description: "Record sales across multiple platforms (StockX, GOAT, eBay) with automatic profit calculations including fees and shipping."
  },
  {
    icon: FileText,
    title: "Expense Tracking",
    description: "Categorize business expenses, upload receipts, automate recurring expenses, and generate detailed expense reports."
  },
  {
    icon: Globe,
    title: "Multi-Currency & Localization",
    description: "Support for USD, EUR, GBP, CAD, AUD, JPY with localized date formats for different regions worldwide."
  },
  {
    icon: Download,
    title: "Data Export & Backup",
    description: "CSV export for inventory, sales, and expenses with date range filtering and Excel-compatible formatting."
  },
  {
    icon: Shield,
    title: "Secure Authentication",
    description: "Email/password authentication with Supabase, password reset functionality, and row-level security for data protection."
  },
  {
    icon: Smartphone,
    title: "Mobile-Responsive Design",
    description: "Optimized for all device sizes with touch-friendly interface, drawer navigation, and responsive charts."
  }
];

export const Features = () => {
  return (
    <section className="py-24 bg-background" id="features">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-up">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Everything You Need to{" "}
            <span className="text-gradient">
              Scale Your Business
            </span>
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Powerful features designed specifically for resellers to streamline operations, maximize profits, and grow their business.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="feature-card animate-fade-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mb-4">
                <feature.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
        
        {/* Stats Section */}
        <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div className="animate-fade-up">
            <div className="text-3xl md:text-4xl font-bold text-primary mb-2">10K+</div>
            <div className="text-muted-foreground">Active Resellers</div>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <div className="text-3xl md:text-4xl font-bold text-primary mb-2">$2M+</div>
            <div className="text-muted-foreground">Sales Tracked</div>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <div className="text-3xl md:text-4xl font-bold text-primary mb-2">150K+</div>
            <div className="text-muted-foreground">Items Managed</div>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <div className="text-3xl md:text-4xl font-bold text-primary mb-2">99.9%</div>
            <div className="text-muted-foreground">Uptime</div>
          </div>
        </div>
      </div>
    </section>
  );
};