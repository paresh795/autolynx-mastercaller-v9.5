import { NextRequest, NextResponse } from 'next/server'
import { withAuth, User } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-server'

async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  user: User
) {
  try {
    // In Next.js 15, params is a Promise that must be awaited
    const { id: callId } = await params

    if (!callId) {
      return NextResponse.json(
        { error: 'Call ID is required' },
        { status: 400 }
      )
    }

    console.log('Fetching call details for:', callId)

    // Fetch call details with all related data
    const { data: callDetail, error: callError } = await supabaseAdmin
      .from('calls')
      .select(`
        id,
        campaign_id,
        contact_id,
        status,
        provider_call_id,
        started_at,
        ended_at,
        ended_reason,
        cost_usd,
        recording_url,
        transcript_json,
        last_status_at,
        contacts (
          id,
          name,
          business_name,
          phone
        ),
        campaigns (
          id,
          name
        )
      `)
      .eq('id', callId)
      .single()

    if (callError || !callDetail) {
      console.error('Call fetch error:', callError)
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      )
    }

    // Fetch call events for this call
    const { data: callEvents, error: eventsError } = await supabaseAdmin
      .from('call_events')
      .select(`
        id,
        call_id,
        status,
        payload,
        created_at
      `)
      .eq('call_id', callId)
      .order('created_at', { ascending: true })

    if (eventsError) {
      console.error('Call events fetch error:', eventsError)
      // Don't fail the request, just return empty events
    }

    // Format the response
    const response = {
      id: callDetail.id,
      status: callDetail.status,
      provider_call_id: callDetail.provider_call_id,
      started_at: callDetail.started_at,
      ended_at: callDetail.ended_at,
      ended_reason: callDetail.ended_reason,
      cost_usd: callDetail.cost_usd,
      recording_url: callDetail.recording_url,
      transcript_json: callDetail.transcript_json,
      last_status_at: callDetail.last_status_at,
      contact: callDetail.contacts,
      campaign: callDetail.campaigns,
      call_events: callEvents || []
    }

    return NextResponse.json(response)

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Call details fetch error:', errorMessage)
    
    return NextResponse.json(
      { error: 'Failed to fetch call details' },
      { status: 500 }
    )
  }
}

// Export with auth wrapper
const authGetHandler = withAuth(GET)
export { authGetHandler as GET }