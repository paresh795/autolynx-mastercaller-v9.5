// Standalone script to seed assistant template
import { config } from 'dotenv'
import { join } from 'path'

// Load environment variables
config({ path: join(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import type { AssistantConfig } from '../lib/types'

async function seedAssistant() {
  try {
    console.log('Loading environment variables...')
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      console.log('URL:', supabaseUrl ? 'Found' : 'Missing')
      console.log('Service Key:', supabaseServiceKey ? 'Found' : 'Missing')
      process.exit(1)
    }
    
    console.log('Creating Supabase client...')
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('Seeding assistant template...')

    // Generic assistant configuration
    const assistantConfig: AssistantConfig = {
      model: 'gpt-3.5-turbo',
      voice: 'alloy',
      systemPrompt: `You are a professional sales representative making outbound calls. 

Key Guidelines:
- Be polite, friendly, and professional
- Introduce yourself and your company clearly
- Keep the conversation concise and focused
- If you reach voicemail, leave a brief, compelling message
- If the person is not interested, thank them politely and end the call
- If they are interested, gather their information and schedule a follow-up

Your goal is to qualify leads and schedule appointments for the sales team.`,
      firstMessage: "Hi, this is Alex calling from AutoLynx. I hope I'm not catching you at a bad time?",
      temperature: 0.7,
      maxDuration: 5,
      endCallFunctionEnabled: true,
      description: 'Professional outbound sales assistant for lead qualification and appointment setting'
    }

    // Create the template assistant
    const { data: assistant, error } = await supabase
      .from('assistants')
      .insert({
        name: 'Sales Qualification Template',
        source: 'template',
        provider_assistant_id: 'template-sales-001',
        config_json: assistantConfig,
        active: true,
        ephemeral: false
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      process.exit(1)
    }

    console.log('✅ Assistant template seeded successfully!')
    console.log('Assistant ID:', assistant.id)
    console.log('Name:', assistant.name)
    
    return assistant
  } catch (error) {
    console.error('❌ Error seeding assistant:', error)
    process.exit(1)
  }
}

// Run the seeding
seedAssistant()
  .then(() => {
    console.log('🎉 Seeding completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Seeding failed:', error)
    process.exit(1)
  })