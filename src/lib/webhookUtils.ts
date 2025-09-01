// Webhook utility functions for processing and managing Stripe webhook events
// This module provides utilities for event logging, retry logic, and deduplication

import { createClient } from '@/integrations/supabase/client'

export interface WebhookEvent {
  event_id: string
  stripe_event_id: string
  event_type: string
  event_data: Record<string, unknown>
  processing_status: 'pending' | 'processed' | 'failed' | 'skipped'
  processed_at?: string
  error_details?: Record<string, unknown>
  retry_count: number
  created_at: string
  updated_at: string
}

export interface WebhookEventResult {
  success: boolean
  eventId?: string
  error?: string
  isDuplicate?: boolean
  processingStatus: 'pending' | 'processed' | 'failed' | 'skipped'
}

// Log a webhook event with deduplication
export async function logWebhookEvent(
  stripeEventId: string,
  eventType: string,
  eventData: Record<string, unknown>,
  userId?: string
): Promise<WebhookEventResult> {
  const supabase = createClient()

  try {
    const { data: eventId, error } = await supabase.rpc('log_payment_event', {
      p_stripe_event_id: stripeEventId,
      p_event_type: eventType,
      p_event_data: eventData,
      p_user_id: userId
    })

    if (error) {
      console.error('Error logging webhook event:', error)
      return {
        success: false,
        error: error.message,
        processingStatus: 'failed'
      }
    }

    // Check if this was a duplicate event
    const { data: existingEvent } = await supabase
      .from('payment_event_log')
      .select('processing_status')
      .eq('stripe_event_id', stripeEventId)
      .single()

    const isDuplicate = existingEvent?.processing_status === 'processed'

    return {
      success: true,
      eventId: eventId,
      isDuplicate,
      processingStatus: existingEvent?.processing_status || 'pending'
    }
  } catch (error: unknown) {
    console.error('Error in logWebhookEvent:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingStatus: 'failed'
    }
  }
}

// Update webhook event processing status
export async function updateWebhookEventStatus(
  eventId: string,
  status: 'pending' | 'processed' | 'failed' | 'skipped',
  errorDetails?: Record<string, unknown>
): Promise<boolean> {
  const supabase = createClient()

  try {
    const { error } = await supabase.rpc('update_event_processing_status', {
      p_event_id: eventId,
      p_status: status,
      p_error_details: errorDetails
    })

    if (error) {
      console.error('Error updating webhook event status:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in updateWebhookEventStatus:', error)
    return false
  }
}

// Get webhook events that need retry processing
export async function getEventsForRetry(
  maxRetryCount: number = 3,
  retryDelayMinutes: number = 5
): Promise<WebhookEvent[]> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase.rpc('get_events_for_retry', {
      max_retry_count: maxRetryCount,
      retry_delay_minutes: retryDelayMinutes
    })

    if (error) {
      console.error('Error getting events for retry:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error in getEventsForRetry:', error)
    return []
  }
}

// Get webhook event processing statistics
export async function getWebhookEventStats(
  fromDate?: string,
  toDate?: string
): Promise<{
  total: number
  pending: number
  processed: number
  failed: number
  skipped: number
  successRate: number
  failureRate: number
  avgRetryCount: number
}> {
  const supabase = createClient()

  let query = supabase
    .from('payment_event_log')
    .select('processing_status, retry_count')

  if (fromDate) {
    query = query.gte('created_at', fromDate)
  }
  if (toDate) {
    query = query.lte('created_at', toDate)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching webhook event stats:', error)
    return {
      total: 0,
      pending: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
      successRate: 0,
      failureRate: 0,
      avgRetryCount: 0
    }
  }

  const total = data?.length || 0
  const pending = data?.filter(e => e.processing_status === 'pending').length || 0
  const processed = data?.filter(e => e.processing_status === 'processed').length || 0
  const failed = data?.filter(e => e.processing_status === 'failed').length || 0
  const skipped = data?.filter(e => e.processing_status === 'skipped').length || 0
  
  const successRate = total > 0 ? ((processed + skipped) / total) * 100 : 0
  const failureRate = total > 0 ? (failed / total) * 100 : 0
  
  const totalRetries = data?.reduce((sum, e) => sum + (e.retry_count || 0), 0) || 0
  const avgRetryCount = total > 0 ? totalRetries / total : 0

  return {
    total,
    pending,
    processed,
    failed,
    skipped,
    successRate: Math.round(successRate * 100) / 100,
    failureRate: Math.round(failureRate * 100) / 100,
    avgRetryCount: Math.round(avgRetryCount * 100) / 100
  }
}

