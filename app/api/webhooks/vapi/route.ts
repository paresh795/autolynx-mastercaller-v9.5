import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import crypto from 'crypto'

// Vapi webhook event types
interface VapiWebhookEvent {
  type: 'call.started' | 'call.ended' | 'call.status-changed' | 'transcript.partial' | 'transcript.final'
  call: {
    id: string
    status: 'queued' | 'ringing' | 'in-progress' | 'ended' | 'failed' | 'canceled'
    phoneNumber: string
    assistantId: string
    startedAt?: string
    endedAt?: string
    cost?: number
    transcript?: any
    recordingUrl?: string
    customer?: {
      name?: string
    }
    metadata?: Record<string, any>
  }
  timestamp: string
  data?: any
}

// Map Vapi status to our database enum
function mapVapiStatusToDbStatus(vapiStatus: string): string {
  const statusMap: Record<string, string> = {
    'queued': 'QUEUED',
    'ringing': 'RINGING',
    'in-progress': 'IN_PROGRESS',
    'ended': 'ENDED',
    'failed': 'FAILED',
    'canceled': 'CANCELED'
  }
  return statusMap[vapiStatus] || 'FAILED'
}

// Verify webhook signature
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex')
    
    const providedSignature = signature.replace('sha256=', '')
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    )
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get webhook secret from environment
    const webhookSecret = process.env.WEBHOOK_SHARED_SECRET
    if (!webhookSecret) {
      console.error('WEBHOOK_SHARED_SECRET not configured')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    // Get raw body and signature
    const body = await request.text()
    const signature = request.headers.get('x-vapi-signature') || 
                     request.headers.get('x-webhook-signature') ||
                     ''

    console.log('Received Vapi webhook:', {
      signature: signature ? `${signature.substring(0, 20)}...` : 'missing',
      bodyLength: body.length
    })

    // Verify signature (skip in development if no signature)
    if (signature && !verifyWebhookSignature(body, signature, webhookSecret)) {
      console.error('Webhook signature verification failed')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Parse webhook event
    let event: VapiWebhookEvent
    try {
      event = JSON.parse(body)
    } catch (parseError) {
      console.error('Failed to parse webhook body:', parseError)
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    console.log('Processing Vapi webhook event:', {
      type: event.type,
      callId: event.call?.id,
      status: event.call?.status,
      timestamp: event.timestamp
    })

    // Find the call record by provider_call_id
    const { data: callRecord, error: callError } = await supabaseAdmin
      .from('calls')
      .select(`
        id,
        campaign_id,
        contact_id,
        status,
        provider_call_id,
        contacts (
          id,
          name,
          phone
        ),
        campaigns (
          id,
          name
        )
      `)
      .eq('provider_call_id', event.call.id)
      .single()

    if (callError || !callRecord) {
      console.error('Call record not found for provider ID:', event.call.id)
      return NextResponse.json(
        { error: 'Call record not found' },
        { status: 404 }
      )
    }

    console.log('Found call record:', {
      id: callRecord.id,
      campaignId: callRecord.campaign_id,
      contactName: callRecord.contacts?.name
    })

    // Process different event types
    const dbStatus = mapVapiStatusToDbStatus(event.call.status)
    const now = new Date().toISOString()
    
    // Update call record based on event
    const updateData: any = {
      status: dbStatus,
      last_status_at: now
    }

    // Handle specific event types
    switch (event.type) {
      case 'call.started':
        updateData.started_at = event.call.startedAt || now
        break
        
      case 'call.ended':
        updateData.ended_at = event.call.endedAt || now
        updateData.ended_reason = 'completed'
        
        if (event.call.cost !== undefined) {
          updateData.cost_usd = event.call.cost
        }
        
        if (event.call.recordingUrl) {
          updateData.recording_url = event.call.recordingUrl
        }
        
        if (event.call.transcript) {
          updateData.transcript_json = event.call.transcript
        }
        break
        
      case 'call.status-changed':
        // Just update status and timestamp
        break
        
      case 'transcript.final':
        if (event.data) {
          updateData.transcript_json = event.data
        }
        break
        
      default:
        console.log('Unhandled event type:', event.type)
    }

    // Update call record
    const { error: updateError } = await supabaseAdmin
      .from('calls')
      .update(updateData)
      .eq('id', callRecord.id)

    if (updateError) {
      console.error('Failed to update call record:', updateError)
      return NextResponse.json(
        { error: 'Failed to update call record' },
        { status: 500 }
      )
    }

    // Log event in call_events table (immutable audit trail)
    await supabaseAdmin
      .from('call_events')
      .insert({
        call_id: callRecord.id,
        status: dbStatus,
        payload: {
          event_type: event.type,
          vapi_call_id: event.call.id,
          vapi_status: event.call.status,
          timestamp: event.timestamp,
          event_data: event,
          processed_at: now
        }
      })

    console.log('Call updated successfully:', {
      callId: callRecord.id,
      newStatus: dbStatus,
      eventType: event.type
    })

    // Check if campaign should be marked as completed
    if (dbStatus === 'ENDED' || dbStatus === 'FAILED' || dbStatus === 'CANCELED') {
      // Check if all calls in campaign are complete
      const { data: activeCalls } = await supabaseAdmin
        .from('calls')
        .select('id')
        .eq('campaign_id', callRecord.campaign_id)
        .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])

      if (!activeCalls || activeCalls.length === 0) {
        // Mark campaign as completed
        await supabaseAdmin
          .from('campaigns')
          .update({
            completed_at: now
          })
          .eq('id', callRecord.campaign_id)
          .is('completed_at', null)

        console.log('Campaign marked as completed:', callRecord.campaign_id)
      }
    }

    return NextResponse.json({
      success: true,
      callId: callRecord.id,
      status: dbStatus,
      eventType: event.type
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Webhook processing error:', errorMessage)
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    service: 'vapi-webhook',
    status: 'healthy',
    timestamp: new Date().toISOString()
  })
}