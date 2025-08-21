import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { assistants } from '@/lib/db'
import { vapiClient } from '@/lib/vapi-client'

// POST /api/assistants/import - Import existing assistant by Vapi ID
async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { providerAssistantId, name } = body
    
    if (!providerAssistantId) {
      return NextResponse.json(
        { error: 'providerAssistantId is required' },
        { status: 400 }
      )
    }
    
    console.log('Importing assistant:', { providerAssistantId, name })
    
    // First, validate that the assistant exists in Vapi
    let vapiAssistant
    try {
      vapiAssistant = await vapiClient.getAssistant(providerAssistantId)
      console.log('Found Vapi assistant:', vapiAssistant.id)
    } catch (error) {
      console.error('Assistant not found in Vapi:', error)
      return NextResponse.json(
        { error: 'Assistant not found in Vapi', details: 'Please check the assistant ID and try again' },
        { status: 404 }
      )
    }
    
    // Check if we already have this assistant imported
    const existingAssistant = await assistants.getByProviderAssistantId(providerAssistantId)
    if (existingAssistant) {
      console.log('Assistant already imported:', existingAssistant.id)
      return NextResponse.json(
        { error: 'Assistant already imported', assistant: existingAssistant },
        { status: 409 }
      )
    }
    
    // Create minimal config from Vapi assistant data
    const config = {
      model: vapiAssistant.model?.model || 'gpt-3.5-turbo',
      voice: vapiAssistant.voice?.voiceId || 'alloy',
      systemPrompt: vapiAssistant.model?.messages?.[0]?.content || 'You are a helpful assistant.',
      firstMessage: vapiAssistant.firstMessage || 'Hi, how can I help you today?',
      temperature: vapiAssistant.model?.temperature || 0.7,
      maxDuration: 5,
      endCallFunctionEnabled: true,
      description: `Imported assistant from Vapi (ID: ${providerAssistantId})`
    }
    
    // Store in our database
    const assistant = await assistants.create({
      name: name || vapiAssistant.name || `Imported Assistant ${providerAssistantId.substring(0, 8)}`,
      source: 'imported',
      provider_assistant_id: providerAssistantId,
      config_json: config,
      active: true,
      ephemeral: false
    })
    
    console.log('Assistant imported to database:', assistant.id)
    
    return NextResponse.json({
      ...assistant,
      vapiData: vapiAssistant
    }, { status: 201 })
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error importing assistant:', errorMessage)
    
    if (errorMessage.includes('Vapi API Error')) {
      return NextResponse.json(
        { error: 'Failed to validate assistant with Vapi', details: errorMessage },
        { status: 502 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to import assistant', details: errorMessage },
      { status: 500 }
    )
  }
}

// Export with auth wrapper
const authPostHandler = withAuth(POST)
export { authPostHandler as POST }