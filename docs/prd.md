# PRD — AutoLynx CSV → Outbound Calling (v1.0)

> Mode: *PM + Analyst*. Scope: CSV‑driven outbound cold‑calling via Vapi. **No chat UX.** Aligns 1:1 with *Architecture v1.0*.

---

## 1) Purpose & Vision
A simple, robust app where an operator uploads a CSV (`name, business_name, phone`), selects a **persistent assistant** (from our Assistant Directory), clicks **Start**, and the system launches a campaign under a **global concurrency cap** while showing accurate, real‑time progress and outcomes.

**Success criteria**
- **Truthful Start**: mark campaign *Started* only after we successfully create at least one call (2xx from Vapi `POST /call`) **and** persist its `provider_call_id` with status in `{QUEUED,RINGING,IN_PROGRESS}`. *Pickup is not required.*
- **Cap Safety**: default concurrency cap **8** (configurable) to respect Vapi’s free plan (10 concurrent) with buffer.
- **Clarity**: live counters, per‑contact outcomes (recording, transcript, cost, ended reason), exportable CSV.
- **Simplicity**: no long‑running loops/daemons. **Cron cadence** (default **60s** ± jitter) drives launches; **webhooks** drive truth for status.

---

## 2) In/Out of Scope (v1)
**In**
- CSV import (strict 3 columns; normalization to `+E.164`).
- Campaign creation, start/stop (pause is optional later), monitoring, export.
- **Assistant Directory**: create/import/manage persistent Vapi assistants; select one per campaign.
- **Auth**: Supabase Auth with an **allowlist** (Admin/Operator roles).
- Concurrency: cap=8 default; **Mode A: Continuous Cap** (default). **Mode B: Strict Batching** (optional per campaign).
- **Transcripts/recordings**: store transcript JSON inline; store recording URL.
- Observability: event log, error tracking, simple metrics.

**Out**
- Chat UI, inbound calling, SMS drip, advanced assistant builder/versions, multi‑tenant RLS (later), payments/SSO, custom domains.

---

## 3) Personas
- **Operator**: uploads CSV, starts/monitors campaigns, exports.
- **Admin**: manages allowlist, assistants, phone number, default cap/cadence.

---

## 4) Core Flows
### 4.1 CSV → Campaign
1) Upload CSV → server streams parse + validates headers; normalize phone → `contacts` inserted (dedupe on `(campaign_id, phone)`).
2) Create `campaign` with `assistant_id`, `phone_number_id`, `cap`, `mode`.
3) Return import report `{accepted, skipped[{row, reason}]}` + `campaignId`.

### 4.2 Start Campaign
1) User clicks **Start** → campaign state `QUEUED`.
2) Next **cron tick** (default 60s) launches up to `cap - active` calls using the campaign’s selected **assistant**.
3) On first successful `POST /call`, persist `provider_call_id` → set `started_at` and state `DIALING` (aka **Started**).

### 4.3 Dialing & Status
- **Truth source**: Vapi **webhooks** update per‑call status → `calls` + immutable `call_events` rows. Dashboard subscribes to DB updates.
- If a call sees no event for **10m**, mark `TIMEOUT` and continue.

### 4.4 Concurrency Modes
- **Mode A — Continuous Cap (default)**: keep `active_calls ≤ cap`; each tick fills room.
- **Mode B — Strict Batching (optional)**: only start batch *N+1* after *all* batch *N* calls are terminal (per our DB events).
- **Optional toggle**: *Line‑quiet gating* (phone‑number activity must be zero) can be enabled per campaign; otherwise health only.

### 4.5 Finish & Export
- When all contacts have terminal calls → mark `COMPLETED`; provide **Export CSV** with: `name,business_name,phone,status,ended_reason,cost,recording_url,transcript_json`.

---

## 5) Functional Requirements
**FR‑1 Auth**: Supabase Auth; allowlist table/metadata guards sign‑in; roles: Admin/Operator with route guards.

**FR‑2 CSV Import**: Required headers (case‑insensitive). Normalize to E.164 (+ auto‑add `+` when clear). Skip invalid rows with reasons. Stream parse large files.

**FR‑3 Assistant Directory**
- Create local assistant (we call Vapi `POST /assistant` once); store `provider_assistant_id`, `config_json`, `active`, `ephemeral=false`.
- Import existing assistant by `provider_assistant_id`.
- Edit (PATCH both Vapi and our `config_json`).
- Delete only if not referenced by active campaigns. **No auto‑deletes** in call flows.
- Campaign creation requires selecting a registered assistant (dropdown sourced from Directory).

**FR‑4 Campaign Lifecycle & States**
`CREATED → QUEUED → DIALING → RUNNING → COMPLETED` (+ `PAUSED`, `FAILED` operational states).

