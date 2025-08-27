Products & Prices

Create your plan(s) in Products → Prices (recurring: monthly/yearly).

Make sure prices are Active and in the right currency.

Customer (per user)

When a user signs up, create or reuse a Stripe Customer and store stripe_customer_id in your DB.

Checkout (to start a subscription)

Use Stripe Checkout with mode: 'subscription' OR create the subscription server-side.

Set success_url / cancel_url.

Customer Portal (for managing the subscription)

In Dashboard: Billing → Customer portal

Enable: Update payment methods, Cancel/pause, Switch plans, View invoices (whatever you want).

Add Return URL back to your app.

Your backend will create a Portal Session link for the user.

Webhooks (keep your DB in sync)

Add an endpoint and listen for:

checkout.session.completed (on first subscription)

customer.subscription.created/updated/deleted

invoice.paid / invoice.payment_failed

Update your local user’s subscription status/plan/period end based on these.

(If charging GST)

Either configure Stripe Tax or create a Tax Rate (10%) and attach to prices/invoices.

Minimal backend snippets (Supabase Edge Function / Node)

Replace STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET with your envs. Store them in Supabase project secrets.

Create a Customer Portal session

// supabase/functions/portal/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.23.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Get your logged-in user and their stored Stripe customer id
  const { stripe_customer_id, return_url } = await req.json(); // supply these from your app

  const session = await stripe.billingPortal.sessions.create({
    customer: stripe_customer_id,
    return_url: return_url ?? "https://yourapp.example.com/account",
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { "Content-Type": "application/json" },
  });
});


Create a Checkout Session for a subscription

// supabase/functions/checkout/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.23.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const { price_id, customer_id, success_url, cancel_url, allow_promo = true } = await req.json();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer_id,             // or pass customer_email to auto-create
    line_items: [{ price: price_id, quantity: 1 }],
    allow_promotion_codes: allow_promo,
    success_url: success_url ?? "https://yourapp.example.com/billing?state=success",
    cancel_url: cancel_url ?? "https://yourapp.example.com/billing?state=cancel",
    // optional: automatic_tax: { enabled: true },
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { "Content-Type": "application/json" },
  });
});


Webhook handler (keep your DB in sync)

// supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.23.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  // Pseudocode: update your DB based on event type
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      // s.customer, s.subscription
      // Link subscription to your user in DB
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      // Update: plan (price id), status, current_period_end, cancel_at_period_end
      break;
    }
    case "invoice.payment_failed": {
      // Mark past_due or notify user
      break;
    }
  }

  return new Response("OK");
});

Frontend: two buttons you need

“Manage billing” → POST to /functions/v1/portal and redirect to returned session.url.

“Upgrade/Downgrade” (or “Subscribe”) → POST to /functions/v1/checkout for the target price_id.

Common debugging gotchas (quick checks)

Test vs Live mode mismatch: Customers/prices/webhook secrets must all be in the same mode.

Customer mismatch: You’re creating a subscription for one customer but generating a portal session for another (or none). Always store and reuse the same stripe_customer_id.

Portal not configured: In Dashboard, Customer Portal features/return URL not enabled → you’ll get odd redirects or missing options.

Missing webhooks: Your UI says “active” but your DB still shows “trialing/canceled” because you never processed customer.subscription.updated.

Price inactive / wrong currency: Checkout won’t render or errors out.

Local timestamps: Use current_period_end (seconds) from Stripe; convert to your timezone for display, don’t guess.

AU GST: If you must collect GST, either enable Stripe Tax or attach a 10% Tax Rate to the price/invoice; otherwise totals may look “wrong”.

Promotion codes: If enabling in Checkout, you also need a valid coupon/promo configured.