import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

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

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  try {
    const { userId } = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`🔄 Starting subscription sync for user: ${userId}`)

    // Get current user subscription from database
    const { data: userSubscription, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (subError && subError.code !== 'PGRST116') {
      console.error('❌ Error fetching user subscription:', subError)
      throw new Error(`Failed to fetch subscription: ${subError.message}`)
    }

    let enhancedStatus = null
    let syncResult = 'no_subscription'

    if (userSubscription && userSubscription.stripe_subscription_id) {
      console.log(`📋 Syncing subscription: ${userSubscription.stripe_subscription_id}`)
      
      try {
        // Fetch latest subscription data from Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(
          userSubscription.stripe_subscription_id,
          {
            expand: ['default_payment_method', 'latest_invoice']
          }
        )

        console.log(`✅ Retrieved Stripe subscription:`, {
          id: stripeSubscription.id,
          status: stripeSubscription.status,
          cancel_at_period_end: stripeSubscription.cancel_at_period_end,
          current_period_end: stripeSubscription.current_period_end
        })

        // Determine payment method status
        let paymentMethodStatus = 'valid'
        if (stripeSubscription.latest_invoice && typeof stripeSubscription.latest_invoice === 'object') {
          const invoice = stripeSubscription.latest_invoice as Stripe.Invoice
          if (invoice.payment_intent && typeof invoice.payment_intent === 'object') {
            const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent
            if (paymentIntent.status === 'requires_action') {
              paymentMethodStatus = 'requires_action'
            } else if (paymentIntent.status === 'payment_failed') {
              paymentMethodStatus = 'declined'
            }
          }
        }

        // Update user subscription in database if there are changes
        const hasChanges = 
          userSubscription.status !== stripeSubscription.status ||
          userSubscription.cancel_at_period_end !== stripeSubscription.cancel_at_period_end ||
          userSubscription.canceled_at !== (stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000).toISOString() : null)

        if (hasChanges) {
          console.log(`🔄 Updating subscription in database with changes`)
          
          const { error: updateError } = await supabaseClient
            .from('user_subscriptions')
            .update({
              status: stripeSubscription.status,
              current_period_start: stripeSubscription.current_period_start 
                ? new Date(stripeSubscription.current_period_start * 1000).toISOString() 
                : null,
              current_period_end: stripeSubscription.current_period_end 
                ? new Date(stripeSubscription.current_period_end * 1000).toISOString() 
                : null,
              cancel_at_period_end: stripeSubscription.cancel_at_period_end,
              canceled_at: stripeSubscription.canceled_at 
                ? new Date(stripeSubscription.canceled_at * 1000).toISOString() 
                : null,
              metadata: stripeSubscription.metadata || {},
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)

          if (updateError) {
            console.error('❌ Error updating subscription:', updateError)
            throw new Error(`Failed to update subscription: ${updateError.message}`)
          }

          console.log(`✅ Successfully updated user subscription`)
        }

        // Create or update enhanced subscription status
        enhancedStatus = {
          user_id: userId,
          stripe_subscription_id: stripeSubscription.id,
          subscription_status: stripeSubscription.status,
          subscription_metadata: {
            ...stripeSubscription.metadata,
            stripe_price_id: stripeSubscription.items.data[0]?.price.id,
            cancel_at_period_end: stripeSubscription.cancel_at_period_end,
            canceled_at: stripeSubscription.canceled_at,
            sync_source: 'manual_sync',
            sync_timestamp: new Date().toISOString()
          },
          last_sync_at: new Date().toISOString(),
          sync_status: 'synced',
          payment_method_status: paymentMethodStatus,
          retry_count: 0,
          updated_at: new Date().toISOString()
        }

        const { error: enhancedError } = await supabaseClient
          .from('subscription_enhanced_status')
          .upsert(enhancedStatus, { onConflict: 'user_id' })

        if (enhancedError) {
          console.error('❌ Error updating enhanced status:', enhancedError)
          // Don't throw - this is supplementary data
        } else {
          console.log(`✅ Successfully updated enhanced subscription status`)
        }

        syncResult = hasChanges ? 'updated' : 'synchronized'

      } catch (stripeError: any) {
        console.error('❌ Stripe API error:', stripeError)

        // Update enhanced status with failure
        const failureStatus = {
          user_id: userId,
          stripe_subscription_id: userSubscription.stripe_subscription_id,
          subscription_status: userSubscription.status,
          subscription_metadata: {
            sync_error: stripeError.message,
            sync_source: 'manual_sync_failed',
            sync_timestamp: new Date().toISOString()
          },
          last_sync_at: new Date().toISOString(),
          sync_status: 'failed',
          payment_method_status: 'unknown',
          retry_count: 1, // Increment retry count
          updated_at: new Date().toISOString()
        }

        await supabaseClient
          .from('subscription_enhanced_status')
          .upsert(failureStatus, { onConflict: 'user_id' })

        throw new Error(`Stripe sync failed: ${stripeError.message}`)
      }

    } else {
      console.log(`ℹ️ No active subscription found for user: ${userId}`)
      
      // Create enhanced status record for users without subscriptions
      enhancedStatus = {
        user_id: userId,
        stripe_subscription_id: null,
        subscription_status: 'trialing', // Default for users without subscription
        subscription_metadata: {
          sync_source: 'manual_sync_no_subscription',
          sync_timestamp: new Date().toISOString()
        },
        last_sync_at: new Date().toISOString(),
        sync_status: 'synced',
        payment_method_status: 'valid',
        retry_count: 0,
        updated_at: new Date().toISOString()
      }

      await supabaseClient
        .from('subscription_enhanced_status')
        .upsert(enhancedStatus, { onConflict: 'user_id' })

      syncResult = 'no_active_subscription'
    }

    console.log(`✅ Subscription sync completed successfully for user: ${userId}`)

    return new Response(
      JSON.stringify({
        success: true,
        result: syncResult,
        userId: userId,
        enhancedStatus: enhancedStatus,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error: any) {
    console.error(`❌ Subscription sync error:`, error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})