**FR‑5 Concurrency & Scheduling**
- Global cap per campaign; default **8**; configurable on campaign.
- **Cron cadence**: default **60s** ± jitter. Launches new calls up to room under the cap.

**FR‑6 Provider Integration (Vapi)**
- `POST /call` with `{customer.number, customer.name, phoneNumberId, assistantId}`.
- Persist `provider_call_id`, timestamps, cost, ended reason, recording URL, transcript JSON.
- Map provider statuses → enum {`QUEUED,RINGING,IN_PROGRESS,ENDED,FAILED,CANCELED,TIMEOUT`}.

**FR‑7 Dashboard**
- Campaign list with progress bars + counters; Campaign detail with paginated contacts/calls; filters; export; health badge for phone‑line activity.

**FR‑8 Observability**
- `call_events` append‑only; structured logs; error tracking.

**FR‑9 Export**
- Streamed CSV export from campaign detail.

---

## 6) Non‑Functional Requirements
- **Performance**: P95 page load <2s; first batch dial within 60s of Start.
- **Reliability**: retries on 429/5xx (1s→4s→10s); ≥95% transient recovery.
- **Security**: secrets server‑side; webhook secret verification; least privilege DB key in server routes.
- **Privacy**: min PII; transcripts stored inline JSON; redact PII in logs.
- **Cost guardrails**: soft per‑campaign spend alert (admin visible).

---

## 7) API (internal app routes)
- `POST /api/assistants` — create local (calls Vapi, stores record).
- `POST /api/assistants/import` — import by provider ID.
- `PATCH /api/assistants/:id` — update; may PATCH provider.
- `DELETE /api/assistants/:id` — only if unused.
- `POST /api/campaigns` — multipart CSV + `{assistantId, phoneNumberId, cap?, mode?}`.
- `POST /api/campaigns/:id/start` — mark `QUEUED`; hold up to 30s to detect first acceptance if desired.
- `POST /api/scheduler/tick` — cron entry point (optionally accepts `campaignId`).
- `POST /api/webhooks/vapi` — status updates (verify secret).
- `GET /api/campaigns, /api/campaigns/:id/summary, /api/campaigns/:id/contacts, /api/campaigns/:id/export.csv`.

---

## 8) Data Model (source of truth)
- **Assistants**: `id, provider_assistant_id, name, source(local|imported|template), config_json, active, ephemeral`.
- **Campaigns**: `id, name, mode(continuous|batch), cap, assistant_id, phone_number_id, started_at, completed_at, total_contacts`.
- **Contacts**: `id, campaign_id, name, business_name, phone, batch_index, UNIQUE(campaign_id, phone)`.
- **Calls**: `id, campaign_id, contact_id, provider_call_id, status, started_at, ended_at, ended_reason, cost_usd, recording_url, transcript_json, success_evaluation`.
- **Call_Events** (immutable audit): `id, call_id, status, payload, created_at`.

> Full SQL DDL is defined in *Architecture v1.0 §7* and duplicated in its Appendix A for copy‑paste.

---

## 9) Hosting & Deployment (aligned with Architecture v1.0)
- **Next.js on Vercel** (App Router): UI + API.
- **Supabase**: Postgres + Auth.
- **Cron**: Vercel Cron calling `/api/scheduler/tick` every **60s**.
- **Secrets**: in Vercel & Supabase (server‑side only).
- Envs: `dev`, `prod`.

---

## 10) Risks & Mitigations
- **Provider rate limits** → cap + cadence + backoff + jitter.
- **Missed webhook** → reconcile on next tick; mark `TIMEOUT` >10m silence.
- **Dashboard drift** → DB is the truth; phone‑line polling is health only.

---

## 11) Milestones
1) CSV import + campaign create + import report.
2) Assistant Directory (create/import/edit/delete) + selection in campaign flow.
3) Cron launches + truthful start semantics + webhook handler + dashboard live updates.
4) Strict batching mode + phone‑line health badge + export.
5) Observability, auth polish, alerts.

---

## 12) Appendices
- **A. Provider Contract (Vapi)** — exact JSON for `POST /assistant`, `POST /call`, status webhook payloads with placeholders for secrets/IDs. *Authoritative templates used by the code.*
- **B. n8n Reference JSONs** — paste **full** main & sub‑workflow JSONs here **with secrets masked but bodies intact** so devs/agents can reference exact payloads.
- **C. .env.example** — `SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, WEBHOOK_SHARED_SECRET, CRON_SHARED_SECRET`.

---

### Decision Log (locked)
- **Default cap**: 8.
- **Cron cadence**: 60s ± jitter.
- **Gating**: Call‑ID truth (default); line‑quiet gating optional toggle.
- **Assistants**: persistent directory (create/import); selected at campaign start; no auto‑deletes.
- **Transcript storage**: inline JSONB in `calls.transcript_json` for v1.