// Get recent webhook events for a user (for debugging)
export async function getUserRecentWebhookEvents(
  userId: string,
  limit: number = 10
): Promise<WebhookEvent[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('payment_event_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching user webhook events:', error)
    return []
  }

  return data || []
}

// Get webhook events by type (for analysis)
export async function getWebhookEventsByType(
  eventType: string,
  fromDate?: string,
  toDate?: string,
  limit?: number
): Promise<WebhookEvent[]> {
  const supabase = createClient()

  let query = supabase
    .from('payment_event_log')
    .select('*')
    .eq('event_type', eventType)
    .order('created_at', { ascending: false })

  if (fromDate) {
    query = query.gte('created_at', fromDate)
  }
  if (toDate) {
    query = query.lte('created_at', toDate)
  }
  if (limit) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching webhook events by type:', error)
    return []
  }

  return data || []
}

// Validate webhook signature (for additional client-side validation)
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Note: This is a simplified validation. In practice, you'd use
  // the actual Stripe signature verification logic
  // This is mainly for client-side validation of webhook authenticity
  
  if (!payload || !signature || !secret) {
    return false
  }

  // Basic signature format check
  const signatureElements = signature.split(',')
  const timestampElement = signatureElements.find(el => el.startsWith('t='))
  const signatureElement = signatureElements.find(el => el.startsWith('v1='))

  return !!(timestampElement && signatureElement)
}

// Calculate exponential backoff delay for retries
export function calculateRetryDelay(retryCount: number): number {
  // Exponential backoff: 2^retryCount minutes, with max of 60 minutes
  const delayMinutes = Math.min(Math.pow(2, retryCount), 60)
  return delayMinutes * 60 * 1000 // Convert to milliseconds
}

// Check if event is within retry window
export function isEventRetryable(
  lastAttempt: string,
  retryCount: number,
  maxRetries: number = 3
): boolean {
  if (retryCount >= maxRetries) {
    return false
  }

  const lastAttemptTime = new Date(lastAttempt).getTime()
  const now = Date.now()
  const retryDelay = calculateRetryDelay(retryCount)

  return (now - lastAttemptTime) >= retryDelay
}

// Extract user ID from various webhook event types
export function extractUserIdFromWebhookEvent(event: Record<string, unknown>): string | null {
  const obj = event.data?.object || event

  // Check metadata on the object first
  if (obj.metadata?.supabase_user_id) {
    return obj.metadata.supabase_user_id
  }

  // For invoices, check subscription metadata
  if (obj.subscription?.metadata?.supabase_user_id) {
    return obj.subscription.metadata.supabase_user_id
  }

  // For checkout sessions, check metadata
  if (obj.type === 'checkout.session' && obj.metadata?.supabase_user_id) {
    return obj.metadata.supabase_user_id
  }

  return null
}

// Format webhook event for logging (sanitize sensitive data)
export function formatWebhookEventForLogging(event: Record<string, unknown>): Record<string, unknown> {
  const sanitizedEvent = { ...event }

  // Remove sensitive fields that shouldn't be logged
  if (sanitizedEvent.data?.object) {
    const obj = sanitizedEvent.data.object
    
    // Remove payment method details if present
    if (obj.payment_method) {
      obj.payment_method = {
        id: obj.payment_method.id,
        type: obj.payment_method.type,
        // Remove card details, billing details, etc.
      }
    }

    // Remove customer details except ID
    if (obj.customer && typeof obj.customer === 'object') {
      obj.customer = {
        id: obj.customer.id
      }
    }
  }

  return sanitizedEvent
}