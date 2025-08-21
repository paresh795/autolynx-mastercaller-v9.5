import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { vapiClient } from '@/lib/vapi-client'

// 🚀 AUTO-TRIGGER SYSTEM: Enhanced rate limiting to prevent race conditions
const lastTriggerTime = new Map<string, number>();
const TRIGGER_COOLDOWN = 15000; // 15 seconds minimum between triggers per campaign (increased for safety)
const activeTriggers = new Set<string>(); // Track campaigns currently being triggered

async function checkAndTriggerScheduler(campaignId: string, updatedCallsCount: number): Promise<void> {
  
  console.log(`🔍 AUTO-TRIGGER CHECK: ${campaignId} - ${updatedCallsCount} calls updated`);
  
  // Skip if no calls were updated (no state changes)
  if (updatedCallsCount === 0) {
    console.log('⏭️  AUTO-TRIGGER SKIP: No calls updated');
    return;
  }

  // Enhanced rate limiting and race condition protection
  const now = Date.now();
  const lastTrigger = lastTriggerTime.get(campaignId) || 0;
  
  // Check if trigger is already running for this campaign
  if (activeTriggers.has(campaignId)) {
    console.log(`🔄 AUTO-TRIGGER ALREADY RUNNING: ${campaignId} - SKIPPING to prevent race condition`);
    return;
  }
  
  if (now - lastTrigger < TRIGGER_COOLDOWN) {
    console.log(`⏰ AUTO-TRIGGER RATE LIMITED: ${campaignId} (${Math.ceil((TRIGGER_COOLDOWN - (now - lastTrigger)) / 1000)}s remaining)`);
    return;
  }
  
  // Mark trigger as active
  activeTriggers.add(campaignId);
  console.log(`🚨 AUTO-TRIGGER STARTING: ${campaignId} - LOCKED to prevent concurrent triggers`);

  try {
    // Get campaign details and current state
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select(`id, name, mode, cap, started_at, completed_at`)
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.log('❌ AUTO-TRIGGER SKIP: Campaign not found or error');
      return; // Campaign not found or error
    }

    // Only trigger for active campaigns (continuous OR batch mode)
    if (!campaign.started_at || campaign.completed_at) {
      console.log(`❌ AUTO-TRIGGER SKIP: Campaign not eligible (started: ${!!campaign.started_at}, completed: ${!!campaign.completed_at}, mode: ${campaign.mode})`);
      return;
    }

    // Skip if not continuous or batch mode
    if (campaign.mode !== 'continuous' && campaign.mode !== 'batch') {
      console.log(`❌ AUTO-TRIGGER SKIP: Unsupported mode (${campaign.mode})`);
      return;
    }

    // Count current active calls  
    const { data: activeCalls } = await supabaseAdmin
      .from('calls')
      .select('id')
      .eq('campaign_id', campaignId)
      .in('status', ['RINGING', 'IN_PROGRESS']);

    const activeCallCount = activeCalls?.length || 0;

    // Check capacity and mode-specific conditions
    console.log(`📊 CAPACITY CHECK: ${activeCallCount} active calls, cap=${campaign.cap}, mode=${campaign.mode}`);
    
    if (campaign.mode === 'continuous') {
      // Continuous mode: trigger when we have available capacity
      if (activeCallCount >= campaign.cap) {
        console.log(`❌ AUTO-TRIGGER SKIP: At capacity (${activeCallCount}/${campaign.cap})`);
        return; // At capacity
      }
      console.log(`✅ CAPACITY AVAILABLE: ${campaign.cap - activeCallCount} slots free`);
      
    } else if (campaign.mode === 'batch') {
      // Batch mode: only trigger when current batch is completely finished (0 active calls)
      if (activeCallCount > 0) {
        console.log(`❌ AUTO-TRIGGER SKIP: Batch mode - waiting for current batch to complete (${activeCallCount} active)`);
        return; // Wait for batch to complete
      }
      console.log(`✅ BATCH COMPLETE: All calls finished, ready for next batch`);
    }

    // Check for unprocessed contacts (contacts without call records OR queued calls without provider_call_id)
    let unprocessedCount = 0;

    try {
      // Try to use database function for accurate count
      const { data: unprocessedData, error: rpcError } = await supabaseAdmin
        .rpc('count_unprocessed_contacts', { campaign_id_param: campaignId });

      if (rpcError) {
        console.log('🔄 FALLBACK: Using manual contact counting');
        
        // Get ALL QUEUED calls without provider_call_id - these are unprocessed
        const { data: unprocessedCalls, error: unprocessedError } = await supabaseAdmin
          .from('calls')
          .select('id, contact_id, status, provider_call_id')
          .eq('campaign_id', campaignId)
          .eq('status', 'QUEUED')
          .is('provider_call_id', null);
        
        if (unprocessedError) {
          console.error('❌ FALLBACK ERROR:', unprocessedError);
          unprocessedCount = 0;
        } else {
          unprocessedCount = unprocessedCalls?.length || 0;
          console.log(`📊 FALLBACK RESULT: Found ${unprocessedCount} unprocessed calls (QUEUED without provider_call_id)`);
          
          // Debug logging
          if (unprocessedCount > 0) {
            console.log('📋 UNPROCESSED CALLS:', unprocessedCalls?.map(c => ({
              id: c.id,
              status: c.status,
              has_provider_id: !!c.provider_call_id
            })));
          }
        }
        
      } else {
        unprocessedCount = unprocessedData || 0;
      }
    } catch (error) {
      console.error('Error counting unprocessed contacts:', error);
      // Fallback to simple queued calls count
      const { data: queuedCalls } = await supabaseAdmin
        .from('calls')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'QUEUED')
        .is('provider_call_id', null);
      
      unprocessedCount = queuedCalls?.length || 0;
    }

    if (unprocessedCount === 0) {
      console.log('❌ AUTO-TRIGGER SKIP: No unprocessed contacts remaining');
      return; // No work remaining
    }

    // All conditions met - trigger scheduler
    const triggerReason = campaign.mode === 'batch' 
      ? `BATCH COMPLETE: 0 active calls, ${unprocessedCount} remaining`
      : `CAPACITY AVAILABLE: ${campaign.cap - activeCallCount} slots, ${unprocessedCount} waiting`;
      
    console.log('🚀 AUTO-TRIGGER: Conditions met for campaign', campaignId, {
      mode: campaign.mode,
      reason: triggerReason,
      activeCallCount,
      cap: campaign.cap,
      unprocessedCount,
      updatedCalls: updatedCallsCount
    });

    // Set rate limit and clear active flag
    lastTriggerTime.set(campaignId, now);

    // Trigger scheduler
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/scheduler/tick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': process.env.CRON_SHARED_SECRET || ''
      },
      body: JSON.stringify({
        campaignId: campaignId,
        triggeredBy: 'auto-trigger-system'
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ AUTO-TRIGGER SUCCESS:', {
        campaignsProcessed: result.campaignsProcessed,
        callsLaunched: result.callsLaunched
      });
    } else {
      console.error('❌ AUTO-TRIGGER FAILED:', response.status, response.statusText);
    }

  } catch (error) {
    console.error('❌ AUTO-TRIGGER ERROR:', error);
  } finally {
    // Always clear the active trigger lock
    activeTriggers.delete(campaignId);
    console.log(`🔓 AUTO-TRIGGER UNLOCKED: ${campaignId} - Available for next trigger`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { campaignId } = await request.json()
    
    console.log('🔄 SIMPLE POLL: Checking call statuses for campaign', campaignId)
    
    // Get all active calls for the campaign
    let query = supabaseAdmin
      .from('calls')
      .select(`
        id,
        provider_call_id,
        status,
        campaign_id,
        contacts (name, phone)
      `)
      .not('provider_call_id', 'is', null)
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])
    
    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }
    
    const { data: activeCalls, error } = await query.limit(20)
    
    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    console.log(`📞 SIMPLE POLL: Found ${activeCalls?.length || 0} active calls`)
    
    const updates = []
    
    if (activeCalls && activeCalls.length > 0) {
      for (const call of activeCalls) {
        try {
          console.log(`🔍 CHECKING: ${call.contacts?.name} (${call.provider_call_id})`)
          
          // Get status from Vapi
          const vapiCall = await vapiClient.getCall(call.provider_call_id!)
          
          if (vapiCall && vapiCall.status) {
            const newStatus = mapVapiStatus(vapiCall.status)
            
            console.log(`📊 VAPI STATUS: ${call.contacts?.name} - Vapi: "${vapiCall.status}" → DB: "${newStatus}" (Current: "${call.status}")`)
            
            if (newStatus !== call.status) {
              console.log(`🔄 STATUS CHANGE: ${call.contacts?.name} ${call.status} → ${newStatus}`)
              
              const updateData: any = {
                status: newStatus,
                last_status_at: new Date().toISOString()
              }
              
              // If call ended, get additional data
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
                  updateData.transcript_json = {
                    raw_transcript: vapiCall.transcript,
                    messages: vapiCall.messages || []
                  }
                }
              }
              
              // Update database
              const { error: updateError } = await supabaseAdmin
                .from('calls')
                .update(updateData)
                .eq('id', call.id)
              
              if (!updateError) {
                updates.push({
                  callId: call.id,
                  contactName: call.contacts?.name,
                  oldStatus: call.status,
                  newStatus: newStatus,
                  hasData: newStatus === 'ENDED'
                })
              }
            }
          }
        } catch (callError) {
          console.error(`Error checking call ${call.provider_call_id}:`, callError)
        }
      }
    }
    
    console.log(`✅ SIMPLE POLL: Updated ${updates.length} calls`)

    // 🚀 AUTO-TRIGGER SYSTEM: Check if we should trigger scheduler for more calls
    if (campaignId && updates.length > 0) {
      // Don't await - run in background to avoid blocking the response
      checkAndTriggerScheduler(campaignId, updates.length).catch(error => {
        console.error('Auto-trigger background task failed:', error);
      });
    }
    
    return NextResponse.json({
      success: true,
      checkedCalls: activeCalls?.length || 0,
      updatedCalls: updates.length,
      updates: updates,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Simple poll error:', error)
    return NextResponse.json({
      error: 'Failed to poll call statuses',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function mapVapiStatus(vapiStatus: string): string {
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