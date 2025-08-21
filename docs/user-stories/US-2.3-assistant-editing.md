# US-2.3: Edit Assistant Configuration

## Story
**As an** admin  
**I want to** edit existing assistant configurations  
**So that** I can refine and improve assistant behavior

## Story Points
**3** (Medium complexity - update flow, version tracking)

## Priority
**P1** - High (Operational flexibility)

## Acceptance Criteria
1. **Edit Interface**
   - Load current configuration in form
   - All fields editable except ID
   - Show last modified date
   - Save and Cancel buttons
   - Indication of unsaved changes

2. **Configuration Updates**
   - Update name (must remain unique)
   - Modify system prompt
   - Change voice selection
   - Adjust temperature
   - Update first message
   - Change model if needed

3. **Vapi Synchronization**
   - PATCH updates to Vapi
   - Handle partial updates
   - Sync confirmation
   - Rollback on failure

4. **Version Tracking**
   - Store previous config_json
   - Track who made changes
   - Timestamp all updates
   - Optional change notes

5. **Validation**
   - Cannot edit if campaigns running
   - Name uniqueness check
   - Warn if major changes
   - Confirm before save

## Technical Implementation Notes

### Update Flow
```typescript
interface UpdateAssistantRequest {
  name?: string;
  config?: Partial<AssistantConfig>;
  changeNotes?: string;
}

async function updateAssistant(
  id: string, 
  updates: UpdateAssistantRequest
) {
  // 1. Get current assistant
  const assistant = await db.assistants.findById(id);
  
  // 2. Check if editable
  const activeCampaigns = await checkActiveCampaigns(id);
  if (activeCampaigns > 0) {
    throw new Error('Cannot edit while campaigns active');
  }
  
  // 3. Update Vapi
  const vapiUpdate = transformToVapiFormat(updates);
  await vapiClient.patch(
    `/assistant/${assistant.provider_assistant_id}`,
    vapiUpdate
  );
  
  // 4. Update local
  await db.assistants.update(id, {
    name: updates.name || assistant.name,
    config_json: { ...assistant.config_json, ...updates.config },
    updated_at: new Date()
  });
  
  // 5. Log change
  await logAssistantChange(id, updates, changeNotes);
}
```

### Version History
```typescript
interface AssistantHistory {
  assistantId: string;
  previousConfig: object;
  newConfig: object;
  changedBy: string;
  changeNotes?: string;
  changedAt: Date;
}
```

## Dependencies
- US-2.1 (Assistant creation complete)
- Authentication system (for tracking who)

## Test Cases
1. **Happy Path**
   - Edit name → Updated everywhere
   - Edit prompt → Vapi updated
   - Multiple edits → All saved

2. **Validation**
   - Duplicate name → Error shown
   - Active campaign → Edit blocked
   - Invalid config → Rejected

3. **Vapi Sync**
   - Success → Local updated
   - Failure → No local change
   - Partial failure → Rollback

4. **Version History**
   - Edit made → History recorded
   - Multiple edits → All tracked
   - View history → Shows changes

## UI Mockup Description
- Same form as creation but:
  - Title: "Edit Assistant"
  - Current values pre-filled
  - "Last modified" timestamp
  - Change notes field
  - Dirty state indicator
  - Save/Cancel buttons
- Warning modal if campaigns active
- Success toast on save

## Definition of Ready
- [ ] Edit permissions defined
- [ ] Version strategy decided
- [ ] UI designs approved

## Definition of Done
- [ ] Edit form loads current data
- [ ] All fields update correctly
- [ ] Vapi sync working
- [ ] Validation rules enforced
- [ ] History tracking implemented
- [ ] Active campaign check works
- [ ] Unit tests complete
- [ ] Integration tests written
- [ ] UI responsive
- [ ] Documentation updated

## Notes
- Consider diff view for changes
- May need approval for major edits
- Track edit frequency metrics
- Consider scheduled updates
- Add revert capability