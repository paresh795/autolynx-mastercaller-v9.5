import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { vapiClient } from '@/lib/vapi-client'

// Production-ready polling system for call status updates
// This mirrors your n8n workflow but runs automatically
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Polling call statuses...')

    // Find active calls that need status checking
    const { data: activeCalls, error: callsError } = await supabaseAdmin
      .from('calls')
      .select(`
        id,
        provider_call_id,
        status,
        last_status_at,
        campaign_id,
        contacts (name, phone)
      `)
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])
      .not('provider_call_id', 'is', null)
      .order('last_status_at', { ascending: true })
      .limit(50) // Process in batches for performance

    if (callsError) {
      console.error('Error fetching active calls:', callsError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!activeCalls || activeCalls.length === 0) {
      console.log('✅ No active calls to poll')
      return NextResponse.json({
        success: true,
        message: 'No active calls',
        callsPolled: 0
      })
    }

    console.log(`Polling ${activeCalls.length} active calls...`)

    let updatedCount = 0
    let completedCalls = []

    // Poll each active call
    for (const call of activeCalls) {
      try {
        console.log(`Polling call ${call.provider_call_id} (${call.contacts?.name})`)
        
        // Get current status from Vapi (same as your n8n workflow)
        const vapiCall = await vapiClient.getCall(call.provider_call_id!)
        
        if (vapiCall && vapiCall.status) {
          const newStatus = mapVapiStatusToDbStatus(vapiCall.status)
          const now = new Date().toISOString()
          
          // Only update if status changed
          if (newStatus !== call.status) {
            console.log(`📞 Status update: ${call.contacts?.name} ${call.status} → ${newStatus}`)
            
            const updateData: any = {
              status: newStatus,
              last_status_at: now
            }

            // Handle call completion (same as your n8n workflow)
            if (['ended', 'failed', 'canceled'].includes(vapiCall.status.toLowerCase())) {
              updateData.ended_at = vapiCall.endedAt || now
              updateData.ended_reason = getEndReason(vapiCall.status, vapiCall.endedReason)
              
              if (vapiCall.cost !== undefined) {
                updateData.cost_usd = vapiCall.cost
              }
              
              if (vapiCall.recordingUrl) {
                updateData.recording_url = vapiCall.recordingUrl
              }
              
              if (vapiCall.transcript) {
                updateData.transcript_json = vapiCall.transcript
              }

              completedCalls.push({
                id: call.id,
                campaignId: call.campaign_id,
                contactName: call.contacts?.name,
                status: newStatus
              })
            }

            // Update database
            await supabaseAdmin
              .from('calls')
              .update(updateData)
              .eq('id', call.id)

            // Log polling event
            await supabaseAdmin
              .from('call_events')
              .insert({
                call_id: call.id,
                status: newStatus,
                payload: {
                  event_type: 'status_poll',
                  previous_status: call.status,
                  vapi_response: vapiCall,
                  polled_at: now,
                  source: 'automatic_polling'
                }
              })

            updatedCount++
          } else {
            // Update last_status_at even if no change (keep polling fresh)
            await supabaseAdmin
              .from('calls')
              .update({ last_status_at: now })
              .eq('id', call.id)
          }
        }
        
      } catch (callError) {
        console.error(`Error polling call ${call.provider_call_id}:`, callError)
        
        // Mark as timeout if polling fails repeatedly (10+ minutes)
        const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
        if (call.last_status_at < staleTime) {
          console.log(`⏰ Timing out stale call ${call.provider_call_id}`)
          
          await supabaseAdmin
            .from('calls')
            .update({
              status: 'TIMEOUT',
              ended_at: new Date().toISOString(),
              ended_reason: 'Polling timeout - no response from provider',
              last_status_at: new Date().toISOString()
            })
            .eq('id', call.id)
        }
      }
    }

    // Check for completed campaigns
    const completedCampaigns = await checkAndCompleteCampaigns(completedCalls)

    console.log(`Polling complete: ${updatedCount} calls updated, ${completedCampaigns.length} campaigns completed`)

    return NextResponse.json({
      success: true,
      message: 'Call status polling completed',
      callsPolled: activeCalls.length,
      callsUpdated: updatedCount,
      campaignsCompleted: completedCampaigns.length,
      completedCalls: completedCalls.map(c => ({
        contactName: c.contactName,
        status: c.status
      }))
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Polling error:', errorMessage)
    
    return NextResponse.json(
      { error: 'Polling failed' },
      { status: 500 }
    )
  }
}

// Map Vapi status to our database enum
function mapVapiStatusToDbStatus(vapiStatus: string): string {
  const statusMap: Record<string, string> = {
    'queued': 'QUEUED',
    'ringing': 'RINGING',
    'in-progress': 'IN_PROGRESS',
    'ended': 'ENDED',
    'failed': 'FAILED',
    'canceled': 'CANCELED',
    'no-answer': 'NO_ANSWER',
    'busy': 'BUSY'
  }
  return statusMap[vapiStatus.toLowerCase()] || 'FAILED'
}

// Get human-readable end reason
function getEndReason(vapiStatus: string, vapiReason?: string): string {
  if (vapiReason) return vapiReason
  
  const reasonMap: Record<string, string> = {
    'ended': 'Call completed successfully',
    'failed': 'Call failed',
    'canceled': 'Call was canceled',
    'no-answer': 'No answer',
    'busy': 'Line busy'
  }
  
  return reasonMap[vapiStatus.toLowerCase()] || 'Call ended'
}

// Check if campaigns should be marked as completed
async function checkAndCompleteCampaigns(completedCalls: any[]): Promise<string[]> {
  const campaignIds = [...new Set(completedCalls.map(c => c.campaignId))]
  const completedCampaigns: string[] = []
  
  for (const campaignId of campaignIds) {
    // Check if all calls in campaign are now terminal
    const { data: activeCalls } = await supabaseAdmin
      .from('calls')
      .select('id')
      .eq('campaign_id', campaignId)
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])

    if (!activeCalls || activeCalls.length === 0) {
      // Mark campaign as completed
      await supabaseAdmin
        .from('campaigns')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', campaignId)
        .is('completed_at', null)

      completedCampaigns.push(campaignId)
      console.log(`🎉 Campaign ${campaignId} completed!`)
    }
  }
  
  return completedCampaigns
}