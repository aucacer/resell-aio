import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { 
          persistSession: false,
          detectSessionInUrl: false,
          autoRefreshToken: false 
        },
      }
    )

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data } = await supabaseClient.auth.getUser(token)
    const user = data.user

    if (!user) {
      throw new Error('Unauthorized')
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    const { price_id, success_url, cancel_url } = await req.json()

    console.log('🛒 Creating checkout session with URLs:', {
      success_url,
      cancel_url,
      fallback_site_url: Deno.env.get('SITE_URL')
    })

    if (!price_id) {
      throw new Error('Missing required field: price_id')
    }

    // Check if user already has a Stripe customer
    let { data: existingSubscription } = await supabaseClient
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    let customer_id = existingSubscription?.stripe_customer_id

    // Create Stripe customer if doesn't exist
    if (!customer_id) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      })
      customer_id = customer.id

      // Update or create user subscription with customer ID
      if (existingSubscription) {
        await supabaseClient
          .from('user_subscriptions')
          .update({ stripe_customer_id: customer_id })
          .eq('user_id', user.id)
      } else {
        // Create subscription record if it doesn't exist
        await supabaseClient
          .from('user_subscriptions')
          .insert({
            user_id: user.id,
            stripe_customer_id: customer_id,
            plan_id: 'free_trial',
            status: 'trialing'
          })
      }
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer_id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: success_url || `${Deno.env.get('SITE_URL')}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${Deno.env.get('SITE_URL')}/pricing`,
      metadata: {
        supabase_user_id: user.id,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
        },
      },
      allow_promotion_codes: true,
    })

    return new Response(
      JSON.stringify({
        checkout_url: session.url,
        session_id: session.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})