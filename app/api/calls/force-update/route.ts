import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { vapiClient } from '@/lib/vapi-client'

export async function POST(request: NextRequest) {
  try {
    const { campaignId } = await request.json()
    
    console.log('🔄 FORCE UPDATE: Fixing call statuses for campaign', campaignId)
    
    // Get all calls for this campaign - removed delay as it was blocking updates
    let query = supabaseAdmin
      .from('calls')
      .select(`
        id,
        provider_call_id,
        status,
        last_status_at,
        started_at,
        contacts (name, phone)
      `)
      .not('provider_call_id', 'is', null)
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])
    
    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }
    
    const { data: activeCalls, error } = await query.limit(50)
    
    if (error || !activeCalls) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    console.log(`Found ${activeCalls.length} calls to check`)

    const results = []
    
    for (const call of activeCalls) {
      try {
        console.log(`Checking call ${call.provider_call_id} (${call.contacts?.name})`)
        
        // Get fresh status from Vapi
        const vapiCall = await vapiClient.getCall(call.provider_call_id!)
        
        if (!vapiCall) {
          console.log(`❌ Vapi call not found: ${call.provider_call_id}`)
          continue
        }

        console.log(`Vapi status: ${vapiCall.status}`)
        
        // Map Vapi status to our enum
        const newStatus = mapVapiStatusToDbStatus(vapiCall.status)
        
        if (newStatus !== call.status) {
          console.log(`📞 UPDATING: ${call.contacts?.name} ${call.status} → ${newStatus}`)
          
          const updateData: any = {
            status: newStatus,
            last_status_at: new Date().toISOString()
          }

          // If call ended, get all the details
          if (vapiCall.status === 'ended') {
            updateData.ended_at = vapiCall.endedAt || new Date().toISOString()
            updateData.ended_reason = vapiCall.endedReason || 'completed'
            
            if (vapiCall.cost !== undefined) {
              updateData.cost_usd = vapiCall.cost
            }
            
            if (vapiCall.recordingUrl) {
              updateData.recording_url = vapiCall.recordingUrl
            }
            
            if (vapiCall.transcript) {
              // Convert transcript to our expected format
              const formattedTranscript = formatTranscript(vapiCall.transcript, vapiCall.messages)
              updateData.transcript_json = formattedTranscript
            }
          }

          // Update database
          const { error: updateError } = await supabaseAdmin
            .from('calls')
            .update(updateData)
            .eq('id', call.id)

          if (updateError) {
            console.error('Update error:', updateError)
            results.push({
              callId: call.id,
              contactName: call.contacts?.name,
              error: updateError.message
            })
          } else {
            results.push({
              callId: call.id,
              contactName: call.contacts?.name,
              oldStatus: call.status,
              newStatus: newStatus,
              hasTranscript: !!vapiCall.transcript,
              hasRecording: !!vapiCall.recordingUrl,
              cost: vapiCall.cost
            })
          }

          // Log the update event
          await supabaseAdmin
            .from('call_events')
            .insert({
              call_id: call.id,
              status: newStatus,
              payload: {
                event_type: 'force_update',
                previous_status: call.status,
                vapi_response: {
                  status: vapiCall.status,
                  endedAt: vapiCall.endedAt,
                  cost: vapiCall.cost,
                  hasTranscript: !!vapiCall.transcript,
                  hasRecording: !!vapiCall.recordingUrl
                },
                updated_at: new Date().toISOString(),
                source: 'force_update'
              }
            })
        } else {
          results.push({
            callId: call.id,
            contactName: call.contacts?.name,
            status: call.status,
            unchanged: true
          })
        }
        
      } catch (error) {
        console.error(`Error checking call ${call.provider_call_id}:`, error)
        results.push({
          callId: call.id,
          contactName: call.contacts?.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Check if any campaigns should be completed
    if (campaignId) {
      const { data: remainingCalls } = await supabaseAdmin
        .from('calls')
        .select('id')
        .eq('campaign_id', campaignId)
        .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])

      if (!remainingCalls || remainingCalls.length === 0) {
        await supabaseAdmin
          .from('campaigns')
          .update({ completed_at: new Date().toISOString() })
          .eq('id', campaignId)
          .is('completed_at', null)
        
        console.log(`🎉 Campaign ${campaignId} marked as completed!`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Call statuses updated',
      callsChecked: activeCalls.length,
      results: results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Force update error:', error)
    return NextResponse.json({
      error: 'Force update failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Map Vapi status to our database status
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
  return statusMap[vapiStatus?.toLowerCase()] || 'FAILED'
}

// Format transcript for our system
function formatTranscript(transcript: string, messages?: any[]): any {
  if (messages && messages.length > 0) {
    // Convert Vapi messages format to our format
    const formattedMessages = messages
      .filter(msg => msg.role === 'user' || msg.role === 'bot' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role === 'bot' ? 'assistant' : msg.role,
        content: msg.message || msg.content,
        timestamp: msg.time
      }))
    
    return {
      messages: formattedMessages,
      raw_transcript: transcript
    }
  }

  return {
    messages: [],
    raw_transcript: transcript
  }
}