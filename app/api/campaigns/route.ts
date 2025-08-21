import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-server'
import { bulletproofSessionStorage as sessionStorage } from '@/lib/session-storage-v2'

interface CampaignRequest {
  name: string
  assistantId: string
  phoneNumberId: string
  cap: number
  mode: 'continuous' | 'batch'
  sessionId: string
}

async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const sortBy = searchParams.get('sort') || 'created_at'
    const sortOrder = searchParams.get('order') || 'desc'
    const statusFilter = searchParams.get('status') || 'all'
    const searchQuery = searchParams.get('search') || ''
    
    // Validate parameters
    const validSortFields = ['name', 'created_at', 'status', 'total_contacts']
    const validSortOrders = ['asc', 'desc']
    const validStatuses = ['all', 'created', 'running', 'completed', 'paused']
    
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at'
    const order = validSortOrders.includes(sortOrder) ? sortOrder : 'desc'
    const status = validStatuses.includes(statusFilter) ? statusFilter : 'all'
    
    // Calculate offset for pagination
    const offset = (page - 1) * limit
    
    // Build base query - fetch campaigns without join to avoid null issues
    let query = supabaseAdmin
      .from('campaigns')
      .select('*', { count: 'exact' })
    
    // Apply search filter
    if (searchQuery.trim()) {
      query = query.ilike('name', `%${searchQuery.trim()}%`)
    }
    
    // Apply status filter
    if (status !== 'all') {
      switch (status) {
        case 'created':
          query = query.is('started_at', null).is('completed_at', null)
          break
        case 'running':
          query = query.not('started_at', 'is', null).is('completed_at', null)
          break
        case 'completed':
          query = query.not('completed_at', 'is', null)
          break
        case 'paused':
          // Add paused logic when implemented
          break
      }
    }
    
    // Apply sorting and pagination
    const ascending = order === 'asc'
    query = query
      .order(sortField, { ascending })
      .range(offset, offset + limit - 1)
    
    const { data: campaigns, error, count } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch campaigns' },
        { status: 500 }
      )
    }

    // Calculate call statistics for each campaign
    const campaignIds = campaigns.map(c => c.id)
    let callStats: Record<string, { total: number; completed: number; active: number }> = {}
    
    if (campaignIds.length > 0) {
      const { data: callData } = await supabaseAdmin
        .from('calls')
        .select('campaign_id, status')
        .in('campaign_id', campaignIds)
      
      if (callData) {
        callStats = callData.reduce((acc, call) => {
          if (!acc[call.campaign_id]) {
            acc[call.campaign_id] = { total: 0, completed: 0, active: 0 }
          }
          acc[call.campaign_id].total++
          
          if (['COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY'].includes(call.status)) {
            acc[call.campaign_id].completed++
          } else if (['QUEUED', 'RINGING', 'IN_PROGRESS'].includes(call.status)) {
            acc[call.campaign_id].active++
          }
          
          return acc
        }, {} as Record<string, { total: number; completed: number; active: number }>)
      }
    }

    // Fetch assistant names separately to avoid join issues
    const assistantIds = [...new Set(campaigns.map(c => c.assistant_id).filter(Boolean))]
    let assistantMap: Record<string, string> = {}
    
    if (assistantIds.length > 0) {
      const { data: assistants } = await supabaseAdmin
        .from('assistants')
        .select('id, name')
        .in('id', assistantIds)
      
      if (assistants) {
        assistantMap = assistants.reduce((acc, assistant) => {
          acc[assistant.id] = assistant.name
          return acc
        }, {} as Record<string, string>)
      }
    }

    // Transform for UI
    const campaignSummaries = campaigns.map(campaign => {
      const stats = callStats[campaign.id] || { total: 0, completed: 0, active: 0 }
      const status = campaign.completed_at ? 'completed' : 
                   campaign.started_at ? 'running' : 'created'
      
      return {
        id: campaign.id,
        name: campaign.name,
        status,
        assistant_name: assistantMap[campaign.assistant_id] || 'Unknown Assistant',
        phone_number_id: campaign.phone_number_id,
        cap: campaign.cap,
        mode: campaign.mode,
        total_contacts: campaign.total_contacts || 0,
        completed_calls: stats.completed,
        total_calls: stats.total,
        active_calls: stats.active,
        progress: campaign.total_contacts > 0 ? Math.round((stats.completed / campaign.total_contacts) * 100) : 0,
        created_at: campaign.created_at,
        started_at: campaign.started_at,
        completed_at: campaign.completed_at
      }
    })

    // Calculate pagination info
    const totalPages = Math.ceil((count || 0) / limit)

    return NextResponse.json({
      campaigns: campaignSummaries,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: {
        sort: sortField,
        order,
        status,
        search: searchQuery
      }
    })
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Campaigns fetch error:', errorMessage)
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    )
  }
}

