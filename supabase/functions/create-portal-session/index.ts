import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  console.log('=== CREATE PORTAL SESSION ENDPOINT ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase configuration');
      throw new Error('Database configuration error');
    }
    
    console.log('✅ Supabase configuration found');
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { 
        persistSession: false,
        detectSessionInUrl: false,
        autoRefreshToken: false 
      },
    });

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('No authorization header found');
      throw new Error('Missing Authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted, length:', token.length);
    
    // Get user from token
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) {
      console.error('User authentication error:', userError);
      throw new Error(`Authentication failed: ${userError.message}`);
    }
    
    const user = userData.user;
    if (!user) {
      console.error('No user found in token');
      throw new Error('Invalid authentication token');
    }

    console.log('✅ User authenticated:', user.id);

    // Initialize Stripe
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY is missing');
      throw new Error('Stripe configuration error');
    }
    
    console.log('✅ Stripe configuration found');
    
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Parse request body
    let requestBody;
    try {
      const bodyText = await req.text();
      console.log('Raw request body:', bodyText);
      requestBody = JSON.parse(bodyText);
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      throw new Error('Invalid JSON in request body');
    }
    
    const { return_url } = requestBody;
    console.log('Return URL:', return_url);

    // Get user's Stripe customer ID with detailed logging
    console.log('🔍 Fetching user subscription data for user:', user.id);
    
    const { data: subscription, error: subscriptionError } = await supabaseClient
      .from('user_subscriptions')
      .select('stripe_customer_id, plan_id, status')
      .eq('user_id', user.id)
      .single();

    console.log('Subscription query result:', { data: subscription, error: subscriptionError });

    if (subscriptionError) {
      console.error('Database error fetching subscription:', subscriptionError);
      
      if (subscriptionError.code === 'PGRST116') {
        // No subscription found - create one
        console.log('⚠️ No subscription found, creating default subscription...');
        
        const { data: newSub, error: createError } = await supabaseClient
          .from('user_subscriptions')
          .insert({
            user_id: user.id,
            plan_id: 'free_trial',
            status: 'active',
            stripe_customer_id: null
          })
          .select()
          .single();
          
        if (createError) {
          console.error('Failed to create subscription:', createError);
          throw new Error(`Database error: ${createError.message}`);
        }
        
        console.log('✅ Created new subscription:', newSub);
        // Continue with no stripe_customer_id to create one below
      } else {
        throw new Error(`Database error: ${subscriptionError.message}`);
      }
    }

    let stripeCustomerId = subscription?.stripe_customer_id;
    console.log('Current Stripe customer ID:', stripeCustomerId);

    // If no Stripe customer ID, create one
    if (!stripeCustomerId) {
      console.log('⚠️ No Stripe customer ID found, creating new customer...');
      
      try {
        // Create Stripe customer
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            supabase_user_id: user.id,
          },
        });
        
        console.log('✅ Created Stripe customer:', customer.id);
        stripeCustomerId = customer.id;
        
        // Update user subscription with new customer ID
        const { error: updateError } = await supabaseClient
          .from('user_subscriptions')
          .update({ 
            stripe_customer_id: stripeCustomerId,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
          
        if (updateError) {
          console.error('Failed to update subscription with customer ID:', updateError);
          // Don't throw - continue with portal creation
        } else {
          console.log('✅ Updated subscription with new customer ID');
        }
        
      } catch (stripeError) {
        console.error('Failed to create Stripe customer:', stripeError);
        throw new Error(`Stripe customer creation failed: ${stripeError.message}`);
      }
    }

    // Verify customer exists in Stripe
    console.log('🔍 Verifying customer exists in Stripe:', stripeCustomerId);
    
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId);
      console.log('✅ Stripe customer verified:', { id: customer.id, email: customer.email });
    } catch (customerError) {
      console.error('Stripe customer verification failed:', customerError);
      throw new Error(`Stripe customer not found: ${customerError.message}`);
    }

    // Create Stripe portal session
    const siteUrl = Deno.env.get('SITE_URL') || 'https://tofckkpzdbcplxkgxcsr.supabase.co';
    const finalReturnUrl = return_url || `${siteUrl}/settings`;
    
    console.log('🚀 Creating portal session with:', {
      customer: stripeCustomerId,
      return_url: finalReturnUrl
    });

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: finalReturnUrl,
      });

      console.log('✅ Portal session created successfully:', portalSession.id);
      console.log('Portal URL:', portalSession.url);

      return new Response(
        JSON.stringify({
          portal_url: portalSession.url,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
      
    } catch (portalError) {
      console.error('Stripe portal session creation failed:', portalError);
      
      // Enhanced error handling for common portal issues
      let errorMessage = 'Failed to create customer portal session';
      
      if (portalError.message?.includes('customer portal is not enabled')) {
        errorMessage = 'The customer portal is not enabled in Stripe. Please contact support to enable this feature.';
      } else if (portalError.message?.includes('configuration error')) {
        errorMessage = 'There is a configuration issue with the payment system. Please contact support.';
      } else if (portalError.message) {
        errorMessage = portalError.message;
      }
      
      throw new Error(errorMessage);
    }

  } catch (error: any) {
    console.error('❌ Portal session error:', error);
    
    // Return detailed error for debugging
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack trace
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});