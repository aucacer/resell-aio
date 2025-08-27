# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ResellAIO is a reseller inventory management application built with React, TypeScript, and Supabase. It helps resellers track inventory, sales, expenses, and calculate profits.

## Tech Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS
- **State Management**: React Context (AuthContext) + TanStack Query
- **Database**: Supabase (PostgreSQL)
- **Routing**: React Router v6
- **Forms**: React Hook Form with Zod validation

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Build for development
npm run build:dev

# Run linter
npm run lint

# Preview production build
npm run preview
```

## Project Architecture

### Core Application Structure

- **Authentication**: Managed through `src/contexts/AuthContext.tsx` using Supabase Auth
- **Protected Routes**: Implemented in `src/App.tsx` with authentication checks
- **Layout**: Main application layout in `src/components/layout/MainLayout.tsx` with sidebar navigation

### Key Data Models

1. **Inventory** (`inventory` table)
   - Tracks items: name, brand, size, condition, purchase price/date, market value, SKU
   - Flags for sold status
   
2. **Sales** (`sales` table)
   - Links to inventory items
   - Records sale price, profit calculations, platform, fees, shipping costs
   
3. **Expenses** (`expenses` table)
   - Business expense tracking with categories
   - Receipt management

### Component Organization

- **Pages** (`src/pages/`): Main route components (Dashboard, Inventory, Sales, Expenses, Settings)
- **UI Components** (`src/components/ui/`): shadcn/ui components - do not modify directly
- **Feature Components**:
  - `src/components/inventory/`: Inventory management dialogs
  - `src/components/sales/`: Sales recording dialogs
  - `src/components/expenses/`: Expense management dialogs
  - `src/components/layout/`: Application layout components

### State Management

- **Authentication State**: Global auth context provides user session
- **Data Fetching**: TanStack Query for server state management
- **Form State**: React Hook Form for form handling

### Supabase Integration

- **Client**: Configured in `src/integrations/supabase/client.ts`
- **Types**: Generated types in `src/integrations/supabase/types.ts`
- **RLS**: Row Level Security enabled on all tables
- **Migrations**: Database schema in `supabase/migrations/`

## Important Patterns

1. **Date Handling**: Use `src/lib/dateUtils.ts` for consistent date formatting
2. **Mobile Responsiveness**: Use `useIsMobile` hook for responsive components
3. **Toast Notifications**: Use Sonner for user feedback
4. **Form Validation**: Zod schemas for type-safe validation
5. **Dialog/Drawer Pattern**: Desktop uses Dialog, mobile uses Drawer

## Deployment

This is a Lovable project that can be deployed via the Lovable platform. The project URL is:
https://lovable.dev/projects/9cb828d6-dddd-43d9-a65f-d912733cc884