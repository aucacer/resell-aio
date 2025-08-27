import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// PUBLIC WEBHOOK - No authentication required for Stripe webhooks
Deno.serve(async (req: Request) => {
  console.log('=== STRIPE WEBHOOK PUBLIC ENDPOINT ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  if (req.method !== 'POST') {
    console.log('Invalid method, returning 405');
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    // Initialize Stripe
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY is missing');
      return new Response('Stripe configuration error', { status: 500, headers: corsHeaders });
    }
    
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Initialize Supabase with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase configuration missing');
      return new Response('Database configuration error', { status: 500, headers: corsHeaders });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get webhook signature and body
    const signature = req.headers.get('stripe-signature');
    const body = await req.text();
    
    console.log('Webhook signature present:', !!signature);
    console.log('Body length:', body.length);
    
    if (!signature) {
      console.log('Missing stripe-signature header');
      return new Response('Missing stripe-signature header', { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Get webhook secret
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.log('Missing STRIPE_WEBHOOK_SECRET environment variable');
      return new Response('Webhook secret not configured', { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    // Verify the webhook signature - FIXED: Use async version
    let event: Stripe.Event;
    try {
      // Use constructEventAsync instead of constructEvent for Edge Runtime
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      console.log('✅ Webhook signature verified successfully');
      console.log('Event type:', event.type);
      console.log('Event ID:', event.id);
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return new Response(`Webhook signature verification failed: ${err.message}`, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Process the event
    switch (event.type) {
      case 'checkout.session.completed': {
        console.log('🎉 Processing checkout.session.completed event');
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log('Session details:', {
          id: session.id,
          customer: session.customer,
          subscription: session.subscription,
          client_reference_id: session.client_reference_id,
          mode: session.mode,
          metadata: session.metadata
        });
        
        if (session.mode === 'subscription' && session.subscription) {
          // Get subscription details from Stripe
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          console.log('Retrieved subscription:', {
            id: subscription.id,
            status: subscription.status,
            priceId: subscription.items.data[0]?.price?.id
          });
          
          // Find user ID - try client_reference_id first
          let userId = session.client_reference_id;
          
          if (!userId && session.metadata?.supabase_user_id) {
            userId = session.metadata.supabase_user_id;
            console.log('Found user ID from session metadata:', userId);
          }
          
          if (!userId && subscription.metadata?.supabase_user_id) {
            userId = subscription.metadata.supabase_user_id;
            console.log('Found user ID from subscription metadata:', userId);
          }
          
          if (!userId) {
            console.error('❌ No user ID found in session');
            return new Response('Unable to identify user', { 
              status: 400, 
              headers: corsHeaders 
            });
          }
          
          console.log('👤 Processing subscription for user:', userId);
          
          // Determine plan based on price ID
          const priceId = subscription.items.data[0]?.price?.id;
          let planId = 'free_trial';
          
          if (priceId === 'price_1RzzspIfYnJuIHc1TM5uQtwC') {
            planId = 'pro_monthly';
            console.log('✅ Identified as pro_monthly plan');
          } else {
            console.log('⚠️ Unknown price ID:', priceId, '- defaulting to free_trial');
          }
          
          // Update user subscription in database
          const { data, error } = await supabase
            .from('user_subscriptions')
            .update({
              plan_id: planId,
              status: subscription.status,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
              trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .select();
          
          if (error) {
            console.error('❌ Database update error:', error);
            return new Response(`Database error: ${error.message}`, { 
              status: 500, 
              headers: corsHeaders 
            });
          }
          
          console.log('✅ Database updated successfully:', data);
        } else {
          console.log('⚠️ Skipping: not a subscription checkout');
        }
        break;
      }
      
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        console.log(`📝 Processing ${event.type} event`);
        const subscription = event.data.object as Stripe.Subscription;
        
        // Find user by subscription ID
        const { data: userSub, error } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscription.id)
          .single();
          
        if (error || !userSub?.user_id) {
          console.log('⚠️ User not found for subscription:', subscription.id);
          break;
        }
        
        const userId = userSub.user_id;
        console.log('👤 Found user:', userId);
        
        // Determine plan and status
        let planId = 'free_trial';
        if (subscription.status === 'active') {
          const priceId = subscription.items.data[0]?.price?.id;
          if (priceId === 'price_1RzzspIfYnJuIHc1TM5uQtwC') {
            planId = 'pro_monthly';
          }
        }
        
        // Update database
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            plan_id: planId,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);
          
        if (updateError) {
          console.error('❌ Database update error:', updateError);
          return new Response(`Database error: ${updateError.message}`, { 
            status: 500, 
            headers: corsHeaders 
          });
        }
        
        console.log('✅ Subscription updated for user:', userId);
        break;
      }
      
      default:
        console.log('ℹ️ Unhandled event type:', event.type);
    }

    console.log('✅ Webhook processing completed successfully');
    return new Response('OK', { 
      status: 200, 
      headers: corsHeaders 
    });
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return new Response(`Webhook error: ${error.message}`, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});