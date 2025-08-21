import { NextRequest, NextResponse } from 'next/server'
import { withAuth, User } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-server'
import { vapiClient } from '@/lib/vapi-client'

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

    console.log('Stopping campaign:', campaignId)

    // Fetch campaign details
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select('id, name, started_at, completed_at')
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
      return NextResponse.json({
        success: true,
        message: 'Campaign is already completed',
        campaignId,
        status: 'completed'
      })
    }

    // Check if campaign was ever started
    if (!campaign.started_at) {
      return NextResponse.json({
        success: true,
        message: 'Campaign was never started',
        campaignId,
        status: 'created'
      })
    }

    // Get all active calls for this campaign
    const { data: activeCalls, error: activeCallsError } = await supabaseAdmin
      .from('calls')
      .select('id, provider_call_id, status, contact_id')
      .eq('campaign_id', campaignId)
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])

    if (activeCallsError) {
      console.error('Active calls fetch error:', activeCallsError)
      return NextResponse.json(
        { error: 'Failed to fetch active calls' },
        { status: 500 }
      )
    }

    const activeCallCount = activeCalls?.length || 0
    console.log(`Campaign ${campaignId} has ${activeCallCount} active calls to stop`)

    let stoppedCalls = 0
    let failedStops = 0

    // Stop each active call
    if (activeCalls && activeCalls.length > 0) {
      for (const call of activeCalls) {
        try {
          // If call has a provider ID, try to end it with Vapi
          if (call.provider_call_id) {
            try {
              await vapiClient.endCall(call.provider_call_id)
              console.log(`Ended Vapi call: ${call.provider_call_id}`)
            } catch (vapiError) {
              console.warn(`Failed to end Vapi call ${call.provider_call_id}:`, vapiError)
              // Continue anyway - we'll update our database
            }
          }

          // Update call status in our database
          const { error: updateError } = await supabaseAdmin
            .from('calls')
            .update({
              status: 'CANCELED',
              ended_at: new Date().toISOString(),
              ended_reason: 'Campaign stopped by user',
              last_status_at: new Date().toISOString()
            })
            .eq('id', call.id)

          if (updateError) {
            console.error(`Failed to update call ${call.id}:`, updateError)
            failedStops++
          } else {
            stoppedCalls++

            // Log the stop event
            await supabaseAdmin
              .from('call_events')
              .insert({
                call_id: call.id,
                status: 'CANCELED',
                payload: {
                  reason: 'campaign_stopped',
                  stopped_by: user.email,
                  stopped_at: new Date().toISOString()
                }
              })
          }

        } catch (error) {
          console.error(`Error stopping call ${call.id}:`, error)
          failedStops++
        }
      }
    }

    // Mark campaign as completed
    const { error: completeError } = await supabaseAdmin
      .from('campaigns')
      .update({
        completed_at: new Date().toISOString()
      })
      .eq('id', campaignId)

    if (completeError) {
      console.error('Failed to mark campaign as completed:', completeError)
      return NextResponse.json(
        { error: 'Campaign calls stopped but failed to mark campaign as completed' },
        { status: 500 }
      )
    }

    console.log(`Campaign ${campaignId} stopped. Calls stopped: ${stoppedCalls}, Failed: ${failedStops}`)

    return NextResponse.json({
      success: true,
      message: 'Campaign stopped successfully',
      campaignId,
      status: 'completed',
      callsStopped: stoppedCalls,
      failedStops,
      totalActiveCalls: activeCallCount,
      campaign: {
        id: campaign.id,
        name: campaign.name
      }
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Campaign stop error:', errorMessage)
    
    return NextResponse.json(
      { error: 'Failed to stop campaign' },
      { status: 500 }
    )
  }
}

// Export with auth wrapper
const authPostHandler = withAuth(POST)
export { authPostHandler as POST }