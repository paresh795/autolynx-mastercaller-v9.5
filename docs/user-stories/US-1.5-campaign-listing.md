# US-1.5: Campaign List View

## Story
**As an** operator  
**I want to** see a list of all campaigns with their current status  
**So that** I can monitor and manage multiple campaigns efficiently

## Story Points
**2** (Low complexity - basic CRUD read operation)

## Priority
**P0** - Critical (Primary navigation)

## Acceptance Criteria
1. **Campaign Display**
   - Show campaign name
   - Display creation date
   - Show total contacts count
   - Current status (Created, Running, Completed, etc.)
   - Progress indicator (X of Y contacts called)
   - Active calls count for running campaigns

2. **Sorting & Filtering**
   - Sort by: Name, Created date, Status
   - Filter by: Status (Active, Completed, All)
   - Search by campaign name
   - Default sort: Most recent first

3. **Actions**
   - Click campaign name → Navigate to detail view
   - Start button (for Created campaigns)
   - Stop button (for Running campaigns)
   - Export button (for Completed campaigns)

4. **Real-time Updates**
   - Status updates without refresh
   - Progress bars update live
   - Active call counts update

5. **Pagination**
   - 25 campaigns per page
   - Page navigation controls
   - Show total campaign count

## Technical Implementation Notes

### API Endpoint
```typescript
// GET /api/campaigns
interface CampaignListRequest {
  page?: number;
  limit?: number;
  sort?: 'name' | 'created' | 'status';
  order?: 'asc' | 'desc';
  status?: 'all' | 'active' | 'completed';
  search?: string;
}

interface CampaignListResponse {
  campaigns: CampaignSummary[];
  total: number;
  page: number;
  pages: number;
}

interface CampaignSummary {
  id: string;
  name: string;
  status: CampaignStatus;
  totalContacts: number;
  calledContacts: number;
  activeCalls: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
```

### Real-time Subscriptions
```typescript
// Supabase real-time
const subscription = supabase
  .channel('campaigns')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'campaigns' },
    handleCampaignUpdate
  )
  .subscribe();
```

### Query Optimization
- Index on status, created_at
- Aggregate queries for counts
- Materialized view for summaries

## Dependencies
- Database schema implemented
- Campaign status tracking functional

## Test Cases
1. **Display**
   - 0 campaigns → Empty state shown
   - 1 campaign → Displayed correctly
   - 100 campaigns → Pagination works

2. **Sorting**
   - Sort by name → Alphabetical order
   - Sort by date → Chronological order
   - Sort by status → Grouped correctly

3. **Filtering**
   - Filter active → Only running shown
   - Search "test" → Matching campaigns shown
   - Clear filters → All campaigns shown

4. **Real-time**
   - Start campaign → Status updates
   - Call completes → Progress updates
   - Campaign completes → Status changes

5. **Actions**
   - Click name → Routes to detail
   - Click start → Campaign starts
   - Click export → Download begins

## UI Mockup Description
- Table/card layout toggle
- Search bar at top
- Filter buttons/dropdown
- Campaign cards/rows with:
  - Name (link)
  - Status badge
  - Progress bar
  - Contact counts
  - Action buttons
- Pagination at bottom
- Empty state with CTA

## Definition of Ready
- [ ] Campaign states defined
- [ ] UI design approved
- [ ] Real-time strategy decided

## Definition of Done
- [ ] List displays all campaigns
- [ ] Sorting works correctly
- [ ] Filtering functional
- [ ] Search implemented
- [ ] Pagination working
- [ ] Real-time updates working
- [ ] Actions trigger correctly
- [ ] Responsive design
- [ ] Loading states handled
- [ ] Empty state designed
- [ ] Tests written
- [ ] Documentation updated

## Notes
- Consider saved filters/views
- May need bulk actions later
- Track view metrics
- Consider infinite scroll vs pagination
- Add export of campaign list