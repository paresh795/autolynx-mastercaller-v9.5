import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { vapiClient, VapiClient } from '@/lib/vapi-client'

// Verify cron secret to ensure only authorized calls
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SHARED_SECRET
  if (!cronSecret) {
    console.warn('CRON_SHARED_SECRET not configured - allowing request')
    return true // Allow in development
  }

  const providedSecret = request.headers.get('authorization')?.replace('Bearer ', '') ||
                        request.headers.get('x-cron-secret') ||
                        request.nextUrl.searchParams.get('secret')

  return providedSecret === cronSecret
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    if (!verifyCronSecret(request)) {
      console.error('Unauthorized cron request')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if specific campaign ID was provided
    const body = await request.json().catch(() => ({}))
    const specificCampaignId = body.campaignId

    console.log('🕐 Scheduler tick started:', new Date().toISOString())
    if (specificCampaignId) {
      console.log(`🎯 Processing specific campaign: ${specificCampaignId}`)
    }

    // Find active campaigns that are started but not completed
    let campaignQuery = supabaseAdmin
      .from('campaigns')
      .select(`
        id,
        name,
        mode,
        cap,
        assistant_id,
        assistants (
          id,
          name,
          provider_assistant_id,
          active
        )
      `)
      .not('started_at', 'is', null)
      .is('completed_at', null)

    // If specific campaign ID provided, filter to just that campaign
    if (specificCampaignId) {
      campaignQuery = campaignQuery.eq('id', specificCampaignId)
    }

    const { data: activeCampaigns, error: campaignError } = await campaignQuery

    if (campaignError) {
      console.error('Failed to fetch active campaigns:', campaignError)
      return NextResponse.json(
        { error: 'Failed to fetch campaigns' },
        { status: 500 }
      )
    }

    if (!activeCampaigns || activeCampaigns.length === 0) {
      console.log('No active campaigns found')
      return NextResponse.json({
        success: true,
        message: 'No active campaigns to process',
        campaignsProcessed: 0,
        callsLaunched: 0
      })
    }

    console.log(`Found ${activeCampaigns.length} active campaigns`)

    let totalCallsLaunched = 0
    let campaignsProcessed = 0

    // Process each active campaign
    for (const campaign of activeCampaigns) {
      try {
        console.log(`Processing campaign: ${campaign.name} (${campaign.id})`)

        // Skip if assistant is not active
        if (!campaign.assistants?.active) {
          console.log(`Skipping campaign ${campaign.id} - assistant not active`)
          continue
        }

        // Check current active calls for this campaign (EXCLUDE QUEUED - they haven't been sent to Vapi yet)
        const { data: activeCalls, error: activeCallsError } = await supabaseAdmin
          .from('calls')
          .select('id, status')
          .eq('campaign_id', campaign.id)
          .in('status', ['RINGING', 'IN_PROGRESS'])

        if (activeCallsError) {
          console.error(`Failed to fetch active calls for campaign ${campaign.id}:`, activeCallsError)
          continue
        }

        const activeCallCount = activeCalls?.length || 0
        const availableSlots = campaign.cap - activeCallCount

        // 🔍 CONTINUOUS MODE: DETAILED CAPACITY ANALYSIS
        console.log(`\n🎯 CONTINUOUS MODE ANALYSIS - Campaign ${campaign.id}:`)
        console.log(`📊 ACTIVE CALLS: ${activeCallCount}/${campaign.cap} (${activeCalls?.map(c => c.id).join(', ') || 'none'})`)
        console.log(`🎰 AVAILABLE SLOTS: ${availableSlots}`)
        console.log(`⚡ TIMESTAMP: ${new Date().toISOString()}`)
        
        // Show active call details
        if (activeCalls && activeCalls.length > 0) {
          console.log(`📋 ACTIVE CALL BREAKDOWN:`)
          activeCalls.forEach((call, idx) => {
            console.log(`   ${idx + 1}. Call ${call.id} - Status: ${call.status}`)
          })
        }

        if (availableSlots <= 0) {
          console.log(`❌ CAPACITY FULL: Campaign ${campaign.id} at ${activeCallCount}/${campaign.cap} - SKIPPING`)
          continue
        }
        
        console.log(`✅ CAPACITY AVAILABLE: ${availableSlots} slots free - PROCEEDING TO LAUNCH`)

        // Handle different campaign modes
        if (campaign.mode === 'batch') {
          // Mode B: Strict batching - wait for all calls to complete before launching next batch
          if (activeCallCount > 0) {
            console.log(`Campaign ${campaign.id} in batch mode - waiting for current batch to complete`)
            continue
          }
        }

        // Mode A: Continuous cap - launch calls up to cap limit
        // Find queued calls that need to be launched
        const { data: queuedCalls, error: queuedError } = await supabaseAdmin
          .from('calls')
          .select(`
            id,
            contact_id,
            contacts (
              id,
              name,
              business_name,
              phone,
              phone_original
            )
          `)
          .eq('campaign_id', campaign.id)
          .eq('status', 'QUEUED')
          .is('provider_call_id', null)
          .limit(availableSlots)

        if (queuedError) {
          console.error(`Failed to fetch queued calls for campaign ${campaign.id}:`, queuedError)
          continue
        }

        // 🔍 CONTINUOUS MODE: QUEUED CALLS ANALYSIS
        console.log(`\n📊 QUEUED CALLS ANALYSIS:`)
        console.log(`🎯 FOUND: ${queuedCalls?.length || 0} QUEUED calls without provider_call_id`)
        console.log(`🎰 WILL LAUNCH: ${Math.min(queuedCalls?.length || 0, availableSlots)} calls (respecting ${availableSlots} slot limit)`)
        
        if (queuedCalls && queuedCalls.length > 0) {
          console.log(`📋 QUEUED CALLS TO LAUNCH:`)
          queuedCalls.slice(0, availableSlots).forEach((call, idx) => {
            console.log(`   ${idx + 1}. Contact: ${call.contacts?.name} - Call ID: ${call.id}`)
          })
        }
        
        if (!queuedCalls || queuedCalls.length === 0) {
          console.log(`❌ SCHEDULER: No queued calls to process for campaign ${campaign.id}`)
          
          // Extra debug: Let's see ALL calls for this campaign
          const { data: allCalls } = await supabaseAdmin
            .from('calls')
            .select('id, status, provider_call_id')
            .eq('campaign_id', campaign.id)
          
          console.log(`🔍 DEBUG: Campaign ${campaign.id} has ${allCalls?.length || 0} total calls:`)
          if (allCalls) {
            const breakdown = {
              total: allCalls.length,
              queued: allCalls.filter(c => c.status === 'QUEUED').length,
              queued_no_provider: allCalls.filter(c => c.status === 'QUEUED' && !c.provider_call_id).length,
              ringing: allCalls.filter(c => c.status === 'RINGING').length,
              in_progress: allCalls.filter(c => c.status === 'IN_PROGRESS').length,
              ended: allCalls.filter(c => c.status === 'ENDED').length
            }
            console.log('📋 CALL BREAKDOWN:', breakdown)
          }
          continue
        }

        // Enhanced logging for batch mode
        if (campaign.mode === 'batch') {
          console.log(`🎯 BATCH MODE: Starting ${queuedCalls.length} calls for campaign ${campaign.id}`)
          console.log(`📊 BATCH INFO: This will be batch of ${queuedCalls.length}/${campaign.cap} calls`)
        } else {
          console.log(`🔄 CONTINUOUS MODE: Launching ${queuedCalls.length} calls for campaign ${campaign.id}`)
        }

        console.log(`✅ SCHEDULER: Launching ${queuedCalls.length} calls for campaign ${campaign.id}`)

        // 🚨 CRITICAL: Re-check capacity right before launching (prevent race conditions)
        console.log(`\n🔄 PRE-LAUNCH CAPACITY DOUBLE-CHECK:`)
        const { data: prelaunchActiveCalls } = await supabaseAdmin
          .from('calls')
          .select('id, status')
          .eq('campaign_id', campaign.id)
          .in('status', ['RINGING', 'IN_PROGRESS'])
        
        const prelaunchActiveCount = prelaunchActiveCalls?.length || 0
        const actualAvailableSlots = campaign.cap - prelaunchActiveCount
        
        console.log(`🎯 DOUBLE-CHECK: ${prelaunchActiveCount}/${campaign.cap} active calls`)
        console.log(`🎰 ACTUAL SLOTS: ${actualAvailableSlots} available`)
        
        if (actualAvailableSlots <= 0) {
          console.log(`🚨 RACE CONDITION DETECTED: Capacity filled since last check - ABORTING LAUNCH`)
          continue
        }
        
        // 🚨 CRITICAL CONCURRENCY PROTECTION FOR CONTINUOUS MODE
        let safeLaunchLimit = actualAvailableSlots
        
        if (campaign.mode === 'continuous') {
          // For continuous mode, implement safety measures to prevent Vapi limits
          
          // 1. Never launch more than 4 calls at once (progressive launching)
          const MAX_CONTINUOUS_BATCH = 4
          safeLaunchLimit = Math.min(safeLaunchLimit, MAX_CONTINUOUS_BATCH)
          
          // 2. Reserve buffer for Vapi's internal processing (2 call buffer)
          const VAPI_SAFETY_BUFFER = 2
          const totalPossibleActive = prelaunchActiveCount + safeLaunchLimit
          
          // Ensure we never exceed 8 calls when accounting for buffer
          if (totalPossibleActive > (10 - VAPI_SAFETY_BUFFER)) {
            safeLaunchLimit = Math.max(0, (10 - VAPI_SAFETY_BUFFER) - prelaunchActiveCount)
            console.log(`⚠️  SAFETY BUFFER: Limiting to ${safeLaunchLimit} calls to stay under Vapi's 10 limit with buffer`)
          }
          
          console.log(`🛡️ CONTINUOUS MODE PROTECTION:`)
          console.log(`  - Max batch size: ${MAX_CONTINUOUS_BATCH}`)
          console.log(`  - Current active: ${prelaunchActiveCount}`)
          console.log(`  - Safe to launch: ${safeLaunchLimit}`)
          console.log(`  - Total after launch: ${prelaunchActiveCount + safeLaunchLimit}/10 (with ${VAPI_SAFETY_BUFFER} buffer)`)
        }
        
        // Limit launches to safe amount
        const callsToLaunch = queuedCalls.slice(0, safeLaunchLimit)
        console.log(`✅ SAFE TO LAUNCH: ${callsToLaunch.length} calls (was ${queuedCalls.length}, limited to ${safeLaunchLimit})`)

        // Launch each queued call with staggered timing to prevent API rate limits
        for (let i = 0; i < callsToLaunch.length; i++) {
          const call = callsToLaunch[i]
          try {
            const contact = call.contacts
            if (!contact) {
              console.error(`Contact not found for call ${call.id}`)
              continue
            }

            // Get phone number to use (original for duplicates, otherwise stored phone)
            const phoneToUse = contact.phone_original || contact.phone
            
            // Validate and normalize phone number
            if (!VapiClient.validatePhoneNumber(phoneToUse)) {
              console.error(`Invalid phone number for contact ${contact.id}: ${phoneToUse}`)
              
              // Mark call as failed
              await supabaseAdmin
                .from('calls')
                .update({
                  status: 'FAILED',
                  ended_reason: 'Invalid phone number format',
                  last_status_at: new Date().toISOString()
                })
                .eq('id', call.id)
              
              continue
            }

            // Normalize phone for Vapi (ensures E.164 format)
            const normalizedPhone = VapiClient.normalizePhoneNumber(phoneToUse)
            if (!normalizedPhone) {
              console.error(`Failed to normalize phone for contact ${contact.id}: ${phoneToUse}`)
              
              await supabaseAdmin
                .from('calls')
                .update({
                  status: 'FAILED',
                  ended_reason: 'Phone normalization failed',
                  last_status_at: new Date().toISOString()
                })
                .eq('id', call.id)
              
              continue
            }

            // Prepare call metadata
            const metadata = {
              campaignId: campaign.id,
              contactId: contact.id,
              callId: call.id,
              businessName: contact.business_name,
              campaignName: campaign.name,
              scheduledBy: 'scheduler'
            }

            // Create call with Vapi using normalized phone number
            const actualPhone = normalizedPhone
            
            const vapiCall = await vapiClient.createCallWithRetry({
              assistantId: campaign.assistants.provider_assistant_id,
              phoneNumber: actualPhone,
              customerName: contact.name,
              metadata
            })

            console.log(`Vapi call created for contact ${contact.name}: ${vapiCall.id}`)

            // Update call record with Vapi call ID
            const { error: updateError } = await supabaseAdmin
              .from('calls')
              .update({
                provider_call_id: vapiCall.id,
                status: 'RINGING',
                started_at: new Date().toISOString(),
                last_status_at: new Date().toISOString()
              })
              .eq('id', call.id)

            if (updateError) {
              console.error(`Failed to update call record ${call.id}:`, updateError)
              continue
            }

            // Log call event
            await supabaseAdmin
              .from('call_events')
              .insert({
                call_id: call.id,
                status: 'RINGING',
                payload: {
                  provider_call_id: vapiCall.id,
                  created_by: 'scheduler',
                  vapi_response: vapiCall,
                  launched_at: new Date().toISOString()
                }
              })

            totalCallsLaunched++

            // Add staggered delay to prevent API rate limits (except for last call)
            if (i < queuedCalls.length - 1) {
              console.log(`⏱️  RATE LIMIT PROTECTION: Waiting 500ms before next call...`)
              await new Promise(resolve => setTimeout(resolve, 500))
            }

          } catch (callError) {
            console.error(`Failed to launch call ${call.id}:`, callError)

            // Mark call as failed
            await supabaseAdmin
              .from('calls')
              .update({
                status: 'FAILED',
                ended_reason: `Call launch failed: ${callError instanceof Error ? callError.message : 'Unknown error'}`,
                last_status_at: new Date().toISOString()
              })
              .eq('id', call.id)

            // Log failure event
            await supabaseAdmin
              .from('call_events')
              .insert({
                call_id: call.id,
                status: 'FAILED',
                payload: {
                  error: callError instanceof Error ? callError.message : 'Unknown error',
                  created_by: 'scheduler',
                  failed_at: new Date().toISOString()
                }
              })
          }
        }

        // Enhanced completion logging for batch mode
        if (campaign.mode === 'batch') {
          // Check remaining work
          const { data: remainingCalls } = await supabaseAdmin
            .from('calls')
            .select('id')
            .eq('campaign_id', campaign.id)
            .eq('status', 'QUEUED')
            .is('provider_call_id', null)
          
          const remainingCount = remainingCalls?.length || 0
          
          if (remainingCount > 0) {
            console.log(`🎯 BATCH STATUS: Campaign ${campaign.id} batch launched. ${remainingCount} calls remain for next batch.`)
            console.log(`📋 NEXT BATCH: System will auto-trigger next batch when all current calls complete.`)
          } else {
            console.log(`✅ BATCH COMPLETE: Campaign ${campaign.id} - all contacts processed!`)
          }
        }

        // Add cooldown for continuous mode to let Vapi process
        if (campaign.mode === 'continuous' && totalCallsLaunched > 0) {
          console.log(`⏳ CONTINUOUS MODE: Adding 3-second cooldown to let Vapi process...`)
          await new Promise(resolve => setTimeout(resolve, 3000))
        }

        campaignsProcessed++

      } catch (campaignError) {
        console.error(`Error processing campaign ${campaign.id}:`, campaignError)
      }
    }

    // Force update call statuses (bulletproof approach)
    console.log('🔄 Force updating call statuses...')
    try {
      const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/calls/force-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Update all campaigns
      })
      
      if (updateResponse.ok) {
        const updateResult = await updateResponse.json()
        console.log(`✅ Status updates: ${updateResult.callsChecked} calls checked`)
      }
    } catch (updateError) {
      console.warn('Status update failed:', updateError)
    }

    // Check for timeout calls (backup mechanism)
    await timeoutStaleCalls()

    console.log(`Scheduler tick completed: ${campaignsProcessed} campaigns processed, ${totalCallsLaunched} calls launched`)

    return NextResponse.json({
      success: true,
      message: 'Scheduler tick completed',
      campaignsProcessed,
      callsLaunched: totalCallsLaunched,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Scheduler error:', errorMessage)
    
    return NextResponse.json(
      { error: 'Scheduler failed' },
      { status: 500 }
    )
  }
}

// Helper function to timeout stale calls (10 minute timeout as per AutoLynx guidelines)
async function timeoutStaleCalls(): Promise<void> {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    const { data: staleCalls, error: staleError } = await supabaseAdmin
      .from('calls')
      .select('id, campaign_id, contact_id, provider_call_id')
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])
      .lt('last_status_at', tenMinutesAgo)

    if (staleError) {
      console.error('Failed to fetch stale calls:', staleError)
      return
    }

    if (!staleCalls || staleCalls.length === 0) {
      return
    }

    console.log(`Found ${staleCalls.length} stale calls to timeout`)

    for (const call of staleCalls) {
      // Update call status to timeout
      await supabaseAdmin
        .from('calls')
        .update({
          status: 'TIMEOUT',
          ended_at: new Date().toISOString(),
          ended_reason: 'Call timeout (10 minutes)',
          last_status_at: new Date().toISOString()
        })
        .eq('id', call.id)

      // Log timeout event
      await supabaseAdmin
        .from('call_events')
        .insert({
          call_id: call.id,
          status: 'TIMEOUT',
          payload: {
            reason: 'timeout',
            timeout_minutes: 10,
            timed_out_at: new Date().toISOString()
          }
        })
    }

  } catch (error) {
    console.error('Error timing out stale calls:', error)
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    service: 'scheduler',
    status: 'healthy',
    timestamp: new Date().toISOString()
  })
}