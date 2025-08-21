import { supabaseAdmin } from './lib/supabase-server';

async function checkAssistantIds() {
  console.log('=== CHECKING ASSISTANT IDs ===');
  
  const { data: assistants } = await supabaseAdmin
    .from('assistants')
    .select('id, name, provider_assistant_id, active, source');
    
  console.log('All assistants:');
  assistants?.forEach(a => {
    console.log(`- ${a.name}: ${a.provider_assistant_id} (source: ${a.source}, active: ${a.active})`);
  });
  
  // Check which one campaigns are using
  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('id, name, assistant_id');
    
  console.log('\nCampaign assistant mappings:');
  campaigns?.forEach(c => {
    const assistant = assistants?.find(a => a.id === c.assistant_id);
    console.log(`- ${c.name}: uses ${assistant?.provider_assistant_id} (${assistant?.source})`);
  });
}

checkAssistantIds().then(() => process.exit(0)).catch(console.error);