# AutoLynx PRD Overview — Core Vision & Purpose

> **Version:** 1.0  
> **Last Updated:** Current  
> **Related:** [Technical Requirements](./technical-requirements.md) | [User Flows](./user-flows.md) | [API Spec](./api-spec.md)

---

## Purpose & Vision

A simple, robust app where an operator uploads a CSV (`name, business_name, phone`), selects a **persistent assistant** (from our Assistant Directory), clicks **Start**, and the system launches a campaign under a **global concurrency cap** while showing accurate, real‑time progress and outcomes.

## Success Criteria

- **Truthful Start**: mark campaign *Started* only after we successfully create at least one call (2xx from Vapi `POST /call`) **and** persist its `provider_call_id` with status in `{QUEUED,RINGING,IN_PROGRESS}`. *Pickup is not required.*
- **Cap Safety**: default concurrency cap **8** (configurable) to respect Vapi's free plan (10 concurrent) with buffer.
- **Clarity**: live counters, per‑contact outcomes (recording, transcript, cost, ended reason), exportable CSV.
- **Simplicity**: no long‑running loops/daemons. **Cron cadence** (default **60s** ± jitter) drives launches; **webhooks** drive truth for status.

## Scope Definition

### In Scope (v1)
- CSV import (strict 3 columns; normalization to `+E.164`)
- Campaign creation, start/stop (pause is optional later), monitoring, export
- **Assistant Directory**: create/import/manage persistent Vapi assistants; select one per campaign
- **Auth**: Supabase Auth with an **allowlist** (Admin/Operator roles)
- Concurrency: cap=8 default; **Mode A: Continuous Cap** (default). **Mode B: Strict Batching** (optional per campaign)
- **Transcripts/recordings**: store transcript JSON inline; store recording URL
- Observability: event log, error tracking, simple metrics

### Out of Scope
- Chat UI, inbound calling, SMS drip, advanced assistant builder/versions
- Multi‑tenant RLS (later), payments/SSO, custom domains

## User Personas

- **Operator**: uploads CSV, starts/monitors campaigns, exports results
- **Admin**: manages allowlist, assistants, phone number, default cap/cadence

## Key Decisions (Locked)

- **Default cap**: 8
- **Cron cadence**: 60s ± jitter
- **Gating**: Call‑ID truth (default); line‑quiet gating optional toggle
- **Assistants**: persistent directory (create/import); selected at campaign start; no auto‑deletes
- **Transcript storage**: inline JSONB in `calls.transcript_json` for v1 