async function POST(request: NextRequest) {
  try {
    const body: CampaignRequest = await request.json()
    const { name, assistantId, phoneNumberId, cap, mode, sessionId } = body

    // Validate input
    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Campaign name is required' },
        { status: 400 }
      )
    }

    if (!assistantId) {
      return NextResponse.json(
        { error: 'Assistant is required' },
        { status: 400 }
      )
    }

    if (!phoneNumberId) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    if (!cap || cap < 1 || cap > 50) {
      return NextResponse.json(
        { error: 'Concurrency cap must be between 1 and 50' },
        { status: 400 }
      )
    }

    if (!mode || !['continuous', 'batch'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid campaign mode' },
        { status: 400 }
      )
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // Retrieve validation data from session
    const validationData = await sessionStorage.retrieve(sessionId)
    if (!validationData) {
      return NextResponse.json(
        { error: 'Session expired. Please upload your CSV again.' },
        { status: 400 }
      )
    }

    // Verify assistant exists and is active
    const { data: assistant, error: assistantError } = await supabaseAdmin
      .from('assistants')
      .select('id, active')
      .eq('id', assistantId)
      .single()

    if (assistantError || !assistant || !assistant.active) {
      return NextResponse.json(
        { error: 'Selected assistant is not available' },
        { status: 400 }
      )
    }

    // Check for duplicate campaign name
    const { data: existingCampaign } = await supabaseAdmin
      .from('campaigns')
      .select('id')
      .eq('name', name.trim())
      .single()

    if (existingCampaign) {
      return NextResponse.json(
        { error: 'Campaign name already exists. Please choose a different name.' },
        { status: 400 }
      )
    }

    // Start database transaction
    const campaignId = crypto.randomUUID()
    
    // Create campaign
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .insert({
        id: campaignId,
        name: name.trim(),
        assistant_id: assistantId,
        phone_number_id: phoneNumberId,
        cap: cap,
        mode: mode,
        total_contacts: validationData.valid.length
      })
      .select()
      .single()

    if (campaignError) {
      console.error('Campaign creation error:', campaignError)
      return NextResponse.json(
        { error: 'Failed to create campaign' },
        { status: 500 }
      )
    }

    // Insert contacts with duplicate phone support for testing
    const phoneCount = new Map<string, number>()
    
    const contacts = validationData.valid.map((contact: any) => {
      const count = phoneCount.get(contact.phone) || 0
      phoneCount.set(contact.phone, count + 1)
      
      return {
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        name: contact.name,
        business_name: contact.business_name,
        // For duplicates, append _1, _2, etc to make them unique in DB
        phone: count > 0 ? `${contact.phone}_${count}` : contact.phone,
        phone_original: contact.phone_original || contact.phone
      }
    })

    let successfulContacts = 0
    let duplicateContacts = 0
    let failedContacts = 0

    // Insert contacts one by one to handle duplicates gracefully
    for (const contact of contacts) {
      try {
        const { error } = await supabaseAdmin
          .from('contacts')
          .insert([contact])

        if (error) {
          if (error.code === '23505') {
            // Duplicate constraint violation
            duplicateContacts++
            console.log(`Duplicate contact skipped: ${contact.phone}`)
          } else {
            failedContacts++
            console.error('Contact insertion error:', error)
          }
        } else {
          successfulContacts++
        }
      } catch (err) {
        failedContacts++
        console.error('Unexpected contact insertion error:', err)
      }
    }

    // Check if we have at least some successful contacts
    if (successfulContacts === 0) {
      // Rollback campaign creation if no contacts were inserted
      await supabaseAdmin
        .from('campaigns')
        .delete()
        .eq('id', campaignId)

      return NextResponse.json(
        { 
          error: `Failed to import any contacts. ${duplicateContacts} duplicates, ${failedContacts} failed.`,
          details: {
            total: contacts.length,
            successful: successfulContacts,
            duplicates: duplicateContacts,
            failed: failedContacts
          }
        },
        { status: 400 }
      )
    }

    // Update campaign with actual imported contact count
    await supabaseAdmin
      .from('campaigns')
      .update({ total_contacts: successfulContacts })
      .eq('id', campaignId)

    // Clear session data
    await sessionStorage.delete(sessionId)

    return NextResponse.json({
      campaignId,
      message: `Campaign "${name}" created successfully with ${validationData.valid.length} contacts`,
      totalContacts: validationData.valid.length
    })
    
  } catch (error: any) {
    console.error('Campaign creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    )
  }
}

// Export without auth for internal use
export { GET, POST }