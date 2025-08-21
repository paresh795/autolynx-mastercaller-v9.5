# US-3.4: Real-time Status Tracking

## Story
**As an** operator  
**I want to** see call status updates in real-time  
**So that** I can monitor campaign progress without refreshing

## Story Points
**3** (Medium complexity - real-time subscriptions)

## Priority
**P0** - Critical (User experience essential)

## Acceptance Criteria
1. **Real-time Updates**
   - Call status changes appear within 2 seconds
   - Progress bars update automatically
   - No page refresh required
   - Multiple campaigns update simultaneously

2. **Dashboard Integration**
   - Campaign list shows live status
   - Campaign detail updates in real-time
   - Contact status updates immediately
   - Active call counts update

3. **Status Indicators**
   - Visual indicators for each status
   - Color coding for quick recognition
   - Animation for active states
   - Clear terminal state display

4. **Performance**
   - Updates don't cause UI lag
   - Efficient data transfer
   - Graceful degradation on slow networks
   - Reconnection on connection loss

5. **Subscription Management**
   - Subscribe when page loads
   - Unsubscribe when leaving
   - Handle multiple subscriptions
   - Clean up resources

## Technical Implementation Notes

### Supabase Real-time
```typescript
// Subscribe to call updates
const subscription = supabase
  .channel(`campaign-${campaignId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'calls',
      filter: `campaign_id=eq.${campaignId}`
    },
    handleCallUpdate
  )
  .subscribe();

function handleCallUpdate(payload: any) {
  const { new: call } = payload;
  updateCallInUI(call);
  recalculateMetrics(call.campaign_id);
}
```

### Frontend State Management
```typescript
interface CampaignState {
  calls: Map<string, Call>;
  metrics: CampaignMetrics;
  lastUpdate: Date;
}

function updateCallInUI(call: Call) {
  setCampaignState(prev => ({
    ...prev,
    calls: new Map(prev.calls).set(call.id, call),
    metrics: calculateMetrics(prev.calls),
    lastUpdate: new Date()
  }));
}
```

### Status Components
```typescript
function CallStatusBadge({ status }: { status: CallStatus }) {
  const config = {
    QUEUED: { color: 'blue', icon: 'clock', pulse: true },
    RINGING: { color: 'yellow', icon: 'phone', pulse: true },
    IN_PROGRESS: { color: 'green', icon: 'phone', pulse: true },
    ENDED: { color: 'gray', icon: 'check', pulse: false },
    FAILED: { color: 'red', icon: 'x', pulse: false }
  }[status];
  
  return (
    <Badge 
      color={config.color} 
      className={config.pulse ? 'animate-pulse' : ''}
    >
      <Icon name={config.icon} />
      {status}
    </Badge>
  );
}
```

## Dependencies
- US-3.3 (Webhook handler updating data)
- Real-time subscription service

## Test Cases
1. **Real-time Updates**
   - Call status changes → UI updates within 2s
   - Multiple calls → All update correctly
   - Campaign completes → Status changes

2. **Performance**
   - 100 active calls → No UI lag
   - Rapid updates → Batched efficiently
   - Network issues → Graceful handling

3. **Subscription Management**
   - Page load → Subscription active
   - Page unload → Subscription cleaned
   - Reconnect → Missing updates caught up

4. **Visual Feedback**
   - Each status → Correct color/icon
   - Active calls → Pulsing animation
   - Terminal calls → Static display

## UI Mockup Description
- Status badges with colors:
  - QUEUED: Blue with clock icon
  - RINGING: Yellow with phone icon
  - IN_PROGRESS: Green with phone icon
  - ENDED: Gray with check icon
  - FAILED: Red with X icon
- Pulsing animation for active states
- Real-time counters updating
- "Live" indicator in header

## Definition of Ready
- [ ] Real-time service selected
- [ ] Status colors approved
- [ ] Performance targets set

## Definition of Done
- [ ] Real-time updates working
- [ ] All status types handled
- [ ] Performance meets targets
- [ ] Subscription management robust
- [ ] Visual indicators implemented
- [ ] Unit tests for components
- [ ] Integration tests for subscriptions
- [ ] Performance tested
- [ ] Documentation updated

## Notes
- Consider WebSocket fallback
- Monitor subscription costs
- Track update latency
- Consider batching updates
- Add offline indicator