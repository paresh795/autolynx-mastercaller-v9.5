import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { assistants } from '@/lib/db'
import { vapiClient, VapiClient } from '@/lib/vapi-client'

// GET /api/assistants - List all assistants
async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') !== 'false'
    
    const data = await assistants.getAll(activeOnly)
    
    return NextResponse.json(data)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error fetching assistants:', errorMessage)
    return NextResponse.json(
      { error: 'Failed to fetch assistants' },
      { status: 500 }
    )
  }
}

// POST /api/assistants - Create new assistant
async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, config } = body
    
    if (!name || !config) {
      return NextResponse.json(
        { error: 'Name and config are required' },
        { status: 400 }
      )
    }
    
    console.log('Creating assistant:', { name, config })
    
    // Create assistant in Vapi first
    const vapiRequest = VapiClient.convertConfigToVapiFormat(config)
    const vapiAssistant = await vapiClient.createAssistant(vapiRequest)
    
    console.log('Vapi assistant created:', vapiAssistant.id)
    
    // Then store in our database
    const assistant = await assistants.create({
      name,
      source: 'local',
      provider_assistant_id: vapiAssistant.id,
      config_json: config,
      active: true,
      ephemeral: false
    })
    
    console.log('Assistant stored in database:', assistant.id)
    
    return NextResponse.json(assistant, { status: 201 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error creating assistant:', errorMessage)
    
    // More specific error messages for debugging
    if (errorMessage.includes('Vapi API Error')) {
      return NextResponse.json(
        { error: 'Failed to create assistant with Vapi', details: errorMessage },
        { status: 502 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to create assistant', details: errorMessage },
      { status: 500 }
    )
  }
}

// Export with auth wrapper
const authGetHandler = withAuth(GET)
const authPostHandler = withAuth(POST)

export { authGetHandler as GET, authPostHandler as POST }