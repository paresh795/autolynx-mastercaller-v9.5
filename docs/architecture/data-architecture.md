# AutoLynx Architecture — Data Architecture

> **Database Design & Data Management**  
> **Related:** [API Design](./api-design.md) | [System Overview](./system-overview.md) | [Reference Materials](./reference-materials.md)

---

## Database Overview

**Platform:** Supabase (Postgres)  
**Extensions:** pgcrypto for UUID generation  
**Approach:** Event-sourced call tracking with immutable audit log  
**Scaling:** Single-tenant for v1, RLS-ready for multi-tenant future

---

## Schema Design

### Database Extensions & Types

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Custom enum types for strong typing
CREATE TYPE IF NOT EXISTS call_status AS ENUM (
  'QUEUED','RINGING','IN_PROGRESS','ENDED','FAILED','CANCELED','TIMEOUT'
);

CREATE TYPE IF NOT EXISTS campaign_mode AS ENUM ('continuous','batch');

CREATE TYPE IF NOT EXISTS assistant_source AS ENUM ('local','imported','template');
```

---

## Core Tables

### Assistants (Assistant Directory)

```sql
CREATE TABLE IF NOT EXISTS assistants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  source                 assistant_source NOT NULL DEFAULT 'local',
  provider               TEXT NOT NULL DEFAULT 'vapi',
  provider_assistant_id  TEXT UNIQUE NOT NULL,
  config_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
  active                 BOOLEAN NOT NULL DEFAULT true,
  ephemeral              BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_assistants_active ON assistants(active);
