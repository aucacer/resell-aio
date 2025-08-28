# ResellAIO 🛍️

> **Professional Reseller Inventory Management Platform**  
> Streamline your reselling business with powerful inventory tracking, sales analytics, and automated financial management.

[![Live Demo](https://img.shields.io/badge/Live-Demo-blue?style=for-the-badge)](https://lovable.dev/projects/9cb828d6-dddd-43d9-a65f-d912733cc884)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)

## 🎯 Overview

ResellAIO is a comprehensive platform designed for serious resellers who need professional-grade tools to manage their inventory, track sales, analyze profits, and scale their operations. Built with modern web technologies and enterprise-grade architecture, it provides everything needed to run a successful reselling business.

### Why ResellAIO?

- **📊 Advanced Analytics**: Real-time dashboards with profit tracking and performance metrics
- **🔄 Multi-Platform Support**: Track sales across multiple platforms and marketplaces
- **💰 Financial Management**: Automated profit calculations, expense tracking, and tax reporting
- **🌍 Global Ready**: Multi-currency support with location-based formatting
- **📱 Mobile First**: Responsive design that works perfectly on all devices
- **🔒 Enterprise Security**: Row-level security, encrypted data, and secure payment processing

## ✨ Key Features

### 📦 Inventory Management
- **Smart Item Tracking**: SKU generation, purchase details, market value monitoring
- **Condition Management**: Track item conditions with detailed notes
- **Bulk Operations**: Import/export inventory via CSV with batch processing
- **Image Support**: Upload and manage product images with cloud storage
- **Search & Filter**: Advanced filtering by brand, size, condition, and purchase date

### 💸 Sales Analytics
- **Profit Calculation**: Automatic profit/loss calculations with fee deduction
- **Platform Integration**: Support for eBay, Mercari, Facebook Marketplace, and more
- **Performance Metrics**: Sales velocity, conversion rates, and ROI analysis
- **Shipping Management**: Track shipping costs and integrate with carriers
- **Tax Reporting**: Generate tax-ready reports for accounting

### 📊 Financial Tracking
- **Expense Management**: Categorized business expense tracking with receipt storage
- **Recurring Expenses**: Automated tracking of subscription and recurring costs
- **Multi-Currency**: Support for USD, EUR, GBP, CAD, AUD, JPY with real-time conversion
- **Export Options**: CSV exports with customizable date ranges and filters
- **Profit Dashboard**: Visual charts showing revenue, expenses, and net profit trends

### 🎛️ Business Intelligence
- **Interactive Charts**: Revenue trends, sales distribution, and profit margins
- **Custom Reports**: Generate reports for specific time periods and product categories
- **KPI Monitoring**: Track key performance indicators for business growth
- **Data Visualization**: Beautiful charts powered by Recharts library
- **Real-time Updates**: Live data synchronization across all devices

### 🔐 Subscription Management
- **Flexible Plans**: Free Trial (50 items), Pro Monthly (unlimited), Enterprise options
- **Stripe Integration**: Secure payment processing with customer portal
- **Auto-sync**: Seamless subscription status updates and billing management
- **Usage Tracking**: Monitor inventory limits and plan utilization

## 🛠️ Tech Stack

### Frontend
- **React 18**: Latest React with concurrent features and hooks
- **TypeScript**: Full type safety and enhanced developer experience
- **Vite**: Lightning-fast build tool with HMR and optimized bundling
- **Tailwind CSS**: Utility-first styling with custom design system
- **shadcn/ui**: Beautiful, accessible components built on Radix UI

### Backend & Database
- **Supabase**: PostgreSQL database with real-time subscriptions
- **Row-Level Security**: Enterprise-grade data protection
- **Edge Functions**: Serverless API endpoints with global distribution
- **Authentication**: Secure user management with JWT tokens
- **File Storage**: Encrypted cloud storage for images and documents

### Payment & Subscriptions
- **Stripe**: Complete payment processing with webhooks
- **Customer Portal**: Self-service subscription and billing management
- **Multiple Plans**: Flexible pricing tiers with feature gating
- **Automated Billing**: Recurring payments with dunning management

### State Management & Data
- **TanStack Query**: Powerful data fetching with caching and synchronization
- **React Context**: Global state management for auth and settings
- **React Hook Form**: Performant forms with Zod validation
- **Real-time Updates**: WebSocket connections for live data

### Developer Experience
- **ESLint**: Code quality and consistency enforcement
- **TypeScript**: Full type coverage for runtime safety
- **Hot Module Replacement**: Instant development feedback
- **Component Library**: Reusable, documented component system

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase account and project
- Stripe account for payments

### Installation

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd resello

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase and Stripe keys

# Start development server
npm run dev
```

Visit `http://localhost:5173` to see the application running.

## 📁 Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── ui/              # shadcn/ui base components
│   ├── inventory/       # Inventory management components
│   ├── sales/           # Sales tracking components
│   ├── expenses/        # Expense management components
│   ├── subscription/    # Payment and subscription components
│   ├── landing/         # Marketing landing page components
│   └── layout/          # Application layout components
├── contexts/            # React Context providers
│   ├── AuthContext.tsx  # Authentication state
│   ├── SubscriptionContext.tsx # Subscription state
│   └── UserSettingsContext.tsx # User preferences
├── hooks/               # Custom React hooks
├── integrations/        # External service integrations
├── lib/                 # Utility functions and configurations
├── pages/               # Application pages/routes
├── types/               # TypeScript type definitions
└── App.tsx             # Main application component

supabase/
├── functions/           # Edge Functions (API endpoints)
│   ├── create-checkout-session/ # Stripe checkout
│   ├── create-portal-session/   # Customer portal
│   ├── stripe-webhook/          # Payment webhooks
│   └── sync-subscription/       # Subscription sync
└── migrations/          # Database schema migrations
```

## 🗄️ Database Schema

### Core Tables

**inventory** - Product inventory tracking
- Item details, SKU, purchase info, condition, market value
- Relationships: sales (one-to-many)

**sales** - Sales transactions
- Sale price, profit calculations, platform, shipping, fees
- Relationships: inventory (many-to-one)

**expenses** - Business expense tracking
- Description, amount, category, date, receipt storage
- Support for recurring expenses

**user_settings** - User preferences
- Currency, location, date formats, notification settings

**subscription_plans** - Available subscription tiers
- Plan details, pricing, features, Stripe integration

**user_subscriptions** - User subscription status
- Stripe customer/subscription IDs, plan status, billing periods

### Key Features
- **Row-Level Security**: All tables secured by user ownership
- **Real-time Subscriptions**: Live updates via Supabase real-time
- **Foreign Key Constraints**: Data integrity enforcement
- **Indexed Queries**: Optimized performance for large datasets

## 🔌 API Endpoints

### Edge Functions

**create-checkout-session** - Initialize Stripe payment
```typescript
POST /functions/v1/create-checkout-session
Body: { price_id: string, success_url: string, cancel_url: string }
```

**create-portal-session** - Customer billing portal
```typescript
POST /functions/v1/create-portal-session  
Body: { return_url: string }
```

**stripe-webhook** - Process Stripe events
```typescript
POST /functions/v1/stripe-webhook
Headers: { stripe-signature: string }
```

**sync-subscription** - Manual subscription sync
```typescript
POST /functions/v1/sync-subscription
Headers: { Authorization: Bearer <token> }
```

## 💳 Subscription System

### Plan Tiers

| Feature | Free Trial | Pro Monthly | Enterprise |
|---------|------------|-------------|------------|
| **Inventory Items** | 50 | Unlimited | Unlimited |
| **Analytics** | Basic | Advanced | Custom |
| **Platform Support** | 3 | All | All + API |
| **Export Options** | CSV | All formats | Custom |
| **Support** | Email | Priority | Dedicated |
| **Price** | $0 | $29/month | Custom |

### Integration Features
- **Automatic Billing**: Recurring payments with Stripe
- **Customer Portal**: Self-service subscription management
- **Usage Tracking**: Real-time inventory limit monitoring
- **Upgrade/Downgrade**: Seamless plan transitions
- **Webhook Processing**: Real-time subscription status updates

## 🌍 Environment Variables

Create a `.env.local` file with the following variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stripe Configuration (for Edge Functions)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Application Configuration
VITE_APP_URL=http://localhost:5173
SITE_URL=http://localhost:5173
```

### Required Services
- **Supabase Project**: Database, authentication, and storage
- **Stripe Account**: Payment processing and subscription management
- **Domain/Hosting**: For production deployment

## 🛠️ Development

### Available Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run build:dev  # Build for development/staging
npm run lint       # Run ESLint
npm run preview    # Preview production build
```

### Database Management

```bash
# Run migrations
supabase db reset

# Generate TypeScript types
supabase gen types typescript --local > src/integrations/supabase/types.ts

# Deploy functions
supabase functions deploy
```

### Code Quality
- **ESLint**: Configured with React and TypeScript rules
- **Type Safety**: Strict TypeScript configuration
- **Component Standards**: Consistent component patterns
- **Git Hooks**: Pre-commit linting and formatting

## 🚀 Deployment

### Lovable Platform (Recommended)
1. Open [Lovable Project](https://lovable.dev/projects/9cb828d6-dddd-43d9-a65f-d912733cc884)
2. Click Share → Publish
3. Configure custom domain in Project Settings

### Manual Deployment
1. Build the project: `npm run build`
2. Deploy `dist/` folder to your hosting platform
3. Set up environment variables on hosting platform
4. Deploy Supabase Edge Functions: `supabase functions deploy`

### Production Considerations
- **Environment Variables**: Secure storage of API keys
- **CORS Configuration**: Proper origin restrictions
- **SSL/TLS**: HTTPS enforcement for security
- **CDN**: Static asset optimization
- **Monitoring**: Error tracking and performance monitoring

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Getting Started
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes with proper tests
4. Commit changes: `git commit -m 'Add amazing feature'`
5. Push to branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Code Standards
- Follow existing TypeScript patterns
- Add proper type definitions
- Include tests for new features
- Update documentation as needed
- Follow the established component architecture

### Issues
- Use issue templates for bug reports and feature requests
- Provide detailed reproduction steps for bugs
- Include screenshots for UI-related issues

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **shadcn/ui** - Beautiful, accessible component library
- **Supabase** - Backend-as-a-Service platform
- **Stripe** - Payment processing infrastructure  
- **Lovable** - Development and hosting platform
- **React Community** - Amazing ecosystem and tools

## 📞 Support

- **Documentation**: [Project Wiki](#)
- **Issues**: [GitHub Issues](https://github.com/your-repo/resello/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/resello/discussions)
- **Email**: support@resell-aio.com

---

<p align="center">Made with ❤️ for resellers worldwide</p>