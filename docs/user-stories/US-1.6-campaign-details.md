# US-1.6: Campaign Detail View

## Story
**As an** operator  
**I want to** view detailed information about a specific campaign  
**So that** I can monitor progress and access individual contact outcomes

## Story Points
**3** (Medium complexity - complex UI, real-time data)

## Priority
**P0** - Critical (Core monitoring functionality)

## Acceptance Criteria
1. **Campaign Overview**
   - Campaign name and ID
   - Status with visual indicator
   - Created/Started/Completed timestamps
   - Assistant name and configuration
   - Phone number being used
   - Concurrency cap and mode

2. **Progress Metrics**
   - Total contacts count
   - Calls completed/in-progress/queued
   - Success rate percentage
   - Average call duration
   - Total cost accumulated
   - Real-time active calls count

3. **Contact List**
   - Paginated table of all contacts
   - Status per contact (Pending, Calling, Completed)
   - Call outcome (Answered, Voicemail, Failed)
   - Duration and cost per call
   - Link to recording/transcript
   - Search/filter contacts

4. **Actions**
   - Start/Stop campaign buttons
   - Export results (CSV)
   - View call details modal
   - Play recording inline
   - View transcript

5. **Real-time Updates**
   - Status changes reflect immediately
   - Progress bars update live
   - New call events appear
   - No page refresh needed

## Technical Implementation Notes

### API Endpoints
```typescript
// GET /api/campaigns/:id
interface CampaignDetail {
  campaign: Campaign;
  metrics: CampaignMetrics;
  recentEvents: CallEvent[];
}

// GET /api/campaigns/:id/contacts
interface ContactListRequest {
  page: number;
  limit: number;
  status?: CallStatus;
  search?: string;
}

interface ContactWithCall {
  contact: Contact;
  call?: Call;
  outcome?: CallOutcome;
}
```

### Real-time Architecture
```typescript
// Subscribe to campaign-specific channel
const channel = supabase
  .channel(`campaign-${campaignId}`)
  .on('postgres_changes',
    { 
      event: '*', 
      schema: 'public', 
      table: 'calls',
      filter: `campaign_id=eq.${campaignId}`
    },
    handleCallUpdate
  )
  .subscribe();
```

### Performance Optimization
- Lazy load contact list
- Cache campaign metrics
- Pagination for contacts
- Virtual scrolling for large lists

## Dependencies
- US-1.5 (Campaign list for navigation)
- US-3.4 (Status tracking system)

## Test Cases
1. **Display**
   - Valid campaign ID → Shows details
   - Invalid ID → 404 error
   - No calls yet → Shows empty state

2. **Metrics**
   - 50% complete → Progress bar at 50%
   - Costs accumulate → Total updates
   - Duration tracked → Average calculated

3. **Contact List**
   - 1000 contacts → Pagination works
   - Search "John" → Filters correctly
   - Status filter → Shows matching only

4. **Real-time**
   - Call starts → Status changes
   - Call ends → Outcome appears
   - Cost updates → Total increases

5. **Actions**
   - Start campaign → Status changes
   - Export → CSV downloads
   - View transcript → Modal opens

## UI Mockup Description
- Header with campaign name and status
- Metrics cards in grid layout
- Progress bar prominent
- Tabs: Overview, Contacts, Analytics
- Contacts table with:
  - Name, Business, Phone
  - Status badge
  - Outcome
  - Duration/Cost
  - Actions dropdown
- Export button in header
- Real-time indicator

## Definition of Ready
- [ ] Campaign model complete
- [ ] Call tracking implemented
- [ ] UI designs approved

## Definition of Done
- [ ] Detail page displays all data
- [ ] Metrics calculate correctly
- [ ] Contact list paginated
- [ ] Search/filter working
- [ ] Real-time updates functional
- [ ] Export generates CSV
- [ ] Recordings playable
- [ ] Transcripts viewable
- [ ] Responsive design
- [ ] Loading states handled
- [ ] Error states covered
- [ ] Tests written
- [ ] Documentation updated

## Notes
- Consider caching strategy for metrics
- May need bulk contact actions
- Track page view analytics
- Consider WebSocket vs polling
- Add breadcrumb navigation