CREATE INDEX IF NOT EXISTS idx_assistants_source ON assistants(source);
```

**Key Design Decisions:**
- `provider_assistant_id` is unique to prevent duplicates
- `ephemeral=false` for Directory assistants (persistent)
- `config_json` stores full Vapi assistant configuration for versioning
- `source` tracks how assistant was created for management

### Campaigns

```sql
CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  mode             campaign_mode NOT NULL DEFAULT 'continuous',
  cap              INT NOT NULL DEFAULT 8 CHECK (cap BETWEEN 1 AND 50),
  assistant_id     UUID NOT NULL REFERENCES assistants(id),
  phone_number_id  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  total_contacts   INT NOT NULL DEFAULT 0,
  stats_json       JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(started_at, completed_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_assistant ON campaigns(assistant_id);
```

**Key Design Decisions:**
- `cap` has reasonable bounds (1-50) with default 8
- `started_at` and `completed_at` define campaign lifecycle
- `stats_json` for cached metrics to avoid expensive aggregations
- Foreign key to `assistants` prevents deletion of assistants in use

### Contacts

```sql
CREATE TABLE IF NOT EXISTS contacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  business_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  batch_index    INT NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, phone)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_batch ON contacts(campaign_id, batch_index);
```

**Key Design Decisions:**
- `UNIQUE(campaign_id, phone)` prevents duplicate contacts per campaign
- `phone` stored in E.164 format (+1234567890)
- `batch_index` for strict batching mode support
- CASCADE delete when campaign deleted

### Calls

```sql
CREATE TABLE IF NOT EXISTS calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  provider_call_id  TEXT UNIQUE,
  status            call_status NOT NULL DEFAULT 'QUEUED',
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  ended_reason      TEXT,
  cost_usd          NUMERIC(10,4),
  recording_url     TEXT,
  transcript_json   JSONB,
  success_evaluation BOOLEAN,
  last_status_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Critical indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_campaign_status ON calls(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_provider ON calls(provider_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_active ON calls(campaign_id) 
  WHERE status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');
```

**Key Design Decisions:**
- `provider_call_id` nullable until call actually created with Vapi
- `transcript_json` stores full transcript as JSONB for queryability
- `cost_usd` as NUMERIC for precision in financial calculations
- Partial index on active calls for performance

### Call Events (Immutable Audit Log)

```sql
CREATE TABLE IF NOT EXISTS call_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  status     call_status NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_call_events_call ON call_events(call_id);
CREATE INDEX IF NOT EXISTS idx_call_events_created ON call_events(created_at);
```

**Key Design Decisions:**
- Append-only table for complete audit trail
- `payload` stores full webhook data for debugging
- No UPDATE or DELETE operations allowed
- Enables event sourcing and reconciliation

---

## Data Relationships

```mermaid
erDiagram
    ASSISTANTS ||--o{ CAMPAIGNS : references
    CAMPAIGNS ||--o{ CONTACTS : contains
    CAMPAIGNS ||--o{ CALLS : belongs_to
    CONTACTS ||--o{ CALLS : generates
    CALLS ||--o{ CALL_EVENTS : tracks

    ASSISTANTS {
        uuid id PK
        text name
        text provider_assistant_id UK
        jsonb config_json
        boolean active
        boolean ephemeral
    }
    
    CAMPAIGNS {
        uuid id PK
        text name
        int cap
        uuid assistant_id FK
        timestamptz started_at
        timestamptz completed_at
    }
    
    CONTACTS {
        uuid id PK
        uuid campaign_id FK
        text name
        text phone
        int batch_index
    }
    
    CALLS {
        uuid id PK
        uuid campaign_id FK
        uuid contact_id FK
        text provider_call_id UK
        call_status status
        jsonb transcript_json
    }
    
    CALL_EVENTS {
        uuid id PK
        uuid call_id FK
        call_status status
        jsonb payload
        timestamptz created_at
    }
```

---

## Query Patterns & Performance

### Critical Query Patterns

#### Active Call Count (Concurrency Management)
```sql
-- Most frequent query - heavily optimized
SELECT COUNT(*) 
FROM calls 
WHERE campaign_id = $1 
  AND status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');
```
**Index:** `idx_calls_active` (partial index on active statuses)

#### Campaign Progress Metrics
```sql
-- Dashboard summary query
SELECT 
  status,
  COUNT(*) as count,
  SUM(cost_usd) as total_cost
FROM calls 
WHERE campaign_id = $1 
GROUP BY status;
```
**Index:** `idx_calls_campaign_status`

#### Next Contacts to Call
```sql
-- Scheduler query for available contacts
SELECT c.* 
FROM contacts c
LEFT JOIN calls ca ON ca.contact_id = c.id
WHERE c.campaign_id = $1 
  AND ca.id IS NULL
ORDER BY c.batch_index, c.id
LIMIT $2;
```
**Index:** `idx_contacts_batch` + `idx_calls_contact`

#### Call Event History
```sql
-- Debugging and reconciliation
SELECT * 
FROM call_events 
WHERE call_id = $1 
ORDER BY created_at;
```
**Index:** `idx_call_events_call`

### Performance Optimizations

#### Connection Pooling
- Supabase handles connection pooling automatically
- Use `pg_bouncer` in transaction mode for high concurrency

#### Query Optimization
- All foreign keys have proper indexes
- Partial indexes on frequent WHERE conditions
- Avoid N+1 queries with proper JOIN strategies

#### Caching Strategy
- `campaigns.stats_json` caches expensive aggregations
- Application-level caching for assistant configurations
- Real-time subscriptions reduce polling needs

---

## Data Consistency & Integrity

### ACID Properties
- **Atomicity**: All database operations in transactions
- **Consistency**: Foreign key constraints and CHECK constraints
- **Isolation**: Postgres default isolation level
- **Durability**: Supabase automated backups

### Business Rules Enforcement

#### Database-Level Constraints
```sql
-- Prevent negative costs
ALTER TABLE calls ADD CONSTRAINT positive_cost 
  CHECK (cost_usd IS NULL OR cost_usd >= 0);

-- Reasonable concurrency caps
ALTER TABLE campaigns ADD CONSTRAINT reasonable_cap 
  CHECK (cap BETWEEN 1 AND 50);

-- Phone number format validation (basic)
ALTER TABLE contacts ADD CONSTRAINT phone_format 
  CHECK (phone ~ '^\+[1-9]\d{1,14}$');
```

#### Application-Level Rules
- Assistant cannot be deleted if referenced by active campaigns
- Contact uniqueness per campaign enforced by unique constraint
- Campaign state transitions validated in application logic

### Data Migration Strategy

#### Schema Versioning
- Use Supabase migrations for schema changes
- Version each migration with timestamp
- Rollback procedures documented

#### Data Validation
```sql
-- Validate data integrity
SELECT 
  'Orphaned calls' as issue,
  COUNT(*) as count
FROM calls c
LEFT JOIN contacts ct ON ct.id = c.contact_id
WHERE ct.id IS NULL;

-- Validate phone format
SELECT 
  'Invalid phone format' as issue,
  COUNT(*) as count
FROM contacts 
WHERE phone !~ '^\+[1-9]\d{1,14}$';
```

---

## Storage & Transcript Management

### Transcript Storage Decision
**Current (v1):** Store full transcripts in `calls.transcript_json` as JSONB

**Rationale:**
- Simple implementation without external storage
- JSONB enables SQL queries on transcript content
- Postgres handles compression automatically
- Average transcript ~5-50KB fits well in database

**Future Considerations:**
- If transcripts exceed 1MB consistently, move to object storage
- Keep transcript summary/metadata in database
- Point to S3/Supabase Storage for full transcript

### Transcript Structure
```json
{
  "messages": [
    {
      "role": "assistant",
      "message": "Hello, this is Sarah calling from...",
      "timestamp": "2024-01-01T12:00:00Z"
    },
    {
      "role": "user", 
      "message": "Hi, what's this about?",
      "timestamp": "2024-01-01T12:00:15Z"
    }
  ],
  "summary": "Customer showed interest in product demo",
  "sentiment": "positive",
  "keyTopics": ["pricing", "demo", "timeline"],
  "nextSteps": "Schedule demo call"
}
```

### Cost Storage
- Use `NUMERIC(10,4)` for precise financial calculations
- Avoid floating point for money values
- Support up to $999,999.9999 per call

---

## Multi-Tenancy Preparation

### Current State (Single-Tenant)
- No RLS policies enabled
- All users share same data
- Authorization handled in application layer

### Future Multi-Tenant Design
```sql
-- Add organization support
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add org_id to all tables
ALTER TABLE campaigns ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE assistants ADD COLUMN org_id UUID REFERENCES organizations(id);

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY campaigns_tenant_isolation ON campaigns
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
```

### Migration Path
1. Add `org_id` columns (nullable initially)
2. Populate existing data with default org
3. Make `org_id` NOT NULL
4. Enable RLS policies
5. Update application to use org-scoped queries

---

## Backup & Recovery

### Automated Backups
- Supabase provides automated daily backups
- Point-in-time recovery available
- Cross-region backup replication

### Data Export
- Campaign data exportable as CSV
- Database dump available via `pg_dump`
- Transcript data preserved in exports

### Recovery Procedures
1. **Point-in-time recovery**: Restore to specific timestamp
2. **Table-level recovery**: Restore specific tables
3. **Application-level recovery**: Rebuild from event log

### Data Retention
- Active campaigns: Indefinite retention
- Completed campaigns: 2-year default retention
- Call events: 7-year retention for audit compliance
- PII data: Follow privacy regulations (GDPR, CCPA)
```

```markdown:docs/architecture/assistant-management.md
# AutoLynx Architecture — Assistant Management

> **Assistant Directory System & Lifecycle**  
> **Related:** [API Design](./api-design.md) | [Data Architecture](./data-architecture.md) | [System Overview](./system-overview.md)

---

## Assistant Directory Overview

The Assistant Directory replaces ad-hoc assistant creation/deletion with a **first-class persistent management system**. This design keeps assistant operations out of the critical calling path and prevents accidental deletion of assistants used by campaigns.

### Core Principles

- **Persistent by default**: All directory assistants are permanent unless explicitly marked ephemeral
- **Reusable across campaigns**: Single assistant can power multiple campaigns
- **No auto-deletion**: Only manual deletion after validation of usage
- **Version tracking**: Configuration changes tracked and synchronized with Vapi

---

## Assistant Lifecycle

### Creation Flow

```mermaid
graph TD
    A[User creates assistant] --> B[Validate configuration]
    B --> C[Call Vapi POST /assistant]
    C --> D[Store provider_assistant_id]
    D --> E[Save config_json locally]
    E --> F[Assistant available in directory]
    
    C -->|API Error| G[Show error, don't save]
    G --> A
```

#### Create Local Assistant
1. **User Input**: Name, voice config, system prompt, model settings
2. **Validation**: Required fields, valid voice IDs, model availability
3. **Vapi Creation**: Call `POST /assistant` with complete configuration
4. **Local Storage**: Save `provider_assistant_id` and `config_json` in database
5. **Status**: Mark as `active=true`, `ephemeral=false`, `source='local'`

**API Endpoint:** `POST /api/assistants`

```json
{
  "name": "Sales Demo Assistant",
  "config": {
    "model": "gpt-4",
    "voice": {
      "provider": "11labs", 
      "voiceId": "EXAVITQu4vr4xnSDxMaL"
    },
    "systemPrompt": "You are a friendly sales representative...",
    "firstMessage": "Hi! I'm calling to discuss...",
    "endCallMessage": "Thank you for your time!",
    "recordingEnabled": true,
    "silenceTimeoutSeconds": 30
  }
}
```

### Import Flow

```mermaid
graph TD
    A[User provides assistant ID] --> B[Validate ID format]
    B --> C[Call Vapi GET /assistant/:id]
    C --> D[Assistant exists?]
    D -->|Yes| E[Retrieve configuration]
    D -->|No| F[Show error - assistant not found]
    E --> G[Save to local directory]
    G --> H[Mark as source='imported']
```

#### Import External Assistant
1. **User Input**: Existing Vapi assistant ID, optional display name
2. **Validation**: Call Vapi `GET /assistant/:id` to verify existence
3. **Configuration Sync**: Download current configuration from Vapi
4. **Local Registration**: Save in directory with `source='imported'`
5. **Deduplication**: Update existing record if `provider_assistant_id` already exists

**API Endpoint:** `POST /api/assistants/import`

```json
{
  "providerAssistantId": "vapi_assistant_123456",
  "name": "Imported Sales Assistant"
}
```

### Update Flow

```mermaid
graph TD
    A[User edits assistant] --> B[Validate changes]
    B --> C[Update local config_json]
    C --> D[Configuration changed?]
    D -->|Yes| E[PATCH Vapi assistant]
    D -->|No| F[Update local only]
    E --> G[Vapi update success?]
    G -->|Yes| H[Commit changes]
    G -->|No| I[Rollback, show error]
    F --> H
```

#### Edit Assistant
1. **User Changes**: Modify name, configuration, or active status
2. **Local Update**: Update `config_json` and metadata in database
3. **Vapi Sync**: If configuration changed, PATCH Vapi assistant
4. **Rollback Handling**: If Vapi update fails, rollback local changes
5. **Versioning**: Update `updated_at` timestamp

**API Endpoint:** `PATCH /api/assistants/:id`

```json
{
  "name": "Updated Assistant Name",
  "config": {
    "systemPrompt": "Updated system prompt...",
    "voice": {
      "provider": "11labs",
      "voiceId": "new_voice_id"
    }
  },
  "active": true
}
```

### Deletion Flow

```mermaid
graph TD
    A[User requests deletion] --> B[Check active campaign usage]
    B --> C[Any active campaigns?]
    C -->|Yes| D[Block deletion - show campaigns]
    C -->|No| E[Safe to delete?]
    E --> F[Delete from local DB only]
    F --> G[Leave Vapi assistant intact]
    
    D --> H[User must complete/pause campaigns first]
```

#### Delete Assistant (Manual Only)
1. **Usage Check**: Query campaigns with status IN ('QUEUED', 'DIALING', 'RUNNING')
2. **Block if Active**: Prevent deletion if assistant is referenced by active campaigns
3. **Local Deletion Only**: Remove from local database, leave Vapi assistant intact
4. **No Auto-Deletion**: Never automatically delete assistants during call flows

**API Endpoint:** `DELETE /api/assistants/:id`

**Validation Query:**
```sql
SELECT COUNT(*) FROM campaigns 
WHERE assistant_id = $1 
  AND (completed_at IS NULL OR completed_at > NOW() - INTERVAL '24 hours');
```

---

## Template Management

### Pre-Built Templates

```mermaid
graph TD
    A[System Initialization] --> B[Seed Template Assistants]
    B --> C[Voicemail-Friendly Template]
    B --> D[Short Pitch Template] 
    B --> E[Discovery Template]
    
    C --> F[Mark source='template']
    D --> F
    E --> F
    
    F --> G[Available for cloning]
```

#### Template Creation
1. **System Seeding**: Create 2-3 stock assistants during system setup
2. **Template Marking**: Set `source='template'` to distinguish from user-created
3. **Clone Functionality**: Users can clone templates to create customized versions
4. **Update Protection**: Templates cannot be edited by users, only cloned

#### Template Examples

**Voicemail-Friendly Template:**
```json
{
  "name": "Voicemail-Friendly Assistant",
  "config": {
    "systemPrompt": "Keep messages under 30 seconds. Always leave a clear callback number.",
    "firstMessage": "Hi, this is Sarah from [Company]. I have some information that might interest you.",
    "endCallMessage": "Please call us back at [phone]. Thank you!",
    "silenceTimeoutSeconds": 15,
    "endCallTimeoutSeconds": 30
  }
}
```

**Short Pitch Template:**
```json
{
  "name": "Quick Pitch Assistant", 
  "config": {
    "systemPrompt": "Deliver value proposition in under 60 seconds. Ask for permission to continue.",
    "firstMessage": "Hi! I'm calling with a quick question that could save you money.",
    "maxCallDurationSeconds": 180
  }
}
```

### Clone Template Flow
1. **User Selection**: Choose template from directory
2. **Copy Configuration**: Duplicate `config_json` to new assistant
3. **Vapi Creation**: Create new assistant on Vapi with copied config
4. **User Ownership**: Mark as `source='local'` for user modification

---

## Campaign Integration

### Assistant Selection at Campaign Creation

```mermaid
graph TD
    A[User creates campaign] --> B[Assistant selection required]
    B --> C[Load active assistants from directory]
    C --> D[Display dropdown with assistants]
    D --> E[User selects assistant]
    E --> F[Validate assistant is active]
    F --> G[Store assistant_id in campaign]
    G --> H[Campaign ready for launch]
```

#### Selection Process
1. **Required Field**: `assistant_id` is mandatory for campaign creation
2. **Active Only**: Dropdown shows only assistants where `active=true`
3. **Directory Source**: No ad-hoc assistant creation during campaign flow
4. **Validation**: Ensure selected assistant exists and is active
5. **Reference Storage**: Store `assistant_id` foreign key in campaigns table

#### Campaign-Assistant Relationship
- **Many-to-One**: Multiple campaigns can use same assistant
- **Immutable**: Once campaign starts, assistant reference cannot be changed
- **Cascade Protection**: Assistant cannot be deleted if referenced by active campaigns

### Runtime Assistant Resolution

```mermaid
graph TD
    A[Scheduler tick processes campaign] --> B[Resolve assistant_id to provider_assistant_id]
    B --> C[Call Vapi POST /call with provider_assistant_id]
    C --> D[Store provider_call_id in calls table]
```

#### Call Creation Process
1. **Campaign Lookup**: Get `assistant_id` from campaign record
2. **Assistant Resolution**: Join to `assistants` table for `provider_assistant_id`
3. **Vapi Call Creation**: Use `provider_assistant_id` in `POST /call` request
4. **Error Handling**: If assistant deleted/disabled, fail gracefully with clear error

---

## Version Management

### Configuration Versioning

#### Current State (v1)
- **Simple Versioning**: Single `config_json` field with `updated_at` timestamp
- **Sync Strategy**: Always keep local and Vapi configurations synchronized
- **Change Tracking**: Update timestamp on every configuration change

#### Future Enhancements
- **Version History Table**: Track all configuration changes over time
- **Rollback Capability**: Restore previous configurations
- **Campaign Snapshots**: Capture assistant config at campaign start time

### Sync Strategy

```mermaid
graph TD
    A[Configuration Change] --> B[Update local config_json]
    B --> C[PATCH Vapi assistant]
    C --> D[Vapi update successful?]
    D -->|Yes| E[Commit local changes]
    D -->|No| F[Rollback local changes]
    F --> G[Show error to user]
    E --> H[Update updated_at timestamp]
```

#### Sync Operations
1. **Local First**: Always update local configuration first
2. **Vapi Sync**: Push changes to Vapi via PATCH
3. **Rollback on Failure**: If Vapi sync fails, rollback local changes
4. **Eventual Consistency**: System maintains consistency between local and remote

#### Conflict Resolution
- **Local Authority**: Local database is source of truth for configuration
- **Vapi Validation**: Vapi validates configuration feasibility
- **Error Propagation**: Vapi errors block local configuration changes

---

## Security & Access Control

### Assistant Ownership
- **Single Tenant v1**: All users can access all assistants
- **Future Multi-Tenant**: Add `org_id` for organization-level isolation
- **Role-Based Access**: Admin can manage all, Operator can use assigned

### Configuration Security
- **Sensitive Data**: API keys and secrets stored server-side only
- **Configuration Validation**: Sanitize and validate all user inputs
- **Audit Trail**: Track all configuration changes in logs

### Integration Security
- **API Key Management**: Vapi API key stored securely in environment
- **Request Validation**: Validate all Vapi API responses
- **Error Handling**: Never expose internal errors to users

---

## Performance & Scaling

### Directory Performance
- **Index Optimization**: Indexes on `active`, `source`, `provider_assistant_id`
- **Caching Strategy**: Cache active assistants for campaign dropdown
- **Query Optimization**: Efficient joins between campaigns and assistants

### Vapi API Efficiency
- **Batch Operations**: Group multiple configuration updates when possible
- **Rate Limiting**: Respect Vapi API rate limits with backoff
- **Caching**: Cache assistant configurations to minimize API calls

### Monitoring & Metrics
- **Usage Tracking**: Monitor which assistants are most used
- **Performance Metrics**: Track assistant creation/update success rates
- **Error Rates**: Monitor Vapi API failures and retry patterns

---

## Migration & Data Management

### Existing Assistant Migration
1. **Discovery**: Scan existing Vapi assistants via API
2. **Import Process**: Bulk import with `source='imported'`
3. **Validation**: Ensure all imported assistants are functional
4. **Cleanup**: Archive or delete unused assistants

### Data Export
- **Configuration Backup**: Export all assistant configurations as JSON
- **Usage Reports**: Track assistant usage across campaigns
- **Performance Analytics**: Assistant success rates and metrics

### Maintenance Operations
- **Health Checks**: Periodic validation of Vapi assistant existence
- **Configuration Drift**: Detect differences between local and Vapi configs
- **Cleanup Procedures**: Remove unused assistants after retention period
```

```markdown:docs/architecture/deployment-ops.md
# AutoLynx Architecture — Deployment & Operations

> **Infrastructure, Configuration & Operational Concerns**  
> **Related:** [System Overview](./system-overview.md) | [Security & Auth](./security-auth.md) | [Reference Materials](./reference-materials.md)

---

## Infrastructure Architecture

### Platform Overview

```mermaid
graph TB
    subgraph "Vercel Platform"
        A[Next.js App Router]
        B[API Routes]
        C[Vercel Cron]
    end
    
    subgraph "Supabase Platform"
        D[Postgres Database]
        E[Supabase Auth]
        F[Real-time Subscriptions]
    end
    
    subgraph "External Services"
        G[Vapi Voice AI]
        H[Webhook Endpoints]
    end
    
    A --> D
    A --> E
    A --> F
    B --> D
    B --> G
    C --> B
    G --> H
    H --> B
```

#### Technology Stack
- **Frontend**: Next.js 14+ with App Router
- **Backend**: Next.js API routes (serverless functions)
- **Database**: Supabase (Postgres) with real-time subscriptions
- **Authentication**: Supabase Auth with JWT tokens
- **Voice AI**: Vapi for outbound calling
- **Hosting**: Vercel (frontend + API + cron)
- **Monitoring**: Vercel Analytics + custom logging

### Deployment Environments

#### Development Environment
```yaml
Environment: dev
Domain: autolynx-dev.vercel.app
Database: Supabase dev project
Vapi: Sandbox account
Features:
  - Hot reload development
  - Debug logging enabled
  - Test data seeding
  - Mock external services
```

#### Production Environment  
```yaml
Environment: prod
Domain: autolynx.com
Database: Supabase production project
Vapi: Production account with real phone numbers
Features:
  - Optimized builds
  - Error tracking
  - Performance monitoring
  - Automated backups
```

---

## Configuration Management

### Environment Variables

#### Required Variables
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ... # Server-side operations
SUPABASE_ANON_KEY=eyJ...         # Client-side auth

# Database Direct Connection (optional)
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# Vapi Integration
VAPI_API_KEY=your-vapi-api-key
VAPI_PHONE_NUMBER_ID=your-phone-number-id

# Security Secrets
WEBHOOK_SHARED_SECRET=random-secure-string-256-bits
CRON_SHARED_SECRET=random-secure-string-256-bits

# Optional Configuration
DEFAULT_CONCURRENCY_CAP=8
DEFAULT_CRON_CADENCE=60
LOG_LEVEL=info
```

#### Secret Management
- **Vercel Environment Variables**: Secure storage for all secrets
- **Environment-Specific**: Different secrets for dev/prod environments
- **No Client Exposure**: Service role keys never sent to client
- **Rotation Policy**: Regular rotation of all secrets

### Application Configuration

#### Feature Flags
```typescript
const config = {
  features: {
    strictBatching: true,
    phoneLineHealthCheck: true,
    transcriptAnalysis: true,
    costTracking: true,
    exportFunctionality: true,
  },
  limits: {
    maxConcurrentCalls: parseInt(process.env.DEFAULT_CONCURRENCY_CAP) || 8,
    maxCampaignSize: 10000,
    maxFileUploadSize: 10 * 1024 * 1024, // 10MB
    cronCadenceSeconds: parseInt(process.env.DEFAULT_CRON_CADENCE) || 60,
  },
  integrations: {
    vapi: {
      apiKey: process.env.VAPI_API_KEY,
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      baseUrl: 'https://api.vapi.ai',
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      anonKey: process.env.SUPABASE_ANON_KEY,
    },
  },
};
```

---

## Deployment Pipeline

### CI/CD Workflow

```mermaid
graph TD
    A[Git Push] --> B[GitHub Actions]
    B --> C[Install Dependencies]
    C --> D[Run Tests]
    D --> E[Build Application]
    E --> F[Deploy to Vercel]
    F --> G[Run Integration Tests]
    G --> H[Health Check]
    H --> I[Success]
    
    D -->|Test Failure| J[Fail Deployment]
    F -->|Deploy Failure| J
    G -->|Integration Failure| K[Rollback]
```

#### GitHub Actions Configuration
```yaml
name: Deploy to Vercel
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run test
      - run: npm run test:integration

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: vercel/action@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

#### Deployment Stages
1. **Code Commit**: Push to main branch triggers deployment
2. **Automated Testing**: Unit tests, integration tests, linting
3. **Build Process**: Next.js build with optimization
4. **Deploy to Vercel**: Atomic deployment with preview URLs
5. **Health Checks**: Verify deployment success and API functionality
6. **Rollback on Failure**: Automatic rollback if health checks fail

### Database Migrations

#### Migration Strategy
```sql
-- Migration file: 001_initial_schema.sql
BEGIN;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create types
CREATE TYPE call_status AS ENUM (...);

-- Create tables
CREATE TABLE assistants (...);
CREATE TABLE campaigns (...);

-- Create indexes
CREATE INDEX idx_calls_active ON calls(campaign_id) 
WHERE status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');

COMMIT;
```

#### Migration Execution
1. **Pre-deployment**: Run migrations before code deployment
2. **Backup First**: Automatic backup before schema changes
3. **Rollback Plan**: Every migration has rollback instructions
4. **Zero Downtime**: Use additive changes when possible

---

## Monitoring & Observability

### Application Monitoring

#### Metrics Collection
```typescript
// Custom metrics tracking
const metrics = {
  async trackCampaignMetrics(campaignId: string) {
    const metrics = await db.query(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(cost_usd) as avg_cost,
        AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration
      FROM calls 
      WHERE campaign_id = $1 
      GROUP BY status
    `, [campaignId]);
    
    // Send to monitoring service
    await analytics.track('campaign_metrics', {
      campaignId,
      metrics: metrics.rows
    });
  }
};
```

#### Key Metrics
- **Campaign Performance**: Success rates, completion times, cost per call
- **System Performance**: API response times, database query performance
- **Error Rates**: Failed calls, webhook failures, authentication errors
- **Resource Usage**: Database connections, memory usage, function execution time

### Error Tracking

#### Structured Logging
```typescript
const logger = {
  error(message: string, context: any = {}) {
    console.error(JSON.stringify({
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      context,
      trace: new Error().stack
    }));
  },
  
  warn(message: string, context: any = {}) {
    console.warn(JSON.stringify({
      level: 'warn', 
      message,
      timestamp: new Date().toISOString(),
      context
    }));
  }
};
```

#### Error Categories
- **User Errors**: Invalid input, authorization failures
- **System Errors**: Database timeouts, external API failures
- **Integration Errors**: Vapi API errors, webhook processing failures
- **Performance Errors**: Slow queries, memory exhaustion

### Health Checks

#### Application Health
```typescript
// /api/health endpoint
export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabase(),
      vapi: await checkVapiConnection(),
      auth: await checkSupabaseAuth(),
    }
  };
  
  const isHealthy = Object.values(health.checks).every(check => check.healthy);
  
  return Response.json(health, {
    status: isHealthy ? 200 : 503
  });
}
```

#### External Dependencies
- **Database**: Connection test and query performance
- **Vapi API**: API reachability and response time
- **Supabase Auth**: Token validation service
- **Webhook Endpoints**: Webhook delivery success rate

---

## Performance Optimization

### Database Performance

#### Query Optimization
```sql
-- Optimized query for active call count
EXPLAIN ANALYZE
SELECT COUNT(*) 
FROM calls 
WHERE campaign_id = $1 
  AND status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');

-- Use partial index for performance
CREATE INDEX idx_calls_active ON calls(campaign_id) 
WHERE status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');
```

#### Connection Management
- **Connection Pooling**: Supabase handles connection pooling automatically
- **Query Optimization**: Use indexes and efficient query patterns
- **Read Replicas**: Use read replicas for analytics queries (future)
- **Caching**: Cache frequently accessed data in memory

### API Performance

#### Response Time Optimization
```typescript
// API route optimization
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  
  // Cache frequently accessed data
  const cacheKey = `campaign:${campaignId}:summary`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    return Response.json(cached);
  }
  
  const data = await fetchCampaignSummary(campaignId);
  await cache.set(cacheKey, data, { ttl: 60 }); // 1 minute cache
  
  return Response.json(data);
}
```

#### Caching Strategy
- **Response Caching**: Cache expensive aggregations for 1-5 minutes
- **Static Assets**: CDN caching for static resources
- **Database Query Caching**: Cache commonly used lookup data
- **Real-time Balance**: Use real-time subscriptions for critical updates

### Frontend Performance

#### Code Splitting
```typescript
// Dynamic imports for large components
const CampaignDetail = dynamic(() => import('../components/CampaignDetail'), {
  loading: () => <Skeleton />,
  ssr: false
});
```

#### Performance Optimizations
- **Code Splitting**: Load components on demand
- **Image Optimization**: Next.js automatic image optimization
- **Bundle Analysis**: Regular bundle size monitoring
- **Performance Budgets**: Set limits on bundle sizes

---

## Scaling Considerations

### Current Limitations

#### Identified Bottlenecks
- **Concurrent Calls**: Limited by Vapi plan (10 concurrent on free)
- **Database Connections**: Supabase connection limits based on plan
- **Function Duration**: Vercel 10s timeout for API routes
- **File Upload**: 10MB limit for CSV uploads

#### Monitoring Thresholds
```typescript
const scalingThresholds = {
  concurrentCalls: {
    warning: 6,    // 75% of 8 cap
    critical: 8,   // 100% of cap
  },
  databaseConnections: {
    warning: 80,   // 80% of plan limit
    critical: 95,  // 95% of plan limit
  },
  responseTime: {
    warning: 2000, // 2 second response time
    critical: 5000, // 5 second response time
  }
};
```

### Scaling Strategies

#### Horizontal Scaling
- **Serverless Functions**: Vercel functions auto-scale based on demand
- **Database Scaling**: Upgrade Supabase plan for more connections
- **CDN**: Use Vercel CDN for static asset distribution
- **Microservices**: Extract heavy processing to dedicated services

#### Vertical Scaling
- **Database Resources**: Increase CPU/memory for database
- **Function Resources**: Optimize function memory allocation
- **Caching**: Implement Redis for distributed caching
- **Queue Processing**: Use background job queues for heavy tasks

### Future Architecture

#### Multi-Tenant Scaling
```sql
-- Partition tables by organization
CREATE TABLE campaigns_org_1 (
  LIKE campaigns INCLUDING ALL,
  CHECK (org_id = 1)
) INHERITS (campaigns);

CREATE TABLE campaigns_org_2 (
  LIKE campaigns INCLUDING ALL, 
  CHECK (org_id = 2)
) INHERITS (campaigns);
```

#### Microservices Migration
- **Call Processing Service**: Dedicated service for call management
- **Analytics Service**: Separate service for reporting and analytics
- **Notification Service**: Handle webhooks and notifications
- **File Processing Service**: Handle large CSV processing

---

## Disaster Recovery

### Backup Strategy

#### Automated Backups
- **Database**: Supabase automated daily backups with point-in-time recovery
- **Code**: Git repository with multiple remotes
- **Configuration**: Environment variables backed up securely
- **Documentation**: Architecture and operational procedures documented

#### Backup Testing
```typescript
// Automated backup verification
async function verifyBackup() {
  const backupTest = await supabase
```

```
