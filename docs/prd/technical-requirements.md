# AutoLynx PRD — Technical Requirements

> **Version:** 1.0  
> **Related:** [Overview](./overview.md) | [API Spec](./api-spec.md) | [Data Model](./data-model.md) | [Deployment](./deployment.md)

---

## Functional Requirements

### FR-1 Authentication & Authorization
- **Supabase Auth** with allowlist table/metadata guards for sign-in
- **Roles**: Admin/Operator with route-level access controls
- **Security**: least privilege DB keys in server routes

### FR-2 CSV Import & Validation
- **Required headers** (case-insensitive): `name`, `business_name`, `phone`
- **Phone normalization** to E.164 format (auto-add `+` when clear)
- **Streaming parser** for large files
- **Error handling**: skip invalid rows with detailed reasons
- **Deduplication** on `(campaign_id, phone)`

### FR-3 Assistant Directory Management
- **Create local assistant**: call Vapi `POST /assistant` once; store `provider_assistant_id`, `config_json`, `active`, `ephemeral=false`
- **Import existing assistant** by `provider_assistant_id`
- **Edit assistants**: PATCH both Vapi and local `config_json`
- **Delete assistants**: only if not referenced by active campaigns
- **Campaign integration**: require selecting registered assistant (dropdown from Directory)
- **No auto-deletes** in call flows

### FR-4 Campaign Lifecycle Management
- **State machine**: `CREATED → QUEUED → DIALING → RUNNING → COMPLETED`
- **Operational states**: `PAUSED`, `FAILED`
- **Truthful starting**: only mark "Started" after first successful call creation
- **Progress tracking**: real-time counters and status updates

### FR-5 Concurrency & Scheduling
- **Global cap per campaign**: default 8, configurable
- **Cron-driven execution**: default 60s ± jitter
- **Room calculation**: launch up to `cap - active_calls` new calls per tick
- **Two modes**: Continuous Cap (default) vs Strict Batching

### FR-6 Provider Integration (Vapi)
- **Call creation**: `POST /call` with `{customer.number, customer.name, phoneNumberId, assistantId}`
- **Status tracking**: webhook-driven updates with `provider_call_id` persistence
- **Data capture**: timestamps, cost, ended reason, recording URL, transcript JSON
- **Status mapping**: provider statuses → internal enum `{QUEUED,RINGING,IN_PROGRESS,ENDED,FAILED,CANCELED,TIMEOUT}`

### FR-7 Dashboard & Monitoring
- **Campaign list**: progress bars + live counters
- **Campaign detail**: paginated contacts/calls with filtering
- **Health indicators**: phone-line activity badge
- **Real-time updates**: DB subscription for live progress
- **Export functionality**: streamed CSV from campaign detail

### FR-8 Observability & Audit
- **Immutable events**: `call_events` append-only table
- **Structured logging**: consistent format across all operations
- **Error tracking**: comprehensive error capture and reporting
- **Event sourcing**: complete audit trail for all state changes

### FR-9 Data Export
- **Streamed CSV export** from campaign detail view
- **Complete data**: `name,business_name,phone,status,ended_reason,cost,recording_url,transcript_json`
- **Performance**: handle large datasets without memory issues

## Non-Functional Requirements

### Performance
- **Page load**: P95 < 2s
- **Campaign start**: first batch dialing within 60s of Start button
- **Real-time updates**: < 1s latency for status changes
- **Export**: streaming for large datasets

### Reliability
- **Error recovery**: retries on 429/5xx with backoff (1s→4s→10s)
- **Uptime target**: ≥95% transient error recovery
- **Webhook resilience**: handle missed events via reconciliation
- **Timeout handling**: 10m silence threshold for call timeouts

### Security
- **Secret management**: all secrets server-side only
- **Webhook verification**: shared secret validation
- **Database access**: least privilege keys in server routes
- **PII protection**: minimal PII storage; redacted logs

### Privacy & Compliance
- **Data minimization**: store only required PII
- **Transcript storage**: inline JSON (encrypted at rest via Supabase)
- **Log sanitization**: redact PII from all log outputs
- **Data retention**: configurable retention policies

### Cost Management
- **Concurrency limits**: default cap=8 with configurable overrides
- **Spend monitoring**: soft per-campaign spend alerts (admin visible)
- **Rate limiting**: respect provider limits with backoff
- **Resource optimization**: efficient DB queries and caching

## Integration Requirements

### Vapi API Integration
- **Authentication**: API key-based
- **Rate limiting**: respect provider limits
- **Webhook handling**: secure endpoint with signature verification
- **Error handling**: comprehensive status code handling

### Supabase Integration
- **Authentication**: built-in Auth with allowlist
- **Database**: Postgres with optimized schema
- **Real-time**: subscriptions for live dashboard updates
- **Security**: RLS policies and secure API keys

### Vercel Integration
- **Deployment**: App Router with API routes
- **Cron**: scheduled function for campaign management
- **Environment**: secure secret management
- **Performance**: optimized for serverless execution 