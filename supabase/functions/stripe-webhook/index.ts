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

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  try {
    const body = await req.text()
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)

    console.log(`Received event: ${event.type}`)

    switch (event.type) {
      case 'checkout.session.completed':
        console.log(`🛒 Processing checkout session completed`)
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break
      
      case 'customer.subscription.created':
        console.log(`➕ Processing subscription created`)
        await handleSubscriptionChange(event.data.object as Stripe.Subscription)
        break
        
      case 'customer.subscription.updated':
        console.log(`🔄 Processing subscription updated`)
        const subscription = event.data.object as Stripe.Subscription
        console.log(`📊 Subscription update details:`, {
          id: subscription.id,
          status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end,
          canceled_at: subscription.canceled_at,
          metadata: subscription.metadata
        })
        await handleSubscriptionChange(subscription)
        break
      
      case 'customer.subscription.deleted':
        console.log(`❌ Processing subscription deleted`)
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      
      case 'invoice.payment_succeeded':
        console.log(`✅ Processing payment succeeded`)
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      
      case 'invoice.payment_failed':
        console.log(`💳 Processing payment failed`)
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      
      default:
        console.log(`⚠️ Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error(`Webhook error: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const supabaseUserId = session.metadata?.supabase_user_id

  if (!supabaseUserId) {
    console.error('No supabase_user_id in session metadata')
    return
  }

  console.log(`Processing checkout session for user: ${supabaseUserId}`)

  // Get the subscription from Stripe
  if (session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
    await updateUserSubscription(supabaseUserId, subscription)
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const supabaseUserId = subscription.metadata?.supabase_user_id

  if (!supabaseUserId) {
    console.error('No supabase_user_id in subscription metadata')
    return
  }

  await updateUserSubscription(supabaseUserId, subscription)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabaseUserId = subscription.metadata?.supabase_user_id

  if (!supabaseUserId) {
    console.error('No supabase_user_id in subscription metadata')
    return
  }

  await updateUserSubscription(supabaseUserId, subscription)
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log(`Payment succeeded for invoice: ${invoice.id}`)
  // Could be used for additional payment tracking
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log(`Payment failed for invoice: ${invoice.id}`)
  // Could be used to send notifications or update subscription status
}

async function updateUserSubscription(supabaseUserId: string, subscription: Stripe.Subscription) {
  try {
    console.log(`🔄 Processing subscription update for user: ${supabaseUserId}`)
    console.log(`📊 Subscription details:`, {
      id: subscription.id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at,
      current_period_end: subscription.current_period_end
    })
    
    // Map Stripe price ID to our plan ID
    const stripePriceId = subscription.items.data[0]?.price.id
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

    const subscriptionData = {
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      plan_id: planId,
      status: subscription.status,
      current_period_start: subscription.current_period_start 
        ? new Date(subscription.current_period_start * 1000).toISOString() 
        : null,
      current_period_end: subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000).toISOString() 
        : null,
      trial_start: subscription.trial_start 
        ? new Date(subscription.trial_start * 1000).toISOString() 
        : null,
      trial_end: subscription.trial_end 
        ? new Date(subscription.trial_end * 1000).toISOString() 
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at 
        ? new Date(subscription.canceled_at * 1000).toISOString() 
        : null,
      metadata: subscription.metadata || {},
      updated_at: new Date().toISOString()
    }

    console.log(`💾 Updating database with:`, {
      user_id: supabaseUserId,
      status: subscriptionData.status,
      cancel_at_period_end: subscriptionData.cancel_at_period_end,
      plan_id: subscriptionData.plan_id
    })

    const { error } = await supabaseClient
      .from('user_subscriptions')
      .upsert(
        {
          user_id: supabaseUserId,
          ...subscriptionData,
        },
        {
          onConflict: 'user_id',
        }
      )

    if (error) {
      console.error('❌ Error updating subscription:', error)
      throw error
    }

    console.log(`✅ Successfully updated subscription for user: ${supabaseUserId}`)
    
    // Verify the update by querying the database
    const { data: updatedSub } = await supabaseClient
      .from('user_subscriptions')
      .select('status, cancel_at_period_end, plan_id')
      .eq('user_id', supabaseUserId)
      .single()
    
    console.log(`🔍 Verification - Database now shows:`, updatedSub)
    
  } catch (error) {
    console.error(`❌ Failed to update subscription: ${error}`)
    throw error
  }
}