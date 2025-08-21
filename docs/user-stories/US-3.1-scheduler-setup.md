# US-3.1: Cron Scheduler Setup

## Story
**As a** system  
**I want to** automatically trigger call launches every 60 seconds  
**So that** campaigns progress without manual intervention

## Story Points
**3** (Medium complexity - cron setup, idempotency)

## Priority
**P0** - Critical (Core automation)

## Acceptance Criteria
1. **Cron Configuration**
   - Runs every 60 seconds (± jitter)
   - Configured in Vercel cron
   - Shared secret for authentication
   - Handles overlapping executions

2. **Scheduler Logic**
   - Identifies campaigns in QUEUED/RUNNING state
   - Respects concurrency caps
   - Processes multiple campaigns
   - Handles failures gracefully

3. **Idempotency**
   - Safe to run multiple times
   - No duplicate call creation
   - Atomic operations
   - Handles partial failures

4. **Performance**
   - Completes within 10 seconds
   - Processes 100 campaigns/tick
   - Efficient database queries
   - Minimal API calls

5. **Monitoring**
   - Logs execution start/end
   - Tracks calls launched
   - Records errors
   - Metrics for monitoring

## Technical Implementation Notes

### Vercel Cron Config
```json
// vercel.json
{
  "crons": [{
    "path": "/api/scheduler/tick",
    "schedule": "* * * * *"
  }]
}
```

### Scheduler Implementation
```typescript
export async function POST(req: Request) {
  // 1. Verify cron secret
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SHARED_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // 2. Add jitter
  const jitter = Math.random() * 10000; // 0-10s
  await sleep(jitter);
  
  // 3. Process campaigns
  const campaigns = await getActiveCampaigns();
  const results = {
    processed: 0,
    launched: 0,
    errors: []
  };
  
  for (const campaign of campaigns) {
    try {
      const launched = await processCampaign(campaign);
      results.launched += launched;
      results.processed++;
    } catch (error) {
      results.errors.push({ 
        campaignId: campaign.id, 
        error: error.message 
      });
    }
  }
  
  // 4. Log results
  await logSchedulerRun(results);
  
  return Response.json(results);
}
```

### Campaign Processing
```typescript
async function processCampaign(campaign: Campaign) {
  // 1. Get active call count
  const activeCalls = await getActiveCalls(campaign.id);
  
  // 2. Calculate room
  const room = campaign.cap - activeCalls;
  if (room <= 0) return 0;
  
  // 3. Get pending contacts
  const contacts = await getPendingContacts(campaign.id, room);
  
  // 4. Launch calls
  let launched = 0;
  for (const contact of contacts) {
    try {
      await createCall(campaign, contact);
      launched++;
    } catch (error) {
      // Log but continue
      console.error(`Failed to create call: ${error}`);
    }
  }
  
  return launched;
}
```

## Dependencies
- Database schema complete
- Vercel deployment configured

## Test Cases
1. **Execution**
   - Cron triggers → Handler runs
   - Invalid secret → 401 response
   - Valid secret → Processes

2. **Campaign Processing**
   - Active campaign → Calls launched
   - At cap → No new calls
   - No contacts → No calls

3. **Idempotency**
   - Run twice quickly → No duplicates
   - Partial failure → Others continue
   - Database error → Handled gracefully

4. **Performance**
   - 100 campaigns → <10 seconds
   - 1000 contacts → Processes in batches
   - Timeout approaching → Completes work

5. **Monitoring**
   - Execution logged → Metrics recorded
   - Errors logged → Debugging info
   - Success tracked → Calls launched

## UI Mockup Description
- Admin dashboard showing:
  - Last run timestamp
  - Calls launched count
  - Errors if any
  - Next run countdown
  - Manual trigger button

## Definition of Ready
- [ ] Cron service selected
- [ ] Secret strategy defined
- [ ] Performance targets set

## Definition of Done
- [ ] Cron configured in Vercel
- [ ] Handler processes campaigns
- [ ] Idempotency guaranteed
- [ ] Performance meets targets
- [ ] Monitoring implemented
- [ ] Error handling complete
- [ ] Unit tests written
- [ ] Integration tests pass
- [ ] Documentation updated
- [ ] Metrics dashboard created

## Notes
- Consider manual trigger endpoint
- May need rate limiting
- Track execution duration
- Consider queue-based approach later
- Add circuit breaker for failures