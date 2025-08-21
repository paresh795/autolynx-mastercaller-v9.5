import { NextRequest, NextResponse } from 'next/server'
import { withAuth, User } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-server'
import { vapiClient, VapiClient } from '@/lib/vapi-client'

interface CreateCallRequest {
  campaignId: string
  contactId: string
}

async function POST(
  request: NextRequest,
  context: any,
  user: User
) {
  try {
    const body: CreateCallRequest = await request.json()
    const { campaignId, contactId } = body

    console.log('Creating call for campaign:', campaignId, 'contact:', contactId)

    // Validate input
    if (!campaignId || !contactId) {
      return NextResponse.json(
        { error: 'Campaign ID and Contact ID are required' },
        { status: 400 }
      )
    }

    // Fetch campaign and contact details
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select(`
        id,
        name,
        assistant_id,
        phone_number_id,
        mode,
        cap,
        started_at,
        assistants (
          id,
          name,
          provider_assistant_id
        )
      `)
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      console.error('Campaign fetch error:', campaignError)
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('id, name, business_name, phone, campaign_id')
      .eq('id', contactId)
      .eq('campaign_id', campaignId)
      .single()

    if (contactError || !contact) {
      console.error('Contact fetch error:', contactError)
      return NextResponse.json(
        { error: 'Contact not found or not in this campaign' },
        { status: 404 }
      )
    }

    // Check if there's already an active call for this contact
    const { data: existingCall } = await supabaseAdmin
      .from('calls')
      .select('id, status')
      .eq('contact_id', contactId)
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])
      .single()

    if (existingCall) {
      return NextResponse.json(
        { error: 'Contact already has an active call' },
        { status: 409 }
      )
    }

    // Validate phone number format
    if (!VapiClient.validatePhoneNumber(contact.phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Must be E.164 format (e.g., +1234567890)' },
        { status: 400 }
      )
    }

    // Check campaign concurrency limit
    const { data: activeCalls } = await supabaseAdmin
      .from('calls')
      .select('id')
      .eq('campaign_id', campaignId)
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])

    if (activeCalls && activeCalls.length >= campaign.cap) {
      return NextResponse.json(
        { error: `Campaign at concurrency limit (${campaign.cap} active calls)` },
        { status: 429 }
      )
    }

    // Create call record in database first (before Vapi call)
    const { data: callRecord, error: callError } = await supabaseAdmin
      .from('calls')
      .insert({
        campaign_id: campaignId,
        contact_id: contactId,
        status: 'QUEUED',
        last_status_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (callError || !callRecord) {
      console.error('Call record creation error:', callError)
      return NextResponse.json(
        { error: 'Failed to create call record' },
        { status: 500 }
      )
    }

    console.log('Created call record:', callRecord.id)

    // Prepare call metadata
    const metadata = {
      campaignId,
      contactId,
      callId: callRecord.id,
      businessName: contact.business_name,
      campaignName: campaign.name
    }

    // Create call with Vapi using retry logic
    try {
      const vapiCall = await vapiClient.createCallWithRetry({
        assistantId: campaign.assistants[0].provider_assistant_id,
        phoneNumber: contact.phone,
        customerName: contact.name,
        metadata
      })

      console.log('Vapi call created:', vapiCall.id)

      // Update call record with Vapi call ID and started status
      const { error: updateError } = await supabaseAdmin
        .from('calls')
        .update({
          provider_call_id: vapiCall.id,
          status: 'RINGING',
          started_at: new Date().toISOString(),
          last_status_at: new Date().toISOString()
        })
        .eq('id', callRecord.id)

      if (updateError) {
        console.error('Call record update error:', updateError)
        // Continue anyway - webhook will update status
      }

      // Log call event
      await supabaseAdmin
        .from('call_events')
        .insert({
          call_id: callRecord.id,
          status: 'RINGING',
          payload: {
            provider_call_id: vapiCall.id,
            created_by: 'api',
            vapi_response: vapiCall
          }
        })

      // Mark campaign as started if this is the first call
      if (!campaign.started_at) {
        await supabaseAdmin
          .from('campaigns')
          .update({
            started_at: new Date().toISOString()
          })
          .eq('id', campaignId)

        console.log('Campaign marked as started')
      }

      return NextResponse.json({
        success: true,
        callId: callRecord.id,
        providerCallId: vapiCall.id,
        status: 'RINGING',
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          business_name: contact.business_name
        },
        campaign: {
          id: campaign.id,
          name: campaign.name
        }
      })

    } catch (vapiError) {
      console.error('Vapi call creation failed:', vapiError)

      // Update call record to reflect failure
      await supabaseAdmin
        .from('calls')
        .update({
          status: 'FAILED',
          ended_reason: `Call creation failed: ${vapiError instanceof Error ? vapiError.message : 'Unknown error'}`,
          last_status_at: new Date().toISOString()
        })
        .eq('id', callRecord.id)

      // Log failure event
      await supabaseAdmin
        .from('call_events')
        .insert({
          call_id: callRecord.id,
          status: 'FAILED',
          payload: {
            error: vapiError instanceof Error ? vapiError.message : 'Unknown error',
            created_by: 'api'
          }
        })

      return NextResponse.json(
        { 
          error: 'Failed to create call with provider',
          details: vapiError instanceof Error ? vapiError.message : 'Unknown error'
        },
        { status: 500 }
      )
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Call creation error:', errorMessage)
    
    return NextResponse.json(
      { error: 'Failed to create call' },
      { status: 500 }
    )
  }
}

// Export with auth wrapper
const authPostHandler = withAuth(POST)
export { authPostHandler as POST }