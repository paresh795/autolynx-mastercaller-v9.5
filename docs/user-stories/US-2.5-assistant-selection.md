# US-2.5: Assistant Selection in Campaign Flow

## Story
**As an** operator  
**I want to** select an assistant from the directory when creating a campaign  
**So that** I can use the appropriate conversation flow for my contacts

## Story Points
**2** (Low complexity - UI integration)

## Priority
**P0** - Critical (Required for campaigns)

## Acceptance Criteria
1. **Selection Interface**
   - Dropdown/select component in campaign form
   - Shows assistant name and type
   - Search/filter capability for many assistants
   - Required field with validation
   - Only shows active assistants

2. **Assistant Display**
   - Name clearly visible
   - Source indicator (local/imported/template)
   - Description if available
   - Last used date
   - Usage count

3. **Selection Validation**
   - Assistant must be selected
   - Selected assistant must exist
   - Assistant must be active
   - Clear error if none available

4. **Quick Actions**
   - Link to create new assistant
   - Link to assistant directory
   - Preview assistant config
   - Recently used section

5. **Selection Persistence**
   - Selected assistant ID stored with campaign
   - Cannot change after campaign starts
   - Shows selected assistant in campaign details

## Technical Implementation Notes

### UI Component
```typescript
interface AssistantSelector {
  value: string; // assistant ID
  onChange: (id: string) => void;
  required: boolean;
  error?: string;
}

interface AssistantOption {
  id: string;
  name: string;
  source: 'local' | 'imported' | 'template';
  lastUsed?: Date;
  usageCount: number;
  description?: string;
}
```

### Data Fetching
```typescript
async function getAvailableAssistants() {
  const assistants = await db.assistants.findMany({
    where: { active: true },
    orderBy: [
      { usageCount: 'desc' },
      { name: 'asc' }
    ]
  });
  
  return assistants.map(a => ({
    id: a.id,
    name: a.name,
    source: a.source,
    lastUsed: a.last_used_at,
    usageCount: a.usage_count,
    description: a.config_json.description
  }));
}
```

### Validation
```typescript
async function validateAssistantSelection(assistantId: string) {
  const assistant = await db.assistants.findById(assistantId);
  
  if (!assistant) {
    throw new Error('Assistant not found');
  }
  
  if (!assistant.active) {
    throw new Error('Assistant is inactive');
  }
  
  if (!assistant.provider_assistant_id) {
    throw new Error('Assistant not properly configured');
  }
  
  return true;
}
```

## Dependencies
- US-2.1 (Assistants exist)
- US-1.3 (Campaign creation form)

## Test Cases
1. **Display**
   - 0 assistants → Shows empty state
   - 1 assistant → Auto-selected
   - Many assistants → Scrollable list

2. **Selection**
   - Select assistant → ID stored
   - Change selection → Updates
   - Clear selection → Shows required

3. **Validation**
   - No selection → Error shown
   - Deleted assistant → Not shown
   - Inactive assistant → Not shown

4. **Search**
   - Type name → Filters list
   - No matches → Shows message
   - Clear search → Shows all

5. **Quick Actions**
   - Click create → Opens form
   - Click preview → Shows config
   - Recently used → Sorted correctly

## UI Mockup Description
- Select component with:
  - Search input
  - Grouped sections (Recent, All)
  - Each option shows:
    - Assistant name
    - Source badge
    - Usage count
  - Selected shows check
- Empty state with:
  - Message
  - "Create Assistant" button
- Error state below field

## Definition of Ready
- [ ] Assistant directory complete
- [ ] Campaign form exists
- [ ] Selection component designed

## Definition of Done
- [ ] Selector shows all active assistants
- [ ] Search/filter working
- [ ] Selection required validation
- [ ] Assistant ID saved with campaign
- [ ] Empty state handled
- [ ] Quick actions functional
- [ ] Unit tests for validation
- [ ] Integration test for selection
- [ ] UI responsive
- [ ] Documentation updated

## Notes
- Consider favorite assistants
- May need bulk campaign creation
- Track selection patterns
- Consider assistant recommendations
- Add assistant preview modal