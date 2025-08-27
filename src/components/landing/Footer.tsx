import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Twitter, 
  Linkedin, 
  Github,
  Mail,
  ArrowRight
} from "lucide-react";

export const Footer = () => {
  return (
    <footer className="bg-background border-t border-border">
      {/* Newsletter Section */}
      <div className="py-16 bg-gradient-hero">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto animate-fade-up">
            <h3 className="text-3xl font-bold text-foreground mb-4">
              Stay Updated with ResellAIO
            </h3>
            <p className="text-muted-foreground mb-8">
              Get the latest tips, features, and reselling insights delivered to your inbox.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <Input 
                placeholder="Enter your email"
                type="email"
                className="flex-1"
              />
              <Button className="btn-gradient">
                Subscribe
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Footer */}
      <div className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            {/* Company Info */}
            <div className="lg:col-span-2">
              <h4 className="text-2xl font-bold text-foreground mb-4">ResellAIO</h4>
              <p className="text-muted-foreground mb-6 max-w-md">
                The complete inventory management platform designed for resellers. 
                Track inventory, manage sales, monitor expenses, and maximize profits - all in one place.
              </p>
              <div className="flex gap-4">
                <Button variant="outline" size="icon">
                  <Twitter className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Linkedin className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Github className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Mail className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Features */}
            <div>
              <h5 className="font-semibold text-foreground mb-4">Features</h5>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Inventory Management</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Analytics Dashboard</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Sales Tracking</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Expense Management</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Multi-Currency</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Data Export</a></li>
              </ul>
            </div>
            
            {/* Company */}
            <div>
              <h5 className="font-semibold text-foreground mb-4">Company</h5>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Press</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Partners</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
              </ul>
            </div>
            
            {/* Support */}
            <div>
              <h5 className="font-semibold text-foreground mb-4">Support</h5>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Status</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Community</a></li>
              </ul>
            </div>
          </div>
          
          {/* Bottom Bar */}
          <div className="mt-16 pt-8 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-muted-foreground text-sm">
              © 2024 ResellAIO. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-primary transition-colors">Cookie Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};