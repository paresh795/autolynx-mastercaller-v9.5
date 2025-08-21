# US-1.3: Campaign Creation Flow

## Story
**As an** operator  
**I want to** create a calling campaign with my uploaded contacts  
**So that** I can organize and configure calling parameters

## Story Points
**3** (Medium complexity - form handling, database operations)

## Priority
**P0** - Critical (Core functionality)

## Acceptance Criteria
1. **Campaign Configuration**
   - Name field: Required, max 100 characters
   - Assistant selection: Dropdown of available assistants (required)
   - Phone number selection: Available phone numbers from Vapi
   - Concurrency cap: Numeric input (1-50, default 8)
   - Mode selection: Radio buttons for Continuous/Batch

2. **Assistant Selection**
   - Dropdown shows assistant name and type
   - Only active assistants displayed
   - Link to create new assistant if needed
   - Selected assistant ID stored with campaign

3. **Validation**
   - All required fields must be filled
   - Campaign name must be unique
   - Selected assistant must exist and be active
   - Cap must be within allowed range

4. **Creation Process**
   - Loading state during creation
   - Success message with campaign ID
   - Redirect to campaign detail page
   - Rollback on any failure

5. **Data Association**
   - Uploaded contacts linked to campaign
   - Campaign settings persisted
   - Creation timestamp recorded

## Technical Implementation Notes

### Data Model
```typescript
interface CampaignCreation {
  name: string;
  assistantId: string;
  phoneNumberId: string;
  cap: number;
  mode: 'continuous' | 'batch';
  contactsCsvSession?: string; // From upload
}

interface Campaign {
  id: string;
  name: string;
  assistantId: string;
  phoneNumberId: string;
  cap: number;
  mode: CampaignMode;
  totalContacts: number;
  createdAt: Date;
  status: 'CREATED';
}
```

### API Endpoint
- `POST /api/campaigns`
- Multipart if CSV included
- JSON body for configuration
- Returns campaign ID and summary

### Database Operations
1. Begin transaction
2. Create campaign record
3. Insert contacts with campaign_id
4. Update campaign.total_contacts
5. Commit or rollback

## Dependencies
- US-1.1 (CSV upload)
- US-1.2 (Validation complete)
- US-2.5 (Assistant selection available)

## Test Cases
1. **Happy Path**
   - All fields valid → Campaign created
   - 1000 contacts → Links correctly

2. **Validation Errors**
   - Missing name → Error: "Name required"
   - No assistant → Error: "Select assistant"
   - Cap = 100 → Error: "Max cap is 50"

3. **Edge Cases**
   - Duplicate name → Error with suggestion
   - Assistant deleted mid-flow → Error handled
   - Network failure → Transaction rolled back

4. **Mode Selection**
   - Continuous selected → Saved correctly
   - Batch selected → Saved correctly

## UI Mockup Description
- Form with clear sections
- Campaign name input at top
- Assistant dropdown with search
- Phone number selector
- Concurrency cap with helper text
- Mode selection with explanations
- Contact summary from upload
- Create button (disabled until valid)
- Loading overlay during creation

## Definition of Ready
- [ ] Assistant directory implemented
- [ ] Phone number list available
- [ ] Campaign model defined

## Definition of Done
- [ ] Form validates all inputs
- [ ] Campaign created in database
- [ ] Contacts associated correctly
- [ ] Success/error handling complete
- [ ] Unit tests for validation
- [ ] Integration test for creation
- [ ] Responsive design
- [ ] Documentation updated

## Notes
- Consider campaign templates for future
- May need approval workflow later
- Track creation metrics
- Consider draft/published states