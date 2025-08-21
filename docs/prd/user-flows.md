# AutoLynx PRD — User Flows & Stories

> **Version:** 1.0  
> **Related:** [Overview](./overview.md) | [Technical Requirements](./technical-requirements.md) | [Data Model](./data-model.md)

---

## Core User Flows

### 4.1 CSV → Campaign Flow

1. **Upload CSV** → server streams parse + validates headers; normalize phone → `contacts` inserted (dedupe on `(campaign_id, phone)`)
2. **Create Campaign** with `assistant_id`, `phone_number_id`, `cap`, `mode`
3. **Return Import Report** `{accepted, skipped[{row, reason}]}` + `campaignId`

### 4.2 Start Campaign Flow

1. User clicks **Start** → campaign state `QUEUED`
2. Next **cron tick** (default 60s) launches up to `cap - active` calls using the campaign's selected **assistant**
3. On first successful `POST /call`, persist `provider_call_id` → set `started_at` and state `DIALING` (aka **Started**)

### 4.3 Dialing & Status Tracking

- **Truth source**: Vapi **webhooks** update per‑call status → `calls` + immutable `call_events` rows
- Dashboard subscribes to DB updates for real-time progress
- If a call sees no event for **10m**, mark `TIMEOUT` and continue

### 4.4 Concurrency Management

#### Mode A — Continuous Cap (Default)
Keep `active_calls ≤ cap`; each tick fills available room.

#### Mode B — Strict Batching (Optional)
Only start batch *N+1* after *all* batch *N* calls are terminal (per our DB events).

#### Optional Line-Quiet Gating
Phone‑number activity must be zero before new calls (can be enabled per campaign); otherwise health check only.

### 4.5 Campaign Completion & Export

- When all contacts have terminal calls → mark `COMPLETED`
- Provide **Export CSV** with: `name,business_name,phone,status,ended_reason,cost,recording_url,transcript_json`

## User Stories

### Operator Stories

**As an Operator, I want to:**
- Upload a CSV file with contact information and see immediate validation feedback
- Select from available assistants when creating a campaign  
- Start a campaign and see truthful "Started" status only after calls begin
- Monitor live progress with accurate counters and per-contact outcomes
- Export complete results including recordings and transcripts

### Admin Stories

**As an Admin, I want to:**
- Manage the allowlist of users who can access the system
- Create and manage persistent assistants in the directory
- Configure global settings like concurrency caps and cron cadence
- Monitor system health and phone line activity
- Set up cost guardrails and spending alerts

## State Transitions

### Campaign States
`CREATED → QUEUED → DIALING → RUNNING → COMPLETED`

**Operational States:** `PAUSED`, `FAILED`

### Call States
`QUEUED → RINGING → IN_PROGRESS → ENDED`

**Additional States:** `FAILED`, `CANCELED`, `TIMEOUT`

## Edge Cases & Error Handling

- **Invalid CSV data**: Skip rows with clear error messages
- **Provider rate limits**: Respect caps with backoff and jitter
- **Missed webhooks**: Reconcile on next cron tick; timeout after 10m silence
- **Network failures**: Retry with exponential backoff (1s→4s→10s) 