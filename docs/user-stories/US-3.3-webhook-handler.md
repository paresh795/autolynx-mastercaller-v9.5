# US-3.3: Webhook Handler Implementation

## Story
**As a** system  
**I want to** receive and process Vapi webhook events  
**So that** call status updates are reflected in real-time

## Story Points
**5** (High complexity - webhook security, event processing)

## Priority
**P0** - Critical (Real-time updates essential)

## Acceptance Criteria
1. **Webhook Endpoint**
   - POST /api/webhooks/vapi
   - Verify webhook secret
   - Parse Vapi event payload
   - Return 200 OK quickly

2. **Security**
   - Validate shared secret header
   - Reject unauthorized requests
   - Prevent replay attacks
   - Log security violations

3. **Event Processing**
   - Map Vapi events to internal status
   - Update call records atomically
   - Create immutable event log
   - Handle unknown event types

4. **Status Mapping**
   - call.queued → QUEUED
   - call.ringing → RINGING
   - call.answered → IN_PROGRESS
   - call.ended → ENDED
   - call.failed → FAILED

5. **Campaign Updates**
   - Recalculate active calls
   - Mark campaign complete if done
   - Update progress metrics
   - Trigger UI updates

## Technical Implementation Notes

### Webhook Handler
```typescript
export async function POST(req: Request) {
  // 1. Verify secret
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== process.env.WEBHOOK_SHARED_SECRET) {
    console.warn('Invalid webhook secret');
    return new Response('Unauthorized', { status: 401 });
  }
  
  // 2. Parse payload
  const event = await req.json() as VapiWebhookEvent;
  
  // 3. Process asynchronously
  try {
    await processWebhookEvent(event);
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Return 200 to prevent retries for known errors
    return new Response('Error', { status: 500 });
  }
}

async function processWebhookEvent(event: VapiWebhookEvent) {
  const { type, call } = event;
  
  // 1. Find local call
  const localCall = await db.calls.findOne({
    provider_call_id: call.id
  });
  
  if (!localCall) {
    console.warn(`Call not found: ${call.id}`);
    return;
  }
  
  // 2. Map status
  const newStatus = mapVapiStatus(type, call.status);
  
  // 3. Update in transaction
  await db.transaction(async (tx) => {
    // Update call
    await tx.calls.update(localCall.id, {
      status: newStatus,
      ended_at: call.endedAt ? new Date(call.endedAt) : null,
      ended_reason: call.endedReason,
      cost_usd: call.cost,
      recording_url: call.recordingUrl,
      transcript_json: call.transcript,
      last_status_at: new Date()
    });
    
    // Log event
    await tx.call_events.create({
      call_id: localCall.id,
      status: newStatus,
      payload: event,
      created_at: new Date()
    });
    
    // Update campaign if terminal
    if (isTerminalStatus(newStatus)) {
      await updateCampaignProgress(tx, localCall.campaign_id);
    }
  });
}
```

### Status Mapping
```typescript
function mapVapiStatus(
  eventType: string, 
  callStatus?: string
): CallStatus {
  switch (eventType) {
    case 'call.started':
      return 'QUEUED';
    case 'call.ringing':
      return 'RINGING';
    case 'call.answered':
      return 'IN_PROGRESS';
    case 'call.ended':
      return 'ENDED';
    case 'call.failed':
      return 'FAILED';
    default:
      return 'QUEUED'; // fallback
  }
}

function isTerminalStatus(status: CallStatus): boolean {
  return ['ENDED', 'FAILED', 'CANCELED', 'TIMEOUT'].includes(status);
}
```

### Campaign Progress Update
```typescript
async function updateCampaignProgress(
  tx: Transaction,
  campaignId: string
) {
  // Get active call count
  const activeCalls = await tx.calls.count({
    where: {
      campaign_id: campaignId,
      status: { in: ['QUEUED', 'RINGING', 'IN_PROGRESS'] }
    }
  });
  
  // If no active calls, mark complete
  if (activeCalls === 0) {
    const totalCalls = await tx.calls.count({
      where: { campaign_id: campaignId }
    });
    
    if (totalCalls > 0) {
      await tx.campaigns.update(campaignId, {
        status: 'COMPLETED',
        completed_at: new Date()
      });
    }
  }
}
```

## Dependencies
- Vapi webhook configuration
- Database schema for events

## Test Cases
1. **Security**
   - Valid secret → Processes event
   - Invalid secret → 401 response
   - Missing secret → 401 response

2. **Event Processing**
   - Known event type → Status updated
   - Unknown event → Logged, ignored
   - Malformed payload → Error logged

3. **Status Updates**
   - call.started → QUEUED
   - call.ended → ENDED
   - Multiple events → Final status correct

4. **Campaign Updates**
   - Last call ends → Campaign complete
   - Still active calls → Campaign running
   - No calls yet → No update

5. **Error Handling**
   - Call not found → Logged, no error
   - Database error → Logged, 500
   - Duplicate event → Idempotent

## UI Mockup Description
N/A - Backend webhook handler

## Definition of Ready
- [ ] Webhook format documented
- [ ] Security requirements clear
- [ ] Event types mapped

## Definition of Done
- [ ] Webhook handler processes events
- [ ] Security validation working
- [ ] Status mapping correct
- [ ] Event log created
- [ ] Campaign progress updated
- [ ] Error handling complete
- [ ] Unit tests written
- [ ] Integration tests with mock
- [ ] Performance tested
- [ ] Documentation updated

## Notes
- Consider idempotency keys
- Monitor webhook failures
- Track processing latency
- Consider webhook queuing
- Add event replay capability