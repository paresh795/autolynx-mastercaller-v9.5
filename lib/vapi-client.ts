// Vapi API client for call management
// Based on AutoLynx architecture guidelines

interface VapiCallRequest {
  assistantId: string
  phoneNumber: string
  customerName?: string
  metadata?: Record<string, any>
}

interface VapiCallResponse {
  id: string
  status: string
  phoneNumber: string
  assistantId: string
  customer?: {
    name?: string
  }
  metadata?: Record<string, any>
  createdAt: string
  startedAt?: string
  endedAt?: string
  cost?: number
  transcript?: any
  recordingUrl?: string
}

interface VapiError {
  error: string
  message: string
  statusCode: number
}

interface VapiAssistantRequest {
  name?: string
  model: {
    provider: string
    model: string
    temperature: number
    messages: Array<{
      role: string
      content: string
    }>
    emotionRecognitionEnabled?: boolean
    toolIds?: string[]
  }
  voice: {
    provider: string
    voiceId: string
  }
  firstMessage?: string
  firstMessageMode?: string
  backgroundSound?: string
  analysisPlan?: any
  stopSpeakingPlan?: any
  startSpeakingPlan?: any
  voicemailDetection?: any
  voicemailMessage?: string
}

interface VapiAssistantResponse {
  id: string
  name?: string
  model: any
  voice: any
  firstMessage?: string
  createdAt: string
  updatedAt: string
}

class VapiClient {
  private apiKey: string
  private baseUrl: string = 'https://api.vapi.ai'

  constructor() {
    const apiKey = process.env.VAPI_API_KEY
    if (!apiKey) {
      throw new Error('VAPI_API_KEY environment variable is required')
    }
    this.apiKey = apiKey
  }

  private async makeRequest(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }

    const config: RequestInit = {
      method,
      headers,
    }

