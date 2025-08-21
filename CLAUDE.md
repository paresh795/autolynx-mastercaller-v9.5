# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoLynx is a CSV-driven outbound cold-calling system using Vapi for telephony. It's built on Next.js 15 (App Router) with Supabase for database/auth, designed for simple deployment on Vercel.

## Development Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Run development server with Turbopack
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint
```

## Architecture & Key Design Decisions

### Core Components
- **Next.js App Router** on Vercel for UI + API routes
- **Supabase** for Postgres database and authentication with allowlist
- **Vapi** for telephony (assistants, calls, webhooks)
- **Vercel Cron** triggers scheduler every 60s to launch calls

### Critical Design Principles
1. **Event-driven truth via webhooks** - No long-running background loops
2. **Call-ID tracking** as primary source of truth, phoneNumber polling only for health
3. **Persistent assistants** - Never auto-delete, stored in Assistant Directory
4. **Concurrency cap of 8** (default) to respect Vapi's free tier (10 concurrent)
5. **Truthful Start** - Campaign marked started only after successful call creation with provider_call_id

### Data Flow
1. CSV upload → campaign creation with selected assistant
2. Cron scheduler (60s cadence) launches calls up to cap
3. Vapi webhooks update call status → DB → real-time dashboard
4. Campaign completes when all calls terminal

### Database Schema (Supabase/Postgres)
- `assistants` - Directory of reusable Vapi assistants
- `campaigns` - Campaign config with mode, cap, assistant_id
- `contacts` - Imported CSV data (name, business_name, phone)
- `calls` - Call records with status, transcripts (JSONB), recordings
- `call_events` - Immutable audit log of status changes

### API Structure
```
/api/assistants       - CRUD for assistant management
/api/campaigns        - Campaign creation with CSV upload
/api/scheduler/tick   - Cron endpoint for launching calls
/api/webhooks/vapi    - Webhook handler for call status updates
```

### Concurrency Modes
- **Mode A: Continuous Cap** (default) - Keep active_calls ≤ cap
- **Mode B: Strict Batching** - Wait for all batch calls to complete before next

## Environment Configuration

Required environment variables:
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
DATABASE_URL=

VAPI_API_KEY=
VAPI_PHONE_NUMBER_ID=

WEBHOOK_SHARED_SECRET=
CRON_SHARED_SECRET=
```

## Implementation Guidelines

### Assistant Management
- Assistants are created/imported once and stored persistently
- Each campaign selects an existing assistant from the directory
- Never auto-delete assistants in call flows
- Store config_json for versioning

### CSV Processing
- Required headers: name, business_name, phone (case-insensitive)
- Normalize phones to E.164 format
- Dedupe on (campaign_id, phone)
- Stream parse for large files

### Call Lifecycle
- Create call with exponential backoff on failures (1s→4s→10s)
- Mark TIMEOUT if no webhook events for 10 minutes
- Store full transcript as JSONB inline (not separate storage for v1)
- Track costs, recordings, ended reasons

### Error Handling
- Exponential backoff for API failures
- Webhook reconciliation for missed events
- Idempotent operations for retries
- Structured logging for observability

## Testing Approach

When implementing features:
1. Check existing test patterns in the codebase
2. Mock Vapi API calls for integration tests
3. Use small CSV files (≤3 contacts) for E2E testing
4. Verify webhook secret in all webhook handlers

## Security Considerations

- Supabase Auth with allowlist (Admin/Operator roles)
- Webhook secret verification on all incoming webhooks
- Service role key only in server-side API routes
- No PII in logs, redact transcript sensitive data

## Documentation Structure

Comprehensive documentation exists in `/docs`:
- `/docs/prd/` - Product requirements and user flows
- `/docs/architecture/` - Technical architecture and data models
- Reference these for detailed specifications before implementing features