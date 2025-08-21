import { supabaseAdmin } from './lib/supabase-server';
import { vapiClient } from './lib/vapi-client';

async function createRealAssistant() {
  console.log('=== CREATING REAL VAPI ASSISTANT ===');
  
  // Get the template config
  const { data: template } = await supabaseAdmin
    .from('assistants')
    .select('*')
    .eq('name', 'Morgan Freebot - Elite AI Caller')
    .single();
    
  if (!template) {
    console.error('Template not found');
    return;
  }
  
  console.log('Found template:', template.name);
  console.log('Current provider_assistant_id:', template.provider_assistant_id);
  
  try {
    // Create real assistant in Vapi using our config
    const vapiAssistant = await vapiClient.createAssistant({
      model: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.3,
        emotionRecognitionEnabled: true,
        messages: [
          {
            role: 'system',
            content: template.config_json.systemPrompt
          }
        ]
      },
      voice: {
        provider: 'playht',
        voiceId: 'matt'
      },
      firstMessage: template.config_json.firstMessage,
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
            }
          ]
        }
      },
      voicemailMessage: template.config_json.voicemailMessage || 'Hi, this is Morgan Freebot from AutoLynx AI.'
    });
    
    console.log('✅ Created real Vapi assistant:', vapiAssistant.id);
    
    // Update our database with the real ID
    const { error } = await supabaseAdmin
      .from('assistants')
      .update({
        provider_assistant_id: vapiAssistant.id,
        source: 'local'
      })
      .eq('id', template.id);
      
    if (error) {
      console.error('Failed to update database:', error);
    } else {
      console.log('✅ Updated database with real assistant ID');
      console.log('New provider_assistant_id:', vapiAssistant.id);
    }
    
  } catch (error) {
    console.error('❌ Failed to create Vapi assistant:', error);
  }
}

createRealAssistant().then(() => process.exit(0)).catch(console.error);