    if (body && (method === 'POST' || method === 'PUT')) {
      config.body = JSON.stringify(body)
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: 'Unknown error',
          message: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status
        }))
        
        throw new Error(`Vapi API Error: ${errorData.message || errorData.error || 'Unknown error'}`)
      }

      return await response.json()
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Network error: ${error}`)
    }
  }

  // Create a new call - matches n8n workflow format
  async createCall(request: VapiCallRequest): Promise<VapiCallResponse> {
    console.log('Creating Vapi call:', {
      assistantId: request.assistantId,
      phoneNumber: request.phoneNumber,
      customerName: request.customerName
    })

    const payload = {
      customer: {
        number: request.phoneNumber,
        name: request.customerName || 'Unknown'
      },
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || '0c07692a-db4d-4a56-a895-4debafc213fe',
      assistantId: request.assistantId
    }

    return await this.makeRequest('/call', 'POST', payload)
  }

  // Get call details
  async getCall(callId: string): Promise<VapiCallResponse> {
    return await this.makeRequest(`/call/${callId}`)
  }

  // List calls with pagination
  async listCalls(options?: {
    limit?: number
    offset?: number
    assistantId?: string
  }): Promise<{ calls: VapiCallResponse[], total: number }> {
    const params = new URLSearchParams()
    
    if (options?.limit) params.append('limit', options.limit.toString())
    if (options?.offset) params.append('offset', options.offset.toString())
    if (options?.assistantId) params.append('assistantId', options.assistantId)

    const endpoint = params.toString() ? `/call?${params}` : '/call'
    const response = await this.makeRequest(endpoint)
    
    return {
      calls: response.calls || response,
      total: response.total || response.length || 0
    }
  }

  // End a call
  async endCall(callId: string): Promise<VapiCallResponse> {
    return await this.makeRequest(`/call/${callId}/end`, 'POST')
  }

  // Get call details by ID
  async getCall(callId: string): Promise<VapiCallResponse> {
    return await this.makeRequest(`/call/${callId}`, 'GET')
  }

  // Assistant management methods

  // Create a new assistant
  async createAssistant(request: VapiAssistantRequest): Promise<VapiAssistantResponse> {
    console.log('Creating Vapi assistant:', {
      name: request.name,
      model: request.model?.model,
      voice: request.voice?.voiceId
    })

    return await this.makeRequest('/assistant', 'POST', request)
  }

  // Get assistant details
  async getAssistant(assistantId: string): Promise<VapiAssistantResponse> {
    return await this.makeRequest(`/assistant/${assistantId}`)
  }

  // List assistants with pagination
  async listAssistants(options?: {
    limit?: number
    offset?: number
  }): Promise<{ assistants: VapiAssistantResponse[], total: number }> {
    const params = new URLSearchParams()
    
    if (options?.limit) params.append('limit', options.limit.toString())
    if (options?.offset) params.append('offset', options.offset.toString())

    const endpoint = params.toString() ? `/assistant?${params}` : '/assistant'
    const response = await this.makeRequest(endpoint)
    
    return {
      assistants: response.assistants || response,
      total: response.total || response.length || 0
    }
  }

  // Update an existing assistant
  async updateAssistant(assistantId: string, request: Partial<VapiAssistantRequest>): Promise<VapiAssistantResponse> {
    console.log('Updating Vapi assistant:', assistantId)
    return await this.makeRequest(`/assistant/${assistantId}`, 'PUT', request)
  }

  // Delete an assistant
  async deleteAssistant(assistantId: string): Promise<void> {
    console.log('Deleting Vapi assistant:', assistantId)
    await this.makeRequest(`/assistant/${assistantId}`, 'DELETE')
  }

  // Convert our AssistantConfig to exact Vapi format from n8n workflow
  static convertConfigToVapiFormat(config: any): VapiAssistantRequest {
    return {
      model: {
        provider: 'openai',
        model: config.model || 'gpt-4.1',
        emotionRecognitionEnabled: true,
        temperature: config.temperature || 0.3,
        messages: [
          {
            role: 'system',
            content: config.systemPrompt || 'You are a professional sales representative making outbound calls.'
          }
        ]
      },
      voice: {
        provider: 'playht',
        voiceId: config.voice || 'matt'
      },
      firstMessage: config.firstMessage || "Hi, this is Morgan Freebot, how are you doing today?",
      firstMessageMode: 'assistant-waits-for-user',
      backgroundSound: 'office',
      analysisPlan: {
        summaryPlan: {
          enabled: true,
          timeoutSeconds: 10,
          messages: [
            {
              role: 'system',
              content: 'You are an expert note-taker. You will be given a transcript of a call. Summarize the call in 2-3 sentences. DO NOT return anything except the summary.'
            },
            {
              role: 'user',
              content: 'Here is the transcript:'
            }
          ]
        }
      },
      stopSpeakingPlan: {
        backoffSeconds: 2,
        voiceSeconds: 0.2
      },
      startSpeakingPlan: {
        smartEndpointingEnabled: true,
        waitSeconds: 1.5
      },
      voicemailDetection: {
        provider: 'openai',
        beepMaxAwaitSeconds: 10
      },
      voicemailMessage: config.voicemailMessage || "Hi, this is Morgan Freebot from AutoLynx AI. I know, I know - you probably weren't expecting an AI to leave you a voicemail, but here we are! I was calling to show you how AI can revolutionize your business communications, and well... I guess I just did. Give me a call back when you're ready to see what else I can do - I promise the conversation will be worth your time. Reach me at 519 981 5710, I repeat 519 981 5710. Talk soon!"
    }
  }

  // Normalize and validate phone number format
  static validatePhoneNumber(phone: string): boolean {
    if (!phone) return false
    
    // Normalize to E.164 format
    const normalized = VapiClient.normalizePhoneNumber(phone)
    if (!normalized) return false
    
    // E.164 format validation: +[country code][number]
    const e164Regex = /^\+[1-9]\d{1,14}$/
    return e164Regex.test(normalized)
  }

  // Normalize phone number to E.164 format
  static normalizePhoneNumber(phone: string): string | null {
    if (!phone) return null
    
    // Remove all non-numeric characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '')
    
    // Remove + from middle/end positions
    if (cleaned.includes('+') && !cleaned.startsWith('+')) {
      cleaned = cleaned.replace(/\+/g, '')
    }
    
    // Handle US numbers (most common case)
    if (cleaned.length === 10) {
      // Add US country code
      cleaned = '+1' + cleaned
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      // Add + to US number
      cleaned = '+' + cleaned
    } else if (cleaned.length === 11 && !cleaned.startsWith('+')) {
      // Assume US number, add +1
      cleaned = '+1' + cleaned.substring(1)
    } else if (!cleaned.startsWith('+') && cleaned.length > 10) {
      // Add + if missing for international numbers
      cleaned = '+' + cleaned
    }
    
    // Validate length (should be 10-15 digits after country code)
    const digits = cleaned.replace(/^\+/, '')
    if (digits.length < 10 || digits.length > 15) {
      return null
    }
    
    return cleaned
  }

  // Exponential backoff retry logic for API failures
  async createCallWithRetry(
    request: VapiCallRequest,
    maxRetries: number = 3
  ): Promise<VapiCallResponse> {
    const delays = [1000, 4000, 10000] // 1s, 4s, 10s as per AutoLynx guidelines
    
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.createCall(request)
      } catch (error) {
        lastError = error as Error
        
        console.warn(`Call creation attempt ${attempt + 1} failed:`, lastError.message)
        
        // Don't retry on the last attempt
        if (attempt === maxRetries - 1) break
        
        // Wait before retrying
        const delay = delays[attempt] || 10000
        console.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    throw new Error(`Call creation failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`)
  }
}

// Export singleton instance
export const vapiClient = new VapiClient()

// Export class for static methods
export { VapiClient }

// Export types
export type { VapiCallRequest, VapiCallResponse, VapiError, VapiAssistantRequest, VapiAssistantResponse }