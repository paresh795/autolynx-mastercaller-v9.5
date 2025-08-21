# US-2.4: Assistant Templates Library

## Story
**As an** operator  
**I want to** use pre-configured assistant templates  
**So that** I can quickly create campaigns with proven conversation flows

## Story Points
**3** (Medium complexity - template system, seeding)

## Priority
**P2** - Medium (Enhances usability)

## Acceptance Criteria
1. **Template Library**
   - At least 3 templates available:
     - Voicemail-friendly
     - Short pitch
     - Discovery call
   - Templates marked with icon/badge
   - Description of use case
   - Cannot be deleted

2. **Template Usage**
   - "Use Template" button
   - Opens creation form pre-filled
   - User must provide new name
   - Can modify any settings
   - Creates new assistant (not linked to template)

3. **Template Seeding**
   - Seeds on first deployment
   - Migration script included
   - Templates marked as source='template'
   - Read-only in directory

4. **Template Details**
   - Show template description
   - Example use cases
   - Success metrics (if available)
   - Preview of prompt

5. **Clone Operation**
   - Deep copy of configuration
   - New Vapi assistant created
   - No reference to template
   - User owns new assistant

## Technical Implementation Notes

### Template Structure
```typescript
interface AssistantTemplate {
  id: string;
  name: string;
  description: string;
  useCase: string;
  config: AssistantConfig;
  metrics?: {
    avgDuration?: number;
    successRate?: number;
  };
}

const templates: AssistantTemplate[] = [
  {
    id: 'voicemail-friendly',
    name: 'Voicemail Optimizer',
    description: 'Leaves concise, effective voicemails',
    useCase: 'High voicemail rate scenarios',
    config: {
      systemPrompt: 'You are leaving a voicemail...',
      maxDuration: 1,
      temperature: 0.7,
      // ... full config
    }
  },
  // ... more templates
];
```

### Clone Function
```typescript
async function cloneTemplate(
  templateId: string,
  newName: string,
  modifications?: Partial<AssistantConfig>
) {
  // 1. Get template
  const template = await db.assistants.findOne({
    source: 'template',
    id: templateId
  });
  
  // 2. Merge modifications
  const config = {
    ...template.config_json,
    ...modifications,
    name: newName
  };
  
  // 3. Create new assistant
  return createAssistant(config);
}
```

### Database Seeding
```sql
-- Migration: seed_assistant_templates.sql
INSERT INTO assistants (
  name, source, provider_assistant_id, 
  config_json, active, ephemeral
) VALUES 
  ('Voicemail Template', 'template', 'temp-vm-001', '{...}', true, false),
  ('Short Pitch Template', 'template', 'temp-sp-001', '{...}', true, false),
  ('Discovery Template', 'template', 'temp-dc-001', '{...}', true, false);
```

## Dependencies
- US-2.1 (Assistant creation)
- Database migration system

## Test Cases
1. **Template Display**
   - Templates shown in directory
   - Marked differently from regular
   - Cannot be deleted

2. **Clone Operation**
   - Clone template → New assistant
   - Modify during clone → Changes saved
   - Name required → Validation works

3. **Seeding**
   - Fresh install → Templates present
   - Re-run seed → No duplicates
   - Templates have valid configs

4. **Usage**
   - Use template → Form pre-filled
   - Save → Creates new assistant
   - Original template unchanged

## UI Mockup Description
- Template section in directory
- Template cards with:
  - Icon indicating template
  - Name and description
  - Use case tags
  - "Use Template" button
  - Preview link
- Clone modal with:
  - New name input (required)
  - Pre-filled config form
  - Option to modify
  - Create button

## Definition of Ready
- [ ] Template configs defined
- [ ] Use cases documented
- [ ] Seeding strategy approved

## Definition of Done
- [ ] Templates seeded in database
- [ ] Templates display in UI
- [ ] Clone functionality works
- [ ] New assistant created correctly
- [ ] Vapi integration tested
- [ ] Templates cannot be deleted
- [ ] Unit tests for cloning
- [ ] Integration tests complete
- [ ] UI polished
- [ ] Documentation includes templates

## Notes
- Consider community templates later
- Track template usage metrics
- May need template updates
- Consider A/B testing templates
- Add industry-specific templates