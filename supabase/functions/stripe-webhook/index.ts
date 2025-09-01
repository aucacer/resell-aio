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
  let eventId: string | null = null
  let logEventId: string | null = null

  if (!signature) {
    console.error('❌ Missing stripe-signature header')
    return new Response('No signature', { status: 400 })
  }

  if (!webhookSecret) {
    console.error('❌ Missing STRIPE_WEBHOOK_SECRET environment variable')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  console.log('🔐 Webhook secret configured:', webhookSecret.substring(0, 8) + '...')

  try {
    const body = await req.text()
    console.log('🔍 Webhook body length:', body.length)
    console.log('🔍 Webhook signature:', signature.substring(0, 20) + '...')
    
    // Verify webhook signature and construct event
    console.log('🔍 Attempting to verify webhook signature...')
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    eventId = event.id

    console.log(`✅ Webhook signature verified successfully!`)
    console.log(`📨 Received event: ${event.type} (ID: ${event.id})`)

    // Log the event to our payment event log with deduplication
    const { data: logResult } = await supabaseClient.rpc('log_payment_event', {
      p_stripe_event_id: event.id,
      p_event_type: event.type,
      p_event_data: event,
      p_user_id: extractUserIdFromEvent(event)
    })

    logEventId = logResult

    // Check if this event was already processed (deduplication)
    if (logEventId) {
      const { data: existingEvent } = await supabaseClient
        .from('payment_event_log')
        .select('processing_status')
        .eq('event_id', logEventId)
        .single()

      if (existingEvent?.processing_status === 'processed') {
        console.log(`⚠️ Event ${event.id} already processed, skipping`)
        await supabaseClient.rpc('update_event_processing_status', {
          p_event_id: logEventId,
          p_status: 'skipped'
        })
        return new Response(JSON.stringify({ received: true, status: 'skipped' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Process the event with retry logic
    let processingResult = null
    try {
      processingResult = await processWebhookEvent(event)
      
      // Mark event as processed on success
      if (logEventId) {
        await supabaseClient.rpc('update_event_processing_status', {
          p_event_id: logEventId,
          p_status: 'processed'
        })
      }
    } catch (processingError: unknown) {
      const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown error'
      console.error(`❌ Event processing failed: ${errorMessage}`)
      
      // Mark event as failed and log error details
      if (logEventId) {
        await supabaseClient.rpc('update_event_processing_status', {
          p_event_id: logEventId,
          p_status: 'failed',
          p_error_details: {
            message: errorMessage,
            stack: processingError instanceof Error ? processingError.stack : undefined,
            timestamp: new Date().toISOString()
          }
        })
      }
      throw processingError
    }

    return new Response(JSON.stringify({ 
      received: true, 
      eventId: event.id,
      logEventId: logEventId,
      result: processingResult 
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ Webhook error: ${errorMessage}`)
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      type: (error as any)?.type,
      statusCode: (error as any)?.statusCode,
      eventId: eventId,
      logEventId: logEventId
    })
    
    // Return appropriate status based on error type
    const status = (error as any)?.statusCode === 401 ? 401 : (error as any)?.type === 'StripeSignatureVerificationError' ? 400 : 500
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      type: (error as any)?.type || 'unknown',
      timestamp: new Date().toISOString(),
      eventId: eventId,
      logEventId: logEventId
    }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

// Helper function to extract user ID from various Stripe events
function extractUserIdFromEvent(event: Record<string, any>): string | null {
  const obj = event.data.object
  
  // Check metadata on the object first
  if (obj.metadata?.supabase_user_id) {
    return obj.metadata.supabase_user_id
  }
  
  // For invoices, check subscription metadata
  if (obj.subscription?.metadata?.supabase_user_id) {
    return obj.subscription.metadata.supabase_user_id
  }
  
  // For checkout sessions, check metadata
  if (obj.metadata?.supabase_user_id) {
    return obj.metadata.supabase_user_id
  }
  
  return null
}

// Main event processing function with improved error handling
async function processWebhookEvent(event: Record<string, any>) {
  console.log(`📋 Processing event type: ${event.type}`)
  
  switch (event.type) {
    case 'checkout.session.completed':
      console.log(`🛒 Processing checkout session completed`)
      return await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
    
    case 'customer.subscription.created':
      console.log(`➕ Processing subscription created`)
      return await handleSubscriptionChange(event.data.object as Stripe.Subscription)
      
    case 'customer.subscription.updated': {
      console.log(`🔄 Processing subscription updated`)
      const subscription = event.data.object as Stripe.Subscription
      console.log(`📊 Subscription update details:`, {
        id: subscription.id,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        current_period_end: subscription.current_period_end,
        metadata: subscription.metadata,
        customer: subscription.customer
      })
      
      // Check if this is a cancellation event
      if (subscription.cancel_at_period_end) {
        console.log(`🚫 CANCELLATION DETECTED - Subscription ${subscription.id} will be cancelled at period end`)
      }
      
      return await handleSubscriptionChange(subscription)
    }
    
    case 'customer.subscription.deleted':
      console.log(`❌ Processing subscription deleted`)
      return await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
    
    case 'invoice.payment_succeeded':
      console.log(`✅ Processing payment succeeded`)
      return await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
    
    case 'invoice.payment_failed':
      console.log(`💳 Processing payment failed`)
      return await handlePaymentFailed(event.data.object as Stripe.Invoice)
    
    default:
      console.log(`⚠️ Unhandled event type: ${event.type}`)
      return { status: 'unhandled', eventType: event.type }
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const supabaseUserId = session.metadata?.supabase_user_id

  if (!supabaseUserId) {
    console.error('❌ No supabase_user_id in session metadata:', {
      sessionId: session.id,
      metadata: session.metadata,
      customerId: session.customer
    })
    return
  }

  console.log(`📝 Processing checkout session for user: ${supabaseUserId}`)
  console.log(`📊 Session details:`, {
    id: session.id,
    customer: session.customer,
    subscription: session.subscription,
    payment_status: session.payment_status,
    status: session.status
  })

  // Get the subscription from Stripe
  if (session.subscription) {
    try {
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
      console.log(`✅ Retrieved subscription ${subscription.id} for processing`)
      await updateUserSubscription(supabaseUserId, subscription)
    } catch (error: any) {
      console.error(`❌ Error processing subscription for checkout ${session.id}:`, error)
      throw error
    }
  } else {
    console.error(`❌ No subscription found in checkout session ${session.id}`)
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const supabaseUserId = subscription.metadata?.supabase_user_id

  if (!supabaseUserId) {
    console.error('❌ No supabase_user_id in subscription metadata:', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      metadata: subscription.metadata
    })
    
    // Try to find the user ID from the customer record
    try {
      const customer = await stripe.customers.retrieve(subscription.customer as string)
      if (typeof customer === 'object' && 'metadata' in customer && customer.metadata?.supabase_user_id) {
        console.log(`🔄 Found supabase_user_id in customer metadata: ${customer.metadata.supabase_user_id}`)
        await updateUserSubscription(customer.metadata.supabase_user_id, subscription)
        return
      }
    } catch (error) {
      console.error('❌ Error retrieving customer:', error)
    }
    
    console.error('❌ Unable to identify user for subscription update')
    return
  }

  await updateUserSubscription(supabaseUserId, subscription)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabaseUserId = subscription.metadata?.supabase_user_id

  if (!supabaseUserId) {
    console.error('❌ No supabase_user_id in subscription metadata:', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      metadata: subscription.metadata
    })
    
    // Try to find the user ID from the customer record
    try {
      const customer = await stripe.customers.retrieve(subscription.customer as string)
      if (typeof customer === 'object' && 'metadata' in customer && customer.metadata?.supabase_user_id) {
        console.log(`🔄 Found supabase_user_id in customer metadata: ${customer.metadata.supabase_user_id}`)
        await updateUserSubscription(customer.metadata.supabase_user_id, subscription)
        return
      }
    } catch (error) {
      console.error('❌ Error retrieving customer:', error)
    }
    
    console.error('❌ Unable to identify user for subscription deletion')
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
      canceled_at: subscriptionData.canceled_at,
      plan_id: subscriptionData.plan_id,
      current_period_end: subscriptionData.current_period_end
    })
    
    // Special logging for cancellation events
    if (subscriptionData.cancel_at_period_end) {
      console.log(`🚨 IMPORTANT: Saving CANCELLATION data to database:`, {
        cancel_at_period_end: subscriptionData.cancel_at_period_end,
        canceled_at: subscriptionData.canceled_at,
        subscription_id: subscriptionData.stripe_subscription_id
      })
    }

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
    
    // Update enhanced subscription status with sync metadata
    const enhancedStatusData = {
      user_id: supabaseUserId,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      subscription_metadata: {
        ...subscription.metadata,
        last_webhook_event: new Date().toISOString(),
        stripe_price_id: subscription.items.data[0]?.price.id,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at
      },
      last_sync_at: new Date().toISOString(),
      sync_status: 'synced',
      payment_method_status: subscription.default_payment_method ? 'valid' : 'unknown',
      retry_count: 0,
      updated_at: new Date().toISOString()
    }

    console.log(`💎 Updating enhanced subscription status`)
    const { error: enhancedError } = await supabaseClient
      .from('subscription_enhanced_status')
      .upsert(enhancedStatusData, { onConflict: 'user_id' })

    if (enhancedError) {
      console.error('❌ Error updating enhanced subscription status:', enhancedError)
      // Don't throw - this is supplementary data
    } else {
      console.log(`✅ Successfully updated enhanced subscription status`)
    }
    
    // Verify the update by querying the database
    const { data: updatedSub, error: verifyError } = await supabaseClient
      .from('user_subscriptions')
      .select('status, cancel_at_period_end, canceled_at, plan_id, current_period_end')
      .eq('user_id', supabaseUserId)
      .single()
    
    if (verifyError) {
      console.error('❌ Error verifying database update:', verifyError)
    } else {
      console.log(`🔍 Verification - Database now shows:`, updatedSub)
      
      // Special verification for cancellation events
      if (subscriptionData.cancel_at_period_end && !updatedSub?.cancel_at_period_end) {
        console.error('🚨 CRITICAL ERROR: Cancellation data was NOT saved to database!')
        console.error('Expected cancel_at_period_end: true, but database shows:', updatedSub?.cancel_at_period_end)
      } else if (subscriptionData.cancel_at_period_end && updatedSub?.cancel_at_period_end) {
        console.log('✅ SUCCESS: Cancellation data confirmed saved to database')
      }
    }

    // Return success result
    return {
      status: 'success',
      userId: supabaseUserId,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      enhancedStatusUpdated: !enhancedError
    }
    
  } catch (error: unknown) {
    console.error(`❌ Failed to update subscription: ${error}`)
    throw error
  }
}