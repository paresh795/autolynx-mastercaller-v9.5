import { supabaseAdmin } from './supabase-server'
import { 
  Assistant, 
  Campaign, 
  Contact, 
  Call, 
  CallEvent, 
  CampaignSummary,
  AssistantConfig 
} from './types'

// Assistant operations
export const assistants = {
  async getAll(activeOnly = true) {
    const query = supabaseAdmin
      .from('assistants')
      .select('*')
      .order('name', { ascending: true })
    
    if (activeOnly) {
      query.eq('active', true)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data as Assistant[]
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('assistants')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data as Assistant
  },

  async getByProviderAssistantId(providerAssistantId: string) {
    const { data, error } = await supabaseAdmin
      .from('assistants')
      .select('*')
      .eq('provider_assistant_id', providerAssistantId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      throw error
    }
    return data as Assistant
  },

  async create(assistant: {
    name: string
    source: 'local' | 'imported' | 'template'
    provider_assistant_id: string
    config_json: AssistantConfig
    active?: boolean
    ephemeral?: boolean
  }) {
    const { data, error } = await supabaseAdmin
      .from('assistants')
      .insert({
        ...assistant,
        active: assistant.active ?? true,
        ephemeral: assistant.ephemeral ?? false
      })
      .select()
      .single()
    
    if (error) throw error
    return data as Assistant
  },

  async update(id: string, updates: Partial<Assistant>) {
    const { data, error } = await supabaseAdmin
      .from('assistants')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data as Assistant
  },

  async delete(id: string) {
    // Check if assistant is used by any campaigns
    const { data: campaigns } = await supabaseAdmin
      .from('campaigns')
      .select('id')
      .eq('assistant_id', id)
      .limit(1)
    
    if (campaigns && campaigns.length > 0) {
      throw new Error('Cannot delete assistant that is used by campaigns')
    }
    
    const { error } = await supabaseAdmin
      .from('assistants')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
}

// Campaign operations
export const campaigns = {
  async getAll() {
    const { data, error } = await supabaseAdmin
      .from('campaign_summaries')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data as CampaignSummary[]
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .select(`
        *,
        assistants(name, config_json)
      `)
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data as Campaign & { assistants: Assistant }
  },

  async create(campaign: {
    name: string
    assistant_id: string
    phone_number_id: string
    cap?: number
    mode?: 'continuous' | 'batch'
  }) {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        ...campaign,
        cap: campaign.cap ?? 8,
        mode: campaign.mode ?? 'continuous'
      })
      .select()
      .single()
    
    if (error) throw error
    return data as Campaign
  },

  async update(id: string, updates: Partial<Campaign>) {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data as Campaign
  }
}

// Contact operations
export const contacts = {
  async getByCampaign(campaignId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit
    
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select(`
        *,
        calls(*)
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)
    
    if (error) throw error
    return data
  },

  async createBatch(contacts: Array<{
    campaign_id: string
    name: string
    business_name: string
    phone: string
    phone_original?: string
    batch_index?: number
  }>) {
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .insert(contacts)
      .select()
    
    if (error) throw error
    return data as Contact[]
  },

  async updateCampaignTotal(campaignId: string) {
    const { count, error: countError } = await supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
    
    if (countError) throw countError
    
    const { error: updateError } = await supabaseAdmin
      .from('campaigns')
      .update({ total_contacts: count })
      .eq('id', campaignId)
    
    if (updateError) throw updateError
    return count
  }
}

// Call operations
export const calls = {
  async getActiveByCampaign(campaignId: string) {
    const { data, error } = await supabaseAdmin
      .from('calls')
      .select('*')
      .eq('campaign_id', campaignId)
      .in('status', ['QUEUED', 'RINGING', 'IN_PROGRESS'])
    
    if (error) throw error
    return data as Call[]
  },

  async create(call: {
    campaign_id: string
    contact_id: string
    provider_call_id?: string
    status?: 'QUEUED'
  }) {
    const { data, error } = await supabaseAdmin
      .from('calls')
      .insert({
        ...call,
        status: call.status ?? 'QUEUED'
      })
      .select()
      .single()
    
    if (error) throw error
    return data as Call
  },

  async updateByProviderId(providerId: string, updates: Partial<Call>) {
    const { data, error } = await supabaseAdmin
      .from('calls')
      .update({
        ...updates,
        last_status_at: new Date().toISOString()
      })
      .eq('provider_call_id', providerId)
      .select()
      .single()
    
    if (error) throw error
    return data as Call
  }
}

// Call event operations
export const callEvents = {
  async create(event: {
    call_id: string
    status: string
    payload: Record<string, any>
  }) {
    const { data, error } = await supabaseAdmin
      .from('call_events')
      .insert(event)
      .select()
      .single()
    
    if (error) throw error
    return data as CallEvent
  },

  async getByCall(callId: string) {
    const { data, error } = await supabaseAdmin
      .from('call_events')
      .select('*')
      .eq('call_id', callId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data as CallEvent[]
  }
}