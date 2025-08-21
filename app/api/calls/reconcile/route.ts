import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { vapiClient } from '@/lib/vapi-client'

// Batch reconcile call statuses with Vapi
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting call status reconciliation...')

    // Find calls that might be stale (RINGING/IN_PROGRESS for more than 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    const { data: staleCalls, error: staleError } = await supabaseAdmin
      .from('calls')
      .select(`
        id,
        provider_call_id,
        status,
        last_status_at,
        contacts (name, phone)
      `)
      .in('status', ['RINGING', 'IN_PROGRESS'])
      .not('provider_call_id', 'is', null)
      .lt('last_status_at', fiveMinutesAgo)
      .limit(20) // Process in batches

    if (staleError) {
      console.error('Error fetching stale calls:', staleError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!staleCalls || staleCalls.length === 0) {
      console.log('✅ No stale calls found')
      return NextResponse.json({
        success: true,
        message: 'No calls to reconcile',
        callsProcessed: 0
      })
    }

    console.log(`Found ${staleCalls.length} potentially stale calls`)

    let reconciledCount = 0
    let errorCount = 0

    // Check each call with Vapi
    for (const call of staleCalls) {
      try {
        console.log(`Checking call ${call.provider_call_id} for ${call.contacts?.name}`)
        
        // Get current status from Vapi
        const vapiCall = await vapiClient.getCall(call.provider_call_id!)
        
        if (vapiCall && vapiCall.status) {
          const newStatus = mapVapiStatusToDbStatus(vapiCall.status)
          
          if (newStatus !== call.status) {
            console.log(`Updating call ${call.id}: ${call.status} → ${newStatus}`)
            
            // Update our database
            const updateData: any = {
              status: newStatus,
              last_status_at: new Date().toISOString()
            }

            // If call ended, update additional fields
            if (newStatus === 'ENDED' && vapiCall.endedAt) {
              updateData.ended_at = vapiCall.endedAt
              updateData.ended_reason = vapiCall.endedReason || 'completed'
              
              if (vapiCall.cost !== undefined) {
                updateData.cost_usd = vapiCall.cost
              }
              
              if (vapiCall.recordingUrl) {
                updateData.recording_url = vapiCall.recordingUrl
              }
              
              if (vapiCall.transcript) {
                updateData.transcript_json = vapiCall.transcript
              }
            }

            await supabaseAdmin
              .from('calls')
              .update(updateData)
              .eq('id', call.id)

            // Log reconciliation event
            await supabaseAdmin
              .from('call_events')
              .insert({
                call_id: call.id,
                status: newStatus,
                payload: {
                  event_type: 'reconciliation',
                  previous_status: call.status,
                  vapi_response: vapiCall,
                  reconciled_at: new Date().toISOString(),
                  source: 'batch_reconciliation'
                }
              })

            reconciledCount++
          } else {
            console.log(`Call ${call.id} status unchanged: ${call.status}`)
          }
        }
        
      } catch (callError) {
        console.error(`Error checking call ${call.provider_call_id}:`, callError)
        errorCount++
      }
    }

    // Check for completed campaigns
    await checkCampaignCompletion()

    console.log(`Reconciliation complete: ${reconciledCount} updated, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      message: 'Call reconciliation completed',
      callsProcessed: staleCalls.length,
      callsUpdated: reconciledCount,
      errors: errorCount
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Reconciliation error:', errorMessage)
    
    return NextResponse.json(
      { error: 'Reconciliation failed' },
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
    'canceled': 'CANCELED'
  }
  return statusMap[vapiStatus] || 'FAILED'
}

// Check if any campaigns should be marked as completed
async function checkCampaignCompletion() {
  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('id')
    .not('started_at', 'is', null)
    .is('completed_at', null)

  if (campaigns) {
    for (const campaign of campaigns) {
      const { data: activeCalls } = await supabaseAdmin
        .from('calls')
        .select('id')
        .eq('campaign_id', campaign.id)
        .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])

      if (!activeCalls || activeCalls.length === 0) {
        await supabaseAdmin
          .from('campaigns')
          .update({ completed_at: new Date().toISOString() })
          .eq('id', campaign.id)

        console.log(`Campaign ${campaign.id} marked as completed`)
      }
    }
  }
}