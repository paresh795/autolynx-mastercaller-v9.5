import { NextRequest, NextResponse } from 'next/server'
import { withAuth, User } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-server'

async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  user: User
) {
  try {
    // In Next.js 15, params is a Promise that must be awaited
    const { id: campaignId } = await params

    if (!campaignId) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      )
    }

    console.log('Starting campaign:', campaignId)

    // Fetch campaign details
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select(`
        id,
        name,
        mode,
        cap,
        assistant_id,
        phone_number_id,
        started_at,
        completed_at,
        total_contacts,
        assistants (
          id,
          name,
          provider_assistant_id,
          active
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

    // Check if campaign is already completed
    if (campaign.completed_at) {
      return NextResponse.json(
        { error: 'Campaign is already completed' },
        { status: 400 }
      )
    }

    // Check if assistant exists and is active
    // Note: Supabase joins return single objects, not arrays for one-to-one relationships
    if (!campaign.assistants || !campaign.assistants.active) {
      console.error('Assistant check failed:', {
        assistants: campaign.assistants,
        active: campaign.assistants?.active
      })
      return NextResponse.json(
        { error: 'Campaign assistant is not available or inactive' },
        { status: 400 }
      )
    }

    // Check if there are contacts to call
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('campaign_id', campaignId)

    if (contactsError || !contacts || contacts.length === 0) {
      return NextResponse.json(
        { error: 'No contacts found in campaign' },
        { status: 400 }
      )
    }

    // Check current active calls
    const { data: activeCalls, error: activeCallsError } = await supabaseAdmin
      .from('calls')
      .select('id, contact_id, status')
      .eq('campaign_id', campaignId)
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])

    if (activeCallsError) {
      console.error('Active calls fetch error:', activeCallsError)
      return NextResponse.json(
        { error: 'Failed to check active calls' },
        { status: 500 }
      )
    }

    const activeCallCount = activeCalls?.length || 0
    console.log(`Campaign ${campaignId} has ${activeCallCount} active calls`)

    // If campaign not started yet, mark it as started
    let wasStarted = !!campaign.started_at
    if (!campaign.started_at) {
      const { error: startError } = await supabaseAdmin
        .from('campaigns')
        .update({
          started_at: new Date().toISOString()
        })
        .eq('id', campaignId)

      if (startError) {
        console.error('Failed to mark campaign as started:', startError)
        return NextResponse.json(
          { error: 'Failed to start campaign' },
          { status: 500 }
        )
      }
      wasStarted = false
      console.log('Campaign marked as started')
    }

    // Get all contacts for this campaign
    const { data: allCampaignContacts, error: contactsQueryError } = await supabaseAdmin
      .from('contacts')
      .select('id, name, business_name, phone')
      .eq('campaign_id', campaignId)

    if (contactsQueryError) {
      console.error('Failed to fetch campaign contacts:', contactsQueryError)
      return NextResponse.json(
        { error: 'Failed to fetch campaign contacts' },
        { status: 500 }
      )
    }

    // Filter out contacts that already have calls (simple approach)
    const contactsWithCalls = new Set(activeCalls?.map(call => call.contact_id) || [])
    const contactsToCall = (allCampaignContacts || [])
      .filter(contact => !contactsWithCalls.has(contact.id))
    // FIXED: Create call records for ALL remaining contacts, not just first batch

    console.log(`Found ${contactsToCall.length} contacts to call (creating call records for ALL contacts)`)

    if (contactsToCall.length === 0) {
      return NextResponse.json({
        success: true,
        message: wasStarted 
          ? 'Campaign already running - no additional contacts to call'
          : 'Campaign started but no contacts available to call',
        campaignId,
        activeCallCount,
        status: 'running',
        contactsQueued: 0
      })
    }

    // Create call records for contacts (they will be processed by scheduler)
    const callInserts = contactsToCall.map(contact => ({
      campaign_id: campaignId,
      contact_id: contact.id,
      status: 'QUEUED' as const,
      last_status_at: new Date().toISOString()
    }))

    const { data: newCalls, error: callsError } = await supabaseAdmin
      .from('calls')
      .insert(callInserts)
      .select('id, contact_id')

    if (callsError) {
      console.error('Failed to create call records:', callsError)
      return NextResponse.json(
        { error: 'Failed to queue calls' },
        { status: 500 }
      )
    }

    console.log(`Queued ${newCalls?.length || 0} calls for campaign ${campaignId}`)

    // Auto-trigger scheduler to immediately process the queued calls
    if ((newCalls?.length || 0) > 0) {
      console.log('🔄 Auto-triggering scheduler to process queued calls...')
      try {
        // Trigger scheduler in background (don't wait for response)
        fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/scheduler/tick`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': process.env.CRON_SHARED_SECRET || ''
          },
          body: JSON.stringify({
            campaignId: campaignId
          })
        }).catch(error => {
          console.warn('Failed to auto-trigger scheduler:', error.message)
        })
      } catch (error) {
        console.warn('Failed to auto-trigger scheduler:', error)
      }
    }

    return NextResponse.json({
      success: true,
      message: wasStarted ? 'Campaign resumed' : 'Campaign started',
      campaignId,
      activeCallCount,
      contactsQueued: newCalls?.length || 0,
      totalContacts: contacts.length,
      status: 'running',
      campaign: {
        id: campaign.id,
        name: campaign.name,
        mode: campaign.mode,
        cap: campaign.cap
      }
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Campaign start error:', errorMessage)
    
    return NextResponse.json(
      { error: 'Failed to start campaign' },
      { status: 500 }
    )
  }
}

// Export with auth wrapper
const authPostHandler = withAuth(POST)
export { authPostHandler as POST }