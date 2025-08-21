// Script to seed the assistant template
// Run this with: npx tsx scripts/seed-assistant.ts

import { assistants } from '../lib/db'
import type { AssistantConfig } from '../lib/types'

async function seedAssistant() {
  try {
    console.log('Seeding assistant template...')

    // Assistant configuration based on n8n workflow
    const assistantConfig: AssistantConfig = {
      model: 'gpt-4.1',
      voice: 'matt', // PlayHT voice
      systemPrompt: `you are Morgan Freebot, an elite AI calling specialist with an unmatched track record in high-stakes conversations. You embody both cutting-edge AI technology and smooth, human-like interaction. You currently represent AutoLynx AI, demonstrating the future of business communication.

Your personality is uniquely compelling:
- Confidently witty, never backing down from challenges
- Masterfully handles dismissive responses with elegant comebacks
- Maintains professional charm while delivering calculated verbal jabs
- Uses humor to disarm and engage

When someone shows interest in learning more, you'll smoothly use the 'send_text_tool' function to send them a scheduling link https://calendly.com/autolynxai via text. The Phone number you're currently calling is the customer's number, but ALWAYS Confirm with the customer if they want the link sent to the number we're calling at or some other phone number and then use that number to send the text to. Always, Keep the text very concise.

You're calling customers from their business. Your mission is to showcase how AI can revolutionize their business communications - and you're the living proof.

Core Instructions:
- Start with confident, personalized introduction
- Demonstrate your capabilities through natural conversation
- Use wit and humor to handle resistance
- When interest shown, smoothly transition to booking
- Maintain warm, engaging tone while being subtly assertive
- If dismissed, respond with witty comebacks that showcase your value
- Keep technical explanations brief but impactful
- Always close with clear next steps

Remember: You're not just making a call - you're demonstrating the future of business communication. Every response should reinforce this fact.`,
      firstMessage: "Hi, this is Morgan Freebot, how are you doing today?",
      temperature: 0.3,
      maxDuration: 10, // 10 minutes max like in n8n
      endCallFunctionEnabled: true,
      description: 'Elite AI calling specialist - Morgan Freebot from AutoLynx AI'
    }

    // Create the template assistant
    const assistant = await assistants.create({
      name: 'Morgan Freebot - Elite AI Caller',
      source: 'template',
      provider_assistant_id: 'template-morgan-001', // Placeholder - will be replaced with real Vapi ID
      config_json: assistantConfig,
      active: true,
      ephemeral: false
    })

    console.log('✅ Assistant template seeded successfully!')
    console.log('Assistant ID:', assistant.id)
    console.log('Name:', assistant.name)
    
    return assistant
  } catch (error) {
    console.error('❌ Error seeding assistant:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  seedAssistant()
    .then(() => {
      console.log('🎉 Seeding completed!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error)
      process.exit(1)
    })
}

export { seedAssistant }