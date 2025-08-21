# US-2.2: Import Existing Assistant by ID

## Story
**As an** admin  
**I want to** import an existing Vapi assistant by its ID  
**So that** I can reuse assistants created outside this system

## Story Points
**2** (Low complexity - simple API call and storage)

## Priority
**P1** - High (Enables migration and flexibility)

## Acceptance Criteria
1. **Import Form**
   - Input field for Vapi assistant ID
   - Optional name override field
   - Import button with loading state
   - Clear error messages for invalid IDs

2. **Validation**
   - Verify assistant exists in Vapi
   - Check not already imported
   - Validate ID format
   - Ensure API credentials valid

3. **Import Process**
   - Fetch assistant details from Vapi
   - Store in local database
   - Mark source as 'imported'
   - Use Vapi name if no override

4. **Success Flow**
   - Show assistant details after import
   - Add to assistant directory
   - Available immediately for campaigns
   - Success notification

5. **Error Handling**
   - Invalid ID: "Assistant not found"
   - Already imported: "Assistant already in directory"
   - API errors: Clear messages
   - Network issues: Retry option

## Technical Implementation Notes

### Import Flow
```typescript
interface ImportAssistantRequest {
  providerAssistantId: string;
  nameOverride?: string;
}

async function importAssistant(request: ImportAssistantRequest) {
  // 1. Check if already imported
  const existing = await db.assistants.findOne({
    provider_assistant_id: request.providerAssistantId
  });
  if (existing) {
    throw new Error('Assistant already imported');
  }
  
  // 2. Fetch from Vapi
  const vapiAssistant = await vapiClient.get(
    `/assistant/${request.providerAssistantId}`
  );
  
  if (!vapiAssistant) {
    throw new Error('Assistant not found in Vapi');
  }
  
  // 3. Store locally
  const assistant = await db.assistants.create({
    name: request.nameOverride || vapiAssistant.name,
    provider_assistant_id: request.providerAssistantId,
    config_json: vapiAssistant,
    source: 'imported',
    active: true
  });
  
  return assistant;
}
```

### Validation
```typescript
function validateAssistantId(id: string): boolean {
  // Vapi ID format validation
  const vapiIdRegex = /^[a-zA-Z0-9-_]+$/;
  return vapiIdRegex.test(id) && id.length > 0;
}
```

## Dependencies
- Vapi API access
- Assistant database schema

## Test Cases
1. **Happy Path**
   - Valid ID → Assistant imported
   - With name override → Custom name used
   - Without override → Vapi name used

2. **Validation**
   - Empty ID → Error: "ID required"
   - Invalid format → Error: "Invalid ID format"
   - Non-existent ID → Error: "Not found"

3. **Duplicates**
   - Already imported → Error with details
   - Import twice → Second fails

4. **API Issues**
   - 401 → "Check credentials"
   - 404 → "Assistant not found"
   - 500 → "Service error"

## UI Mockup Description
- Simple card/modal with:
  - Title: "Import Existing Assistant"
  - Input: Assistant ID field
  - Input: Name override (optional)
  - Helper text with ID format
  - Import button
  - Cancel button
- Success state shows:
  - Assistant name
  - ID
  - "View in Directory" button

## Definition of Ready
- [ ] Vapi GET endpoint confirmed
- [ ] ID format documented
- [ ] UI design approved

## Definition of Done
- [ ] Import form functional
- [ ] Vapi fetch working
- [ ] Duplicate check implemented
- [ ] Error messages clear
- [ ] Success flow complete
- [ ] Unit tests written
- [ ] Integration test with mock
- [ ] UI responsive
- [ ] Documentation updated

## Notes
- Consider bulk import feature
- May need to sync configs periodically
- Track import source for auditing
- Consider permission levels