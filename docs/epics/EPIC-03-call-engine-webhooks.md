# EPIC-03: Call Engine & Webhooks

## Epic Overview
Build the core calling engine that manages call creation, scheduling, status tracking through webhooks, and concurrency control to ensure reliable and efficient outbound calling operations.

## Business Value
- Enables automated outbound calling at scale
- Provides real-time call status visibility
- Ensures system stays within provider limits
- Maintains accurate call state through webhook events
- Supports both continuous and batch calling modes

## Success Criteria
- [ ] Scheduler launches calls every 60 seconds via cron
- [ ] Concurrent calls never exceed configured cap (default 8)
- [ ] Webhook events update call status in real-time
- [ ] Campaign marked "Started" only after first successful call
- [ ] Stuck calls timeout after 10 minutes of no events
- [ ] Both continuous and batch modes function correctly

## User Stories
- **US-3.1**: Cron Scheduler Setup
- **US-3.2**: Call Creation with Vapi
- **US-3.3**: Webhook Handler Implementation
- **US-3.4**: Real-time Status Tracking
- **US-3.5**: Call Events Audit Log
- **US-3.6**: Concurrency Control Logic

## Technical Components
- Vercel Cron configuration for scheduler
- Vapi call creation API integration
- Webhook endpoint with secret validation
- Database transactions for atomic updates
- Call status state machine
- Concurrency tracking system

## Dependencies
- Campaign and contact data models implemented
- Assistant Directory functional
- Vapi API credentials and phone number configured
- Database schema for calls and events

## Acceptance Tests
1. Start campaign → First call created within 60 seconds
2. Reach concurrency cap → No additional calls created
3. Receive webhook → Call status updated in database
4. Call stuck for 10 minutes → Marked as TIMEOUT
5. Continuous mode → Maintains cap continuously
6. Batch mode → Waits for batch completion
7. Invalid webhook secret → Request rejected

## Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Missed webhooks | High | Reconciliation on scheduler tick |
| Rate limiting | High | Respect cap, implement backoff |
| Webhook replay attacks | Medium | Idempotent operations, timestamp validation |
| Cron failures | High | Monitoring, manual trigger backup |
| Database deadlocks | Medium | Optimistic locking, retry logic |

## Definition of Done
- Scheduler runs reliably every 60 seconds
- Call creation respects concurrency limits
- Webhook handler processes all event types
- Call status transitions are atomic
- Event log captures complete history
- Both concurrency modes tested
- Performance meets requirements for 1000 concurrent campaigns

## Metrics
- Calls created per minute
- Webhook processing latency
- Call status accuracy vs provider
- Timeout rate for stuck calls
- Scheduler execution success rate
- Average time to first call

## Notes
This epic contains the most critical system functionality. The reliability of the call engine directly impacts user trust and system effectiveness. Special attention must be paid to webhook reliability, concurrency control accuracy, and error recovery mechanisms.