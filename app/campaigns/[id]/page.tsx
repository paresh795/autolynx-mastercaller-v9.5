'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import SimpleCallModal from './components/SimpleCallModal'

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
    outcome?: string
    duration?: number
    cost?: number
    recording_url?: string
    transcript?: any
    created_at: string
    completed_at?: string
    provider_call_id?: string
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

export default function CampaignDetailsPage() {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [contacts, setContacts] = useState<ContactListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [error, setError] = useState('')
  // Removed activeTab - contacts will be shown on main page
  const [contactStatusFilter, setContactStatusFilter] = useState('all')
  const [contactSearch, setContactSearch] = useState('')
  const [contactPage, setContactPage] = useState(1)
  const [campaignActionLoading, setCampaignActionLoading] = useState(false)
  const [callDetailModal, setCallDetailModal] = useState<{ isOpen: boolean; callId: string | null; contactName: string }>({
    isOpen: false,
    callId: null,
    contactName: ''
  })
  
  const router = useRouter()
  const params = useParams()
  const campaignId = params.id as string

  useEffect(() => {
    if (campaignId) {
      fetchCampaignDetails()
    }
  }, [campaignId])

  useEffect(() => {
    if (campaignId) {
      fetchContacts()
    }
  }, [campaignId, contactStatusFilter, contactSearch, contactPage])

  // Set up real-time subscriptions
  useEffect(() => {
    if (!campaignId) return

    // Subscribe to campaign changes
    const campaignSubscription = supabase
      .channel(`campaign-${campaignId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campaigns',
        filter: `id=eq.${campaignId}`
      }, () => {
        fetchCampaignDetails()
      })
      .subscribe()

    // Subscribe to call changes for this campaign
    const callSubscription = supabase
      .channel(`campaign-calls-${campaignId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'calls',
        filter: `campaign_id=eq.${campaignId}`
      }, () => {
        fetchCampaignDetails()
        fetchContacts()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(campaignSubscription)
      supabase.removeChannel(callSubscription)
    }
  }, [campaignId])

  // Simple polling for call status updates
  useEffect(() => {
    if (!campaignId || !campaign) {
      console.log('🔄 POLLING: Not starting - missing campaignId or campaign')
      return
    }
    
    if (campaign.status !== 'active' && campaign.status !== 'running') {
      console.log(`🔄 POLLING: Not starting - campaign status is ${campaign.status}`)
      return
    }

    console.log(`🚀 POLLING: Starting 10-second polling for campaign ${campaignId} (status: ${campaign.status})`)

    const pollInterval = setInterval(async () => {
      try {
        console.log(`🔄 POLLING: Checking for call status updates... (${new Date().toLocaleTimeString()})`)
        
        const response = await fetch('/api/calls/poll-status-simple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId })
        })
        
        if (response.ok) {
          const result = await response.json()
          console.log(`📊 POLLING: Result - Checked: ${result.checkedCalls}, Updated: ${result.updatedCalls}`)
          
          if (result.updates && result.updates.length > 0) {
            console.log(`📞 POLLING: Status Updates:`)
            result.updates.forEach((update: any) => {
              console.log(`   ${update.contactName}: ${update.oldStatus} → ${update.newStatus}`)
            })
          }
          
          if (result.updatedCalls > 0) {
            console.log(`✅ POLLING: Refreshing UI after ${result.updatedCalls} updates`)
            // Refresh the contacts list and campaign stats
            fetchContacts()
            fetchCampaignDetails()
          }
        } else {
          console.error(`❌ POLLING: Request failed with status ${response.status}`)
          const errorText = await response.text()
          console.error('POLLING Error response:', errorText)
        }
      } catch (error) {
        console.error('❌ POLLING: Network error:', error)
      }
    }, 10000) // Poll every 10 seconds

    return () => {
      console.log('🛑 POLLING: Stopping polling for campaign', campaignId)
      clearInterval(pollInterval)
    }
  }, [campaignId, campaign?.status])

  const fetchCampaignDetails = async () => {
    try {
      console.log(`📊 CAMPAIGN: Fetching details for campaign ${campaignId}`)
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        console.log('❌ CAMPAIGN: No session found, redirecting to login')
        router.push('/login')
        return
      }

      const response = await fetch(`/api/campaigns/${campaignId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }

      if (response.status === 404) {
        setError('Campaign not found')
        setLoading(false)
        return
      }

      if (!response.ok) {
        throw new Error('Failed to load campaign details')
      }

      const campaignData = await response.json()
      console.log(`✅ CAMPAIGN: Details loaded - Status: ${campaignData.status}, Total Contacts: ${campaignData.total_contacts}`)
      setCampaign(campaignData)
      setLoading(false)

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load campaign details')
      setLoading(false)
    }
  }

  const fetchContacts = async () => {
    console.log(`👥 CONTACTS: Fetching contacts for campaign ${campaignId} (Page: ${contactPage}, Filter: ${contactStatusFilter}, Search: "${contactSearch}")`)
    setContactsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        console.log('❌ CONTACTS: No session found, redirecting to login')
        router.push('/login')
        return
      }

      const params = new URLSearchParams({
        page: contactPage.toString(),
        limit: '25',
        status: contactStatusFilter,
        search: contactSearch
      })

      const response = await fetch(`/api/campaigns/${campaignId}/contacts?${params}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }

      if (response.ok) {
        const contactsData = await response.json()
        console.log(`✅ CONTACTS: Loaded ${contactsData.contacts?.length || 0} contacts (Total: ${contactsData.pagination?.total || 0})`)
        setContacts(contactsData)
      } else {
        console.error(`❌ CONTACTS: Request failed with status ${response.status}`)
      }
    } catch (error) {
      console.error('Error fetching contacts:', error)
    } finally {
      setContactsLoading(false)
    }
  }

  const handleContactSearch = (query: string) => {
    setContactSearch(query)
    setContactPage(1)
  }

  const handleContactStatusFilter = (status: string) => {
    setContactStatusFilter(status)
    setContactPage(1)
  }

  const handleContactPageChange = (page: number) => {
    setContactPage(page)
  }

  const handleStartCampaign = async () => {
    setCampaignActionLoading(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      const response = await fetch(`/api/campaigns/${campaignId}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start campaign')
      }

      console.log('Campaign started:', result)
      // Refresh campaign details to show updated status
      await fetchCampaignDetails()
      
    } catch (error) {
      console.error('Failed to start campaign:', error)
      setError(error instanceof Error ? error.message : 'Failed to start campaign')
    } finally {
      setCampaignActionLoading(false)
    }
  }

  const handleStopCampaign = async () => {
    if (!confirm('Are you sure you want to stop this campaign? This will end all active calls.')) {
      return
    }

    setCampaignActionLoading(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      const response = await fetch(`/api/campaigns/${campaignId}/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to stop campaign')
      }

      console.log('Campaign stopped:', result)
      // Refresh campaign details to show updated status
      await fetchCampaignDetails()
      
    } catch (error) {
      console.error('Failed to stop campaign:', error)
      setError(error instanceof Error ? error.message : 'Failed to stop campaign')
    } finally {
      setCampaignActionLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'created':
        return 'bg-gray-100 text-gray-800'
      case 'running':
        return 'bg-yellow-100 text-yellow-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'paused':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getCallStatusBadge = (status: string) => {
    switch (status) {
      case 'QUEUED':
        return 'bg-gray-100 text-gray-800'
      case 'RINGING':
        return 'bg-blue-100 text-blue-800'
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800'
      case 'COMPLETED':
        return 'bg-green-100 text-green-800'
      case 'FAILED':
      case 'NO_ANSWER':
      case 'BUSY':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const openCallDetailModal = (callId: string, contactName: string) => {
    console.log(`🔍 MODAL: Opening call details for ${contactName} (Call ID: ${callId})`)
    setCallDetailModal({
      isOpen: true,
      callId,
      contactName
    })
  }

  const closeCallDetailModal = () => {
    console.log('🚪 MODAL: Closing call details modal')
    setCallDetailModal({
      isOpen: false,
      callId: null,
      contactName: ''
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading campaign details...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <h1 className="text-3xl font-bold text-gray-900">Campaign Details</h1>
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        </main>
      </div>
    )
  }

  if (!campaign) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{campaign.name}</h1>
              <div className="flex items-center mt-2 space-x-4">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(campaign.status)}`}>
                  {campaign.status}
                </span>
                <span className="text-sm text-gray-500">
                  Campaign ID: {campaign.id}
                </span>
              </div>
            </div>
            <div className="flex space-x-3">
              {campaign.status === 'created' && (
                <button 
                  onClick={handleStartCampaign}
                  disabled={campaignActionLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed"
                >
                  {campaignActionLoading ? 'Starting...' : 'Start Campaign'}
                </button>
              )}
              {campaign.status === 'running' && (
                <button 
                  onClick={handleStopCampaign}
                  disabled={campaignActionLoading}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-4 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed"
                >
                  {campaignActionLoading ? 'Stopping...' : 'Stop Campaign'}
                </button>
              )}
              <button 
                onClick={() => router.push('/dashboard')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Main Content - Overview and Contacts Combined */}
        <div className="space-y-8">
          {/* Campaign Overview Section */}
            <div className="space-y-6">
            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">%</span>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Progress
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {campaign.metrics.progress}%
                        </dd>
                      </dl>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${campaign.metrics.progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">✓</span>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Success Rate
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {campaign.metrics.success_rate}%
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">⏱</span>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Avg Duration
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {formatDuration(campaign.metrics.average_duration)}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">$</span>
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Total Cost
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {formatCurrency(campaign.metrics.total_cost)}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Call Statistics */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Call Statistics</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{campaign.metrics.total_calls}</div>
                    <div className="text-sm text-gray-600">Total Calls</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{campaign.metrics.completed_calls}</div>
                    <div className="text-sm text-gray-600">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{campaign.metrics.active_calls}</div>
                    <div className="text-sm text-gray-600">Active</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{campaign.metrics.failed_calls}</div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Campaign Information */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Campaign Information</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Assistant</label>
                    <p className="mt-1 text-sm text-gray-900">{campaign.assistant_name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Phone Number</label>
                    <p className="mt-1 text-sm text-gray-900">{campaign.phone_number_id}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Mode</label>
                    <p className="mt-1 text-sm text-gray-900 capitalize">{campaign.mode}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Concurrency Cap</label>
                    <p className="mt-1 text-sm text-gray-900">{campaign.cap} simultaneous calls</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Created</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {new Date(campaign.created_at).toLocaleString()}
                    </p>
                  </div>
                  {campaign.started_at && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Started</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {new Date(campaign.started_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {campaign.completed_at && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Completed</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {new Date(campaign.completed_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Contacts Section */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Contacts ({campaign.total_contacts})</h2>
            {/* Contact Filters */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <h3 className="text-lg font-medium text-gray-900">Contacts</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* Search */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search contacts..."
                        value={contactSearch}
                        onChange={(e) => handleContactSearch(e.target.value)}
                        className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-md text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Status Filter */}
                    <select
                      value={contactStatusFilter}
                      onChange={(e) => handleContactStatusFilter(e.target.value)}
                      className="border border-gray-300 rounded-md px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">All Contacts</option>
                      <option value="pending">Pending</option>
                      <option value="calling">Calling</option>
                      <option value="completed">Completed</option>
                      <option value="successful">Successful</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Contacts Table */}
              {contactsLoading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading contacts...</p>
                </div>
              ) : !contacts || contacts.contacts.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-gray-500">No contacts found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Business
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Duration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Cost
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {contacts.contacts.map((contact) => (
                        <tr key={contact.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{contact.name}</div>
                              <div className="text-sm text-gray-500">Added {new Date(contact.created_at).toLocaleDateString()}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {contact.business_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{contact.phone}</div>
                            {contact.phone_original !== contact.phone && (
                              <div className="text-xs text-gray-500">Original: {contact.phone_original}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {contact.call ? (
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCallStatusBadge(contact.call.status)}`}>
                                {contact.call.status}
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                                PENDING
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {contact.call?.duration ? formatDuration(contact.call.duration) : '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {contact.call?.cost ? formatCurrency(contact.call.cost) : '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              {contact.call ? (
                                <button 
                                  onClick={() => openCallDetailModal(contact.call!.id, contact.name)}
                                  className="text-blue-600 hover:text-blue-500"
                                >
                                  View Details
                                </button>
                              ) : (
                                <span className="text-gray-400">No Call</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {/* Pagination */}
              {contacts && contacts.pagination.totalPages > 1 && (
                <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => handleContactPageChange(contactPage - 1)}
                      disabled={!contacts.pagination.hasPrev}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handleContactPageChange(contactPage + 1)}
                      disabled={!contacts.pagination.hasNext}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing{' '}
                        <span className="font-medium">
                          {((contactPage - 1) * contacts.pagination.limit) + 1}
                        </span>{' '}
                        to{' '}
                        <span className="font-medium">
                          {Math.min(contactPage * contacts.pagination.limit, contacts.pagination.total)}
                        </span>{' '}
                        of{' '}
                        <span className="font-medium">{contacts.pagination.total}</span>{' '}
                        results
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                        <button
                          onClick={() => handleContactPageChange(contactPage - 1)}
                          disabled={!contacts.pagination.hasPrev}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => handleContactPageChange(contactPage + 1)}
                          disabled={!contacts.pagination.hasNext}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Call Detail Modal */}
      <SimpleCallModal
        isOpen={callDetailModal.isOpen}
        onClose={closeCallDetailModal}
        callId={callDetailModal.callId}
        contactName={callDetailModal.contactName}
      />
    </div>
  )
}