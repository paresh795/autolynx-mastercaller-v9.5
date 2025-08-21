# US-2.1: Assistant Creation with Vapi Integration

## Story
**As an** admin  
**I want to** create custom assistants with specific configurations  
**So that** campaigns can use purpose-built conversation flows

## Story Points
**5** (High complexity - Vapi API integration, complex form)

## Priority
**P0** - Critical (Required for campaigns)

## Acceptance Criteria
1. **Assistant Configuration Form**
   - Name: Required, unique, max 100 chars
   - System prompt: Text area for instructions
   - Voice selection: Dropdown of available voices
   - Model selection: GPT-3.5, GPT-4, etc.
   - Temperature: Slider 0-1
   - Max duration: Minutes (1-60)
   - First message: Optional greeting

2. **Vapi Integration**
   - Create assistant via Vapi API
   - Store returned assistant ID
   - Handle API errors gracefully
   - Retry on transient failures

3. **Local Storage**
   - Save assistant configuration in database
   - Store provider_assistant_id from Vapi
   - Mark as active by default
   - Track creation timestamp and user

4. **Validation**
   - Name must be unique in system
   - System prompt required
   - Valid temperature range
   - API key must be configured

5. **Success Flow**
   - Show creation progress
   - Display success with assistant ID
   - Redirect to assistant list
   - Assistant immediately available for campaigns

## Technical Implementation Notes

### Assistant Configuration
```typescript
interface AssistantConfig {
  name: string;
  model: 'gpt-3.5-turbo' | 'gpt-4';
  voice: string;
  systemPrompt: string;
  firstMessage?: string;
  temperature: number;
  maxDuration: number;
  endCallFunctionEnabled: boolean;
}

interface VapiAssistantRequest {
  name: string;
  model: {
    provider: 'openai';
    model: string;
    temperature: number;
    systemPrompt: string;
  };
  voice: {
    provider: 'azure';
    voiceId: string;
  };
  firstMessage?: string;
  endCallFunctionEnabled: boolean;
}
```

### API Integration
```typescript
async function createAssistant(config: AssistantConfig) {
  // 1. Validate configuration
  validateConfig(config);
  
  // 2. Create on Vapi
  const vapiResponse = await vapiClient.post('/assistant', {
    ...transformToVapiFormat(config)
  });
  
  // 3. Store locally
  const assistant = await db.assistants.create({
    name: config.name,
    provider_assistant_id: vapiResponse.id,
    config_json: config,
    source: 'local',
    active: true
  });
  
  return assistant;
}
```

### Error Handling
- Rate limiting: Exponential backoff
- Invalid config: Clear error messages
- Network failures: Retry with timeout
- Duplicate names: Suggest alternatives

## Dependencies
- Vapi API credentials configured
- Database schema for assistants

## Test Cases
1. **Happy Path**
   - Valid config → Assistant created
   - Vapi returns ID → Stored locally

2. **Validation**
   - Duplicate name → Error shown
   - Missing prompt → Validation error
   - Temperature = 2 → Range error

3. **API Failures**
   - 401 → "Check API credentials"
   - 429 → Retry with backoff
   - 500 → "Service error, try again"
   - Network error → Timeout and retry

4. **Edge Cases**
   - Very long prompt → Handled
   - Special characters → Escaped
   - Concurrent creates → No conflicts

## UI Mockup Description
- Form with sections:
  - Basic Info (name, description)
  - Model Configuration
  - Voice Settings
  - Behavior (prompt, temperature)
  - Advanced Options
- Preview panel showing config
- Test button (future)
- Save button with loading state
- Cancel returns to list

## Definition of Ready
- [ ] Vapi API docs reviewed
- [ ] Voice options determined
- [ ] Model options confirmed
- [ ] UI designs approved

## Definition of Done
- [ ] Form validates all inputs
- [ ] Vapi integration working
- [ ] Assistant stored locally
- [ ] Error handling complete
- [ ] Retry logic implemented
- [ ] Unit tests for validation
- [ ] Integration tests with mock
- [ ] Real Vapi test in staging
- [ ] Responsive form design
- [ ] Loading states handled
- [ ] Documentation updated

## Notes
- Consider template library for common configs
- May need approval workflow
- Track creation metrics
- Consider versioning for configs
- Add cost estimation display