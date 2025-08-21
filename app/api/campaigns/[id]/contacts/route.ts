import { NextRequest, NextResponse } from 'next/server'
import { withAuth, User } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-server'

interface ContactWithCall {
  id: string
  name: string
  business_name: string
  phone: string
  phone_original: string
  created_at: string
  call?: {
    id: string
    status: string
    started_at?: string
    ended_at?: string
    cost_usd?: number
    recording_url?: string
    transcript_json?: any
    provider_call_id?: string
    duration?: number // calculated field
  }
}

interface ContactListResponse {
  contacts: ContactWithCall[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  filters: {
    status: string
    search: string
  }
}

async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  user: User
) {
  try {
    // In Next.js 15, params is a Promise that must be awaited
    const { id: campaignId } = await params
    const { searchParams } = new URL(request.url)
    
    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const statusFilter = searchParams.get('status') || 'all'
    const searchQuery = searchParams.get('search') || ''
    
    if (!campaignId) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      )
    }

    // Verify campaign exists
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit
    
    // Build base query for contacts
    let contactQuery = supabaseAdmin
      .from('contacts')
      .select(`
        id,
        name,
        business_name,
        phone,
        phone_original,
        created_at,
        calls(
          id,
          status,
          started_at,
          ended_at,
          cost_usd,
          recording_url,
          transcript_json,
          provider_call_id
        )
      `, { count: 'exact' })
      .eq('campaign_id', campaignId)
    
    // Apply search filter
    if (searchQuery.trim()) {
      contactQuery = contactQuery.or(`name.ilike.%${searchQuery.trim()}%,business_name.ilike.%${searchQuery.trim()}%,phone.ilike.%${searchQuery.trim()}%`)
    }
    
    // Apply sorting and pagination
    contactQuery = contactQuery
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)
    
    const { data: contacts, error, count } = await contactQuery

    if (error) {
      console.error('Contacts fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch contacts' },
        { status: 500 }
      )
    }

    // Transform data and apply status filter
    let transformedContacts: ContactWithCall[] = contacts?.map(contact => {
      // Get the most recent call for this contact
      const mostRecentCall = contact.calls?.sort((a, b) => 
        new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime()
      )[0]

      return {
        id: contact.id,
        name: contact.name,
        business_name: contact.business_name,
        phone: contact.phone,
        phone_original: contact.phone_original,
        created_at: contact.created_at,
        call: mostRecentCall ? {
          id: mostRecentCall.id,
          status: mostRecentCall.status,
          started_at: mostRecentCall.started_at,
          ended_at: mostRecentCall.ended_at,
          cost_usd: mostRecentCall.cost_usd,
          recording_url: mostRecentCall.recording_url,
          transcript_json: mostRecentCall.transcript_json,
          provider_call_id: mostRecentCall.provider_call_id,
          duration: mostRecentCall.started_at && mostRecentCall.ended_at 
            ? Math.round((new Date(mostRecentCall.ended_at).getTime() - new Date(mostRecentCall.started_at).getTime()) / 1000)
            : undefined
        } : undefined
      }
    }) || []

    // Apply status filter after transformation
    if (statusFilter !== 'all') {
      transformedContacts = transformedContacts.filter(contact => {
        switch (statusFilter) {
          case 'pending':
            return !contact.call || contact.call.status === 'QUEUED'
          case 'calling':
            return contact.call && ['RINGING', 'IN_PROGRESS'].includes(contact.call.status)
          case 'completed':
            return contact.call && ['COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY'].includes(contact.call.status)
          case 'successful':
            return contact.call && contact.call.status === 'COMPLETED'
          case 'failed':
            return contact.call && ['FAILED', 'NO_ANSWER', 'BUSY'].includes(contact.call.status)
          default:
            return true
        }
      })
    }

    // Calculate pagination for filtered results
    const filteredTotal = transformedContacts.length
    const totalPages = Math.ceil(filteredTotal / limit)

    // Apply pagination to filtered results
    const paginatedContacts = transformedContacts.slice(offset, offset + limit)

    const response: ContactListResponse = {
      contacts: paginatedContacts,
      pagination: {
        page,
        limit,
        total: count || 0, // Total contacts in campaign
        totalPages: Math.ceil((count || 0) / limit),
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: {
        status: statusFilter,
        search: searchQuery
      }
    }

    return NextResponse.json(response)

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Campaign contacts fetch error:', errorMessage)
    return NextResponse.json(
      { error: 'Failed to fetch campaign contacts' },
      { status: 500 }
    )
  }
}

// Export with auth wrapper
const authGetHandler = withAuth(GET)
export { authGetHandler as GET }