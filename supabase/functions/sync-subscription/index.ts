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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
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
    
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Get user from token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

    if (userError || !user) {
      console.error('Authentication error:', userError)
      throw new Error('Unauthorized - invalid token')
    }

    console.log(`🔄 Syncing subscription for user: ${user.id}`)

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    // Get user's current subscription from database
    const { data: currentSubscription, error: dbError } = await supabaseClient
      .from('user_subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, plan_id, status')
      .eq('user_id', user.id)
      .single()

    if (dbError && dbError.code !== 'PGRST116') {
      console.error('❌ Database error fetching subscription:', {
        code: dbError.code,
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint,
        userId: user.id
      })
      throw new Error('Error fetching subscription from database')
    }

    if (!currentSubscription?.stripe_customer_id) {
      console.log(`❌ No Stripe customer ID found for user ${user.id}. Current subscription:`, currentSubscription)
      
      // Try to find customer by email as fallback
      try {
        console.log(`🔍 Searching for Stripe customer by email: ${user.email}`)
        const customers = await stripe.customers.list({
          email: user.email,
          limit: 1
        })
        
        if (customers.data.length > 0) {
          const customer = customers.data[0]
          console.log(`✅ Found customer by email: ${customer.id}`)
          
          // Update our database with the found customer ID
          await supabaseClient
            .from('user_subscriptions')
            .upsert({
              user_id: user.id,
              stripe_customer_id: customer.id,
              plan_id: 'free_trial',
              status: 'trialing'
            }, { onConflict: 'user_id' })
          
          console.log(`💾 Updated database with found customer ID`)
          
          // Continue with the sync using the found customer
          currentSubscription = {
            stripe_customer_id: customer.id,
            stripe_subscription_id: null,
            plan_id: 'free_trial',
            status: 'trialing'
          }
        } else {
          console.log(`❌ No customer found by email either`)
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'No Stripe customer found for user. User may need to complete checkout first.',
              data: null 
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            },
          )
        }
      } catch (error) {
        console.error('❌ Error searching for customer by email:', error)
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'No Stripe customer found for user',
            data: null 
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        )
      }
    }

    console.log(`📊 Current subscription in DB:`, {
      plan_id: currentSubscription.plan_id,
      status: currentSubscription.status,
      stripe_subscription_id: currentSubscription.stripe_subscription_id
    })

    // Fetch active subscriptions from Stripe for this customer
    const stripeSubscriptions = await stripe.subscriptions.list({
      customer: currentSubscription.stripe_customer_id,
      status: 'all',
      limit: 10,
    })

    console.log(`🔍 Found ${stripeSubscriptions.data.length} subscriptions in Stripe`)

    // Find the most recent active or trialing subscription
    let latestSubscription = null
    for (const sub of stripeSubscriptions.data) {
      console.log(`📝 Subscription ${sub.id}: status=${sub.status}, created=${sub.created}`)
      
      if (['active', 'trialing', 'past_due'].includes(sub.status)) {
        if (!latestSubscription || sub.created > latestSubscription.created) {
          latestSubscription = sub
        }
      }
    }

    if (!latestSubscription) {
      console.log('❌ No active subscription found in Stripe')
      
      // Check if we have a subscription in the database that might be newer than what Stripe API shows
      // This can happen during webhook delays or API sync issues
      if (currentSubscription.stripe_subscription_id) {
        console.log('🔍 Found subscription in DB but not in Stripe API, checking if it\'s recent...')
        
        // Check if the database subscription was created/updated recently (within last 2 minutes)
        const subscriptionAge = Date.now() - new Date(currentSubscription.updated_at || currentSubscription.created_at).getTime()
        const twoMinutesInMs = 2 * 60 * 1000
        
        if (subscriptionAge < twoMinutesInMs) {
          console.log('✅ Database subscription is recent, returning current data while Stripe syncs')
          return new Response(
            JSON.stringify({ 
              success: true, 
              data: {
                plan_id: currentSubscription.plan_id,
                status: currentSubscription.status,
                cancel_at_period_end: currentSubscription.cancel_at_period_end,
                canceled_at: currentSubscription.canceled_at,
                current_period_end: currentSubscription.current_period_end
              },
              message: 'Using recent database subscription data (Stripe API sync pending)' 
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            },
          )
        }
      }
      
      // Only return free trial if the user actually has a free trial plan
      if (currentSubscription.plan_id === 'free_trial') {
        console.log('🎆 User is on free trial, that\'s expected')
        return new Response(
          JSON.stringify({ 
            success: true, 
            data: {
              plan_id: 'free_trial',
              status: 'trialing',
              cancel_at_period_end: false,
              canceled_at: null,
              current_period_end: currentSubscription.current_period_end
            },
            message: 'User is on free trial (no paid subscription found)' 
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        )
      }
      
      // If we have a paid plan in DB but no subscription in Stripe, there might be a sync issue
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `No active subscription found in Stripe for plan ${currentSubscription.plan_id}. This might be a temporary sync issue.`,
          data: {
            plan_id: currentSubscription.plan_id,
            status: 'unknown',
            cancel_at_period_end: false,
            canceled_at: null,
            current_period_end: null
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    console.log(`✅ Latest subscription found: ${latestSubscription.id}`)
    console.log(`📊 Stripe subscription details:`, {
      id: latestSubscription.id,
      status: latestSubscription.status,
      cancel_at_period_end: latestSubscription.cancel_at_period_end,
      canceled_at: latestSubscription.canceled_at,
      current_period_end: latestSubscription.current_period_end
    })

    // Map Stripe price ID to our plan ID
    const stripePriceId = latestSubscription.items.data[0]?.price.id
    let planId = 'free_trial' // default fallback
    
    console.log(`🏷️ Looking up plan for price ID: ${stripePriceId}`)
    
    // Get the plan ID from our database based on Stripe price ID
    const { data: plan } = await supabaseClient
      .from('subscription_plans')
      .select('id')
      .eq('stripe_price_id', stripePriceId)
      .single()
    
    if (plan) {
      planId = plan.id
      console.log(`✅ Found plan: ${planId}`)
    } else {
      console.log(`⚠️ No plan found for price ID: ${stripePriceId}, using default: ${planId}`)
    }

    // Update subscription in database
    const subscriptionData = {
      stripe_subscription_id: latestSubscription.id,
      stripe_customer_id: latestSubscription.customer as string,
      plan_id: planId,
      status: latestSubscription.status,
      current_period_start: latestSubscription.current_period_start 
        ? new Date(latestSubscription.current_period_start * 1000).toISOString() 
        : null,
      current_period_end: latestSubscription.current_period_end 
        ? new Date(latestSubscription.current_period_end * 1000).toISOString() 
        : null,
      trial_start: latestSubscription.trial_start 
        ? new Date(latestSubscription.trial_start * 1000).toISOString() 
        : null,
      trial_end: latestSubscription.trial_end 
        ? new Date(latestSubscription.trial_end * 1000).toISOString() 
        : null,
      cancel_at_period_end: latestSubscription.cancel_at_period_end,
      canceled_at: latestSubscription.canceled_at 
        ? new Date(latestSubscription.canceled_at * 1000).toISOString() 
        : null,
      metadata: latestSubscription.metadata || {},
      updated_at: new Date().toISOString()
    }

    console.log(`💾 Updating database with:`, {
      user_id: user.id,
      plan_id: subscriptionData.plan_id,
      status: subscriptionData.status,
      cancel_at_period_end: subscriptionData.cancel_at_period_end
    })

    const { error: updateError } = await supabaseClient
      .from('user_subscriptions')
      .upsert(
        {
          user_id: user.id,
          ...subscriptionData,
        },
        {
          onConflict: 'user_id',
        }
      )

    if (updateError) {
      console.error('❌ Error updating subscription:', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        userId: user.id,
        subscriptionData: {
          plan_id: subscriptionData.plan_id,
          status: subscriptionData.status,
          stripe_subscription_id: subscriptionData.stripe_subscription_id
        }
      })
      throw updateError
    }

    console.log(`✅ Successfully synced subscription for user: ${user.id}`)
    
    // Return success with updated subscription data
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: {
          plan_id: subscriptionData.plan_id,
          status: subscriptionData.status,
          cancel_at_period_end: subscriptionData.cancel_at_period_end,
          canceled_at: subscriptionData.canceled_at,
          current_period_end: subscriptionData.current_period_end
        },
        message: 'Subscription synced successfully' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error: any) {
    console.error('❌ Sync subscription error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        data: null 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})