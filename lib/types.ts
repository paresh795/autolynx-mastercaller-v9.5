// Database types for AutoLynx

export type CallStatus = 
  | 'QUEUED'
  | 'RINGING' 
  | 'IN_PROGRESS'
  | 'ENDED'
  | 'FAILED'
  | 'CANCELED'
  | 'TIMEOUT'

export type CampaignMode = 'continuous' | 'batch'

export type AssistantSource = 'local' | 'imported' | 'template'

export interface Assistant {
  id: string
  name: string
  source: AssistantSource
  provider: string
  provider_assistant_id: string
  config_json: AssistantConfig
  active: boolean
  ephemeral: boolean
  created_at: string
  updated_at: string
}

export interface AssistantConfig {
  model: string
  voice: string
  systemPrompt: string
  firstMessage?: string
  temperature: number
  maxDuration: number
  endCallFunctionEnabled: boolean
  description?: string
}

export interface Campaign {
  id: string
  name: string
  mode: CampaignMode
  cap: number
  assistant_id: string
  phone_number_id: string
  created_at: string
  started_at?: string
  completed_at?: string
  total_contacts: number
  stats_json: Record<string, any>
}

export interface Contact {
  id: string
  campaign_id: string
  name: string
  business_name: string
  phone: string
  phone_original?: string
  batch_index: number
  created_at: string
}

export interface Call {
  id: string
  campaign_id: string
  contact_id: string
  provider_call_id?: string
  status: CallStatus
  started_at?: string
  ended_at?: string
  ended_reason?: string
  cost_usd?: number
  recording_url?: string
  transcript_json?: Record<string, any>
  success_evaluation?: boolean
  last_status_at: string
}

export interface CallEvent {
  id: string
  call_id: string
  status: CallStatus
  payload: Record<string, any>
  created_at: string
}

export interface CampaignSummary {
  id: string
  name: string
  mode: CampaignMode
  cap: number
  created_at: string
  started_at?: string
  completed_at?: string
  total_contacts: number
  assistant_name: string
  total_calls: number
  completed_calls: number
  active_calls: number
  failed_calls: number
  status: string
  progress: number
}

// API Request/Response types
export interface CreateCampaignRequest {
  name: string
  assistantId: string
  phoneNumberId: string
  cap?: number
  mode?: CampaignMode
}

export interface CSVValidationResult {
  valid: Contact[]
  invalid: Array<{
    row: number
    data: Partial<Contact>
    errors: string[]
  }>
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    duplicates: number
  }
}

// Vapi API types
export interface VapiAssistant {
  id: string
  name: string
  model: {
    provider: string
    model: string
    temperature: number
    systemPrompt: string
  }
  voice: {
    provider: string
    voiceId: string
  }
  firstMessage?: string
  endCallFunctionEnabled: boolean
}

export interface VapiCall {
  id: string
  assistant: string
  customer: {
    number: string
    name?: string
  }
  phoneNumber: string
  status: string
  cost?: number
  recordingUrl?: string
  transcript?: Record<string, any>
  endedReason?: string
  startedAt?: string
  endedAt?: string
}

export interface VapiWebhookEvent {
  type: string
  call: VapiCall
  timestamp: string
}