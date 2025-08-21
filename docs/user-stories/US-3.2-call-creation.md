# US-3.2: Call Creation with Vapi

## Story
**As a** system  
**I want to** create calls through the Vapi API  
**So that** contacts are called according to campaign configuration

## Story Points
**5** (High complexity - API integration, error handling)

## Priority
**P0** - Critical (Core calling functionality)

## Acceptance Criteria
1. **Call Creation**
   - POST to Vapi /call endpoint
   - Include customer details (name, phone)
   - Use campaign's assistant ID
   - Use configured phone number
   - Store provider_call_id

2. **Error Handling**
   - Retry on transient failures (429, 503)
   - Exponential backoff (1s, 4s, 10s)
   - Mark failed after max retries
   - Clear error logging

3. **Data Persistence**
   - Create call record before API call
   - Update with provider_call_id on success
   - Set initial status to QUEUED
   - Track attempt count

4. **Campaign State**
   - Mark campaign STARTED on first call
   - Update campaign started_at
   - Increment active call count
   - Track total calls created

5. **Rate Limiting**
   - Respect Vapi rate limits
   - Queue calls if needed
   - Spread calls over time
   - Monitor API quota

## Technical Implementation Notes

### Vapi Call Creation
```typescript
interface VapiCallRequest {
  assistant: string; // assistant ID
  customer: {
    number: string;
    name?: string;
    extension?: string;
  };
  phoneNumber: string; // phone number ID
  metadata?: Record<string, any>;
}

async function createCall(
  campaign: Campaign,
  contact: Contact
): Promise<Call> {
  // 1. Create local record
  const call = await db.calls.create({
    campaign_id: campaign.id,
    contact_id: contact.id,
    status: 'QUEUED',
    created_at: new Date()
  });
  
  try {
    // 2. Call Vapi
    const vapiCall = await retryWithBackoff(
      () => vapiClient.post('/call', {
        assistant: campaign.assistant_id,
        customer: {
          number: contact.phone,
          name: contact.name
        },
        phoneNumber: campaign.phone_number_id,
        metadata: {
          campaignId: campaign.id,
          contactId: contact.id,
          callId: call.id
        }
      }),
      { maxRetries: 3, initialDelay: 1000 }
    );
    
    // 3. Update with provider ID
    await db.calls.update(call.id, {
      provider_call_id: vapiCall.id,
      status: mapVapiStatus(vapiCall.status)
    });
    
    // 4. Update campaign if first call
    if (!campaign.started_at) {
      await db.campaigns.update(campaign.id, {
        started_at: new Date(),
        status: 'DIALING'
      });
    }
    
    return call;
    
  } catch (error) {
    // 5. Handle failure
    await db.calls.update(call.id, {
      status: 'FAILED',
      ended_reason: error.message
    });
    throw error;
  }
}
```

### Retry Logic
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error;
  const delays = [1000, 4000, 10000];
  
  for (let i = 0; i <= options.maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!isRetryable(error) || i === options.maxRetries) {
        throw error;
      }
      
      await sleep(delays[i] || 10000);
    }
  }
  
  throw lastError;
}

function isRetryable(error: any): boolean {
  const retryableCodes = [429, 503, 504];
  return retryableCodes.includes(error.status);
}
```

## Dependencies
- US-3.1 (Scheduler triggers creation)
- Vapi API credentials
- Assistant and phone number configured

## Test Cases
1. **Success Path**
   - Valid request → Call created
   - Provider ID → Stored locally
   - First call → Campaign started

2. **Retry Logic**
   - 429 response → Retries with backoff
   - Success on retry → Call created
   - Max retries → Marked failed

3. **Error Handling**
   - 400 Bad Request → No retry
   - 401 Unauthorized → No retry
   - Network timeout → Retries

4. **Data Integrity**
   - Local record → Always created
   - API fails → Status updated
   - Partial success → Consistent state

5. **Rate Limiting**
   - Many calls → Spread over time
   - Rate limit hit → Backs off
   - Quota exceeded → Stops gracefully

## UI Mockup Description
N/A - Backend service

## Definition of Ready
- [ ] Vapi API docs reviewed
- [ ] Rate limits understood
- [ ] Retry strategy approved

## Definition of Done
- [ ] Call creation working
- [ ] Retry logic implemented
- [ ] Error handling complete
- [ ] Provider ID stored
- [ ] Campaign state updated
- [ ] Rate limiting handled
- [ ] Unit tests written
- [ ] Integration tests with mock
- [ ] Performance tested
- [ ] Documentation updated

## Notes
- Monitor API usage closely
- Consider fallback providers
- Track success rates
- Implement circuit breaker
- Add call cost estimation