import { NextRequest, NextResponse } from 'next/server'
import { withAuth, User } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-server'

interface CampaignDetail {
  id: string
  name: string
  status: string
  assistant_name: string
  phone_number_id: string
  cap: number
  mode: 'continuous' | 'batch'
  total_contacts: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  metrics: {
    total_calls: number
    completed_calls: number
    active_calls: number
    failed_calls: number
    success_rate: number
    average_duration: number
    total_cost: number
    progress: number
  }
  assistant_config?: any
}

async function GET(
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

    // Fetch campaign first without join to avoid null issues
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      if (campaignError?.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Campaign not found' },
          { status: 404 }
        )
      }
      
      console.error('Campaign fetch error:', campaignError)
      return NextResponse.json(
        { error: 'Failed to fetch campaign' },
        { status: 500 }
      )
    }

    // Fetch assistant details separately if assistant_id exists
    let assistantData = null
    if (campaign.assistant_id) {
      const { data: assistant } = await supabaseAdmin
        .from('assistants')
        .select('name, config_json')
        .eq('id', campaign.assistant_id)
        .single()
      
      assistantData = assistant
    }

    // Fetch call statistics for this campaign
    const { data: callStats } = await supabaseAdmin
      .from('calls')
      .select('status, duration, cost, created_at, completed_at')
      .eq('campaign_id', campaignId)

    // Calculate metrics
    const totalCalls = callStats?.length || 0
    const completedCalls = callStats?.filter(call => 
      ['COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY'].includes(call.status)
    ).length || 0
    const activeCalls = callStats?.filter(call => 
      ['QUEUED', 'RINGING', 'IN_PROGRESS'].includes(call.status)
    ).length || 0
    const failedCalls = callStats?.filter(call => 
      ['FAILED', 'NO_ANSWER', 'BUSY'].includes(call.status)
    ).length || 0
    const successfulCalls = callStats?.filter(call => 
      call.status === 'COMPLETED'
    ).length || 0
    
    const successRate = completedCalls > 0 ? Math.round((successfulCalls / completedCalls) * 100) : 0
    const progress = campaign.total_contacts > 0 ? Math.round((completedCalls / campaign.total_contacts) * 100) : 0
    
    // Calculate average duration (in seconds)
    const durationsInSeconds = callStats
      ?.filter(call => call.duration && call.duration > 0)
      ?.map(call => call.duration) || []
    const averageDuration = durationsInSeconds.length > 0 
      ? Math.round(durationsInSeconds.reduce((sum, duration) => sum + duration, 0) / durationsInSeconds.length)
      : 0
    
    // Calculate total cost
    const totalCost = callStats?.reduce((sum, call) => sum + (call.cost || 0), 0) || 0

    // Determine campaign status
    const status = campaign.completed_at ? 'completed' : 
                  campaign.started_at ? 'running' : 'created'

    const campaignDetail: CampaignDetail = {
      id: campaign.id,
      name: campaign.name,
      status,
      assistant_name: assistantData?.name || 'Unknown Assistant',
      phone_number_id: campaign.phone_number_id,
      cap: campaign.cap,
      mode: campaign.mode,
      total_contacts: campaign.total_contacts || 0,
      created_at: campaign.created_at,
      started_at: campaign.started_at,
      completed_at: campaign.completed_at,
      metrics: {
        total_calls: totalCalls,
        completed_calls: completedCalls,
        active_calls: activeCalls,
        failed_calls: failedCalls,
        success_rate: successRate,
        average_duration: averageDuration,
        total_cost: Math.round(totalCost * 100) / 100, // Round to 2 decimal places
        progress
      },
      assistant_config: assistantData?.config_json || null
    }

    return NextResponse.json(campaignDetail)

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Campaign detail fetch error:', errorMessage)
    return NextResponse.json(
      { error: 'Failed to fetch campaign details' },
      { status: 500 }
    )
  }
}

// Export with auth wrapper
const authGetHandler = withAuth(GET)
export { authGetHandler as GET }