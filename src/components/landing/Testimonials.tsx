import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Sneaker Reseller",
    content: "ResellAIO transformed my business. I can now track 500+ items across multiple platforms and my profit margins increased by 40% in just 3 months.",
    rating: 5,
    avatar: "SC"
  },
  {
    name: "Marcus Johnson", 
    role: "Streetwear Entrepreneur",
    content: "The analytics dashboard is incredible. Being able to see which brands perform best and track aged inventory has saved me thousands in dead stock.",
    rating: 5,
    avatar: "MJ"
  },
  {
    name: "Elena Rodriguez",
    role: "Luxury Reseller",
    content: "Multi-currency support was a game-changer for my international sales. The expense tracking helps me stay organized for tax season too.",
    rating: 5,
    avatar: "ER"
  },
  {
    name: "David Kim",
    role: "Electronics Reseller", 
    content: "I've tried 5+ inventory apps and ResellAIO is by far the most comprehensive. The mobile app lets me update inventory on the go.",
    rating: 5,
    avatar: "DK"
  }
];

export const Testimonials = () => {
  return (
    <section className="py-24 bg-background" id="testimonials">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-up">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Trusted by{" "}
            <span className="text-gradient">
              Resellers Worldwide
            </span>
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Join thousands of successful resellers who've transformed their business with ResellAIO.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div 
              key={index}
              className="feature-card animate-fade-up text-center"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Avatar */}
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center text-white font-bold text-lg mx-auto mb-4">
                {testimonial.avatar}
              </div>
              
              {/* Rating */}
              <div className="flex justify-center gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              
              {/* Content */}
              <p className="text-muted-foreground mb-4 leading-relaxed italic">
                "{testimonial.content}"
              </p>
              
              {/* Author */}
              <div>
                <div className="font-semibold text-foreground">{testimonial.name}</div>
                <div className="text-sm text-muted-foreground">{testimonial.role}</div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Social Proof Numbers */}
        <div className="mt-20 text-center animate-fade-up">
          <div className="inline-flex items-center gap-8 bg-card border border-border rounded-2xl px-8 py-6 shadow-soft">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">4.9/5</div>
              <div className="text-sm text-muted-foreground">Average Rating</div>
            </div>
            <div className="w-px h-12 bg-border"></div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">500+</div>
              <div className="text-sm text-muted-foreground">Reviews</div>
            </div>
            <div className="w-px h-12 bg-border"></div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">98%</div>
              <div className="text-sm text-muted-foreground">Would Recommend</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};