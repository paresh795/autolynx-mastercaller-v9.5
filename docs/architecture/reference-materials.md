# AutoLynx Architecture — Reference Materials

> **SQL Quickstart, Examples & Integration Templates**  
> **Related:** [Data Architecture](./data-architecture.md) | [API Design](./api-design.md) | [Deployment & Operations](./deployment-ops.md)

---

## SQL Quickstart (Copy-Paste)

### Initial Setup

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create custom enum types
CREATE TYPE IF NOT EXISTS call_status AS ENUM (
  'QUEUED','RINGING','IN_PROGRESS','ENDED','FAILED','CANCELED','TIMEOUT'
);

CREATE TYPE IF NOT EXISTS campaign_mode AS ENUM ('continuous','batch');

CREATE TYPE IF NOT EXISTS assistant_source AS ENUM ('local','imported','template');
```

### Complete Schema DDL

```sql
-- Assistants table (Assistant Directory)
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

-- Campaigns table
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

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  business_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  batch_index    INT NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, phone)
);

-- Calls table
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

-- Call events table (immutable audit log)
CREATE TABLE IF NOT EXISTS call_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  status     call_status NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Performance Indexes

```sql
-- Assistant indexes
CREATE INDEX IF NOT EXISTS idx_assistants_active ON assistants(active);
CREATE INDEX IF NOT EXISTS idx_assistants_source ON assistants(source);

-- Campaign indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(started_at, completed_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_assistant ON campaigns(assistant_id);

-- Contact indexes
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_batch ON contacts(campaign_id, batch_index);

-- Call indexes (critical for performance)
CREATE INDEX IF NOT EXISTS idx_calls_campaign_status ON calls(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_provider ON calls(provider_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_active ON calls(campaign_id) 
  WHERE status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');

-- Call event indexes
CREATE INDEX IF NOT EXISTS idx_call_events_call ON call_events(call_id);
CREATE INDEX IF NOT EXISTS idx_call_events_created ON call_events(created_at);
```

### User Management (Supabase Auth Extension)

```sql
-- User profiles for allowlist management
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  allowlisted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

-- System configuration
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default configuration
INSERT INTO system_config (key, value) VALUES
  ('default_concurrency_cap', '8'),
  ('default_cron_cadence', '60'),
  ('max_file_upload_size', '10485760'),
  ('webhook_timeout_seconds', '30')
ON CONFLICT (key) DO NOTHING;
```

---

## Environment Configuration

### .env.example

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Database Direct Connection (optional for migrations)
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

# Vapi Integration
VAPI_API_KEY=your-vapi-api-key-here
VAPI_PHONE_NUMBER_ID=your-vapi-phone-number-id

# Security Secrets (generate with: openssl rand -hex 32)
WEBHOOK_SHARED_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
CRON_SHARED_SECRET=9876543210fedcba0987654321fedcba0987654321fedcba0987654321fedcba

# Optional Configuration
DEFAULT_CONCURRENCY_CAP=8
DEFAULT_CRON_CADENCE=60
LOG_LEVEL=info
NODE_ENV=development

# Development/Testing
MOCK_VAPI_CALLS=false
TEST_PHONE_NUMBER=+1234567890
```

### Vercel Configuration

```json
{
  "functions": {
    "app/api/scheduler/tick/route.ts": {
      "maxDuration": 10
    },
    "app/api/campaigns/route.ts": {
      "maxDuration": 30
    }
  },
  "crons": [
    {
      "path": "/api/scheduler/tick",
      "schedule": "* * * * *"
    }
  ]
}
```

---

## Vapi Integration Examples

### Assistant Creation Payload

```json
{
  "name": "AutoLynx Sales Assistant",
  "model": {
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.7,
    "maxTokens": 250
  },
  "voice": {
    "provider": "11labs",
    "voiceId": "EXAVITQu4vr4xnSDxMaL",
    "stability": 0.5,
    "similarityBoost": 0.75
  },
  "systemPrompt": "You are a friendly and professional sales representative calling on behalf of AutoLynx. Your goal is to briefly introduce our service and gauge interest. Keep the conversation natural and respectful. If the person seems busy or uninterested, politely thank them and end the call. If they show interest, briefly explain our value proposition and offer to schedule a follow-up call.",
  "firstMessage": "Hi! This is Sarah calling from AutoLynx. I hope I'm not catching you at a bad time. I'm reaching out because we help businesses like yours streamline their customer outreach. Do you have just a quick moment to chat?",
  "endCallMessage": "Thank you so much for your time today. Have a great day!",
  "recordingEnabled": true,
  "endCallFunctionEnabled": true,
  "dialKeypadFunctionEnabled": false,
  "silenceTimeoutSeconds": 30,
  "maxDurationSeconds": 300,
  "backgroundSound": "office",
  "voicemailDetection": {
    "enabled": true,
    "voicemailMessage": "Hi! This is Sarah from AutoLynx. I was calling to share some information about how we help businesses improve their customer outreach. Please give us a call back at your convenience at 555-0123. Thanks!"
  },
  "endCallPhrases": [
    "I'm not interested",
    "Please remove me from your list",
    "Don't call me again"
  ]
}
```

### Call Creation Payload

```json
{
  "phoneNumberId": "your-vapi-phone-number-id",
  "assistantId": "assistant-id-from-directory",
  "customer": {
    "number": "+1234567890",
    "name": "John Doe",
    "extension": null
  },
  "metadata": {
    "campaignId": "uuid-of-campaign",
    "contactId": "uuid-of-contact",
    "businessName": "Acme Corp",
    "source": "autolynx-v1"
  }
}
```

### Webhook Event Examples

#### Call Started Event
```json
{
  "type": "call-started",
  "call": {
    "id": "call_provider_id_123",
    "status": "ringing",
    "phoneNumberId": "your-phone-number-id",
    "assistantId": "assistant_id_from_vapi",
    "customer": {
      "number": "+1234567890",
      "name": "John Doe"
    },
    "metadata": {
      "campaignId": "uuid-of-campaign",
      "contactId": "uuid-of-contact"
    },
    "startedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

#### Call Ended Event
```json
{
  "type": "call-ended", 
  "call": {
    "id": "call_provider_id_123",
    "status": "ended",
    "endedReason": "customer-hangup",
    "startedAt": "2024-01-01T12:00:00.000Z",
    "endedAt": "2024-01-01T12:02:30.000Z",
    "cost": 0.0423,
    "costBreakdown": [
      {
        "cost": 0.0423,
        "type": "vapi",
        "minutes": 2.5,
        "subType": "normal"
      }
    ],
    "recordingUrl": "https://vapi-public-recordings.s3.amazonaws.com/recording123.mp3",
    "transcript": {
      "messages": [
        {
          "role": "assistant",
          "message": "Hi! This is Sarah calling from AutoLynx...",
          "timestamp": "2024-01-01T12:00:05.000Z"
        },
        {
          "role": "user",
          "message": "Hi Sarah, what's this about?",
          "timestamp": "2024-01-01T12:00:15.000Z"
        }
      ]
    },
    "analysis": {
      "summary": "Customer showed initial interest but was too busy to continue the conversation. Suggested calling back next week.",
      "successEvaluation": false,
      "sentiment": "neutral"
    }
  }
}
```

---

## n8n Workflow JSON (Complete Reference)

### Main Workflow JSON

```json
{
  "name": "AutoLynx Master Caller v9.5",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "2e9f09bc-7d53-4387-9d61-0fcb16a4d131",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "550bbfcc-72a3-4774-9307-d6aee90645ca",
      "name": "Chat Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [
        -64,
        320
      ],
      "webhookId": "2e9f09bc-7d53-4387-9d61-0fcb16a4d131"
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "c6e5eaf2-663d-4f44-a047-c60e3fb1aceb",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "ee215087-ee12-4e41-bfa8-2d8b762bc38b",
      "name": "File Upload Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [
        -64,
        528
      ],
      "webhookId": "c6e5eaf2-663d-4f44-a047-c60e3fb1aceb"
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 1
          },
          "conditions": [
            {
              "id": "input-type-condition",
              "leftValue": "={{ Object.keys($binary).length > 0 ? 'file' : 'chat' }}",
              "rightValue": "file",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "6acaa076-875b-45b9-8c34-191ae8f45b89",
      "name": "Input Type Detector",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        160,
        432
      ]
    }
  ],
  "pinData": {},
  "connections": {
    "Chat Trigger": {
      "main": [
        [
          {
            "node": "Input Type Detector",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "File Upload Trigger": {
      "main": [
        [
          {
            "node": "Input Type Detector",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": true,
  "settings": {
    "executionOrder": "v1"
  },
  "versionId": "685ea2e2-a485-a5d2-dabb-eec25aebb48c",
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "685ea2e2a485a5d2dabbeec25aebb48c49bc8ceb84063cc937a4ed9b48cb1d90"
  },
  "id": "master-caller-workflow",
  "tags": []
}
```

### Sub-Workflow for Call Processing

```json
{
  "name": "Call Processing Sub-Workflow",
  "nodes": [
    {
      "parameters": {
        "operation": "create",
        "resource": "call",
        "additionalFields": {
          "assistantId": "={{ $json.assistantId }}",
          "customer": {
            "name": "={{ $json.contactName }}",
            "number": "={{ $json.contactPhone }}"
          },
          "metadata": {
            "campaignId": "={{ $json.campaignId }}",
            "contactId": "={{ $json.contactId }}"
          }
        }
      },
      "id": "vapi-create-call",
      "name": "Vapi Create Call",
      "type": "n8n-nodes-base.vapi",
      "typeVersion": 1,
      "position": [
        300,
        200
      ]
    },
    {
      "parameters": {
        "operation": "insert",
        "schema": "public",
        "table": "calls",
        "columns": {
          "mappingMode": "defineBelow",
          "value": {
            "campaign_id": "={{ $json.campaignId }}",
            "contact_id": "={{ $json.contactId }}",
            "provider_call_id": "={{ $('Vapi Create Call').item.json.id }}",
            "status": "QUEUED",
            "started_at": "={{ new Date().toISOString() }}"
          }
        }
      },
      "id": "supabase-insert-call",
      "name": "Supabase Insert Call",
      "type": "n8n-nodes-base.supabase",
      "typeVersion": 1,
      "position": [
        500,
        200
      ]
    }
  ],
  "connections": {
    "Vapi Create Call": {
      "main": [
        [
          {
            "node": "Supabase Insert Call",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

---

## Database Query Examples

### Campaign Management Queries

#### Get Active Call Count
```sql
-- Used by scheduler for concurrency management
SELECT COUNT(*) as active_calls
FROM calls 
WHERE campaign_id = $1 
  AND status IN ('QUEUED', 'RINGING', 'IN_PROGRESS');
```

#### Get Next Contacts to Call
```sql
-- Used by scheduler to find contacts without calls
SELECT c.id, c.name, c.business_name, c.phone, c.batch_index
FROM contacts c
LEFT JOIN calls ca ON ca.contact_id = c.id
WHERE c.campaign_id = $1 
  AND ca.id IS NULL
ORDER BY c.batch_index, c.created_at
LIMIT $2;
```

#### Campaign Progress Summary
```sql
-- Dashboard summary query
SELECT 
  c.id,
  c.name,
  c.mode,
  c.cap,
  c.total_contacts,
  c.started_at,
  c.completed_at,
  COALESCE(call_stats.total_calls, 0) as total_calls,
  COALESCE(call_stats.completed_calls, 0) as completed_calls,
  COALESCE(call_stats.active_calls, 0) as active_calls,
  COALESCE(call_stats.total_cost, 0) as total_cost
FROM campaigns c
LEFT JOIN (
  SELECT 
    campaign_id,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status IN ('ENDED', 'FAILED', 'CANCELED', 'TIMEOUT')) as completed_calls,
    COUNT(*) FILTER (WHERE status IN ('QUEUED', 'RINGING', 'IN_PROGRESS')) as active_calls,
    SUM(cost_usd) as total_cost
  FROM calls
  GROUP BY campaign_id
) call_stats ON call_stats.campaign_id = c.id
WHERE c.id = $1;
```

### Call Event Queries

#### Insert Call Event (Webhook Handler)
```sql
-- Immutable event logging
INSERT INTO call_events (call_id, status, payload)
VALUES ($1, $2, $3)
RETURNING id, created_at;
```

#### Update Call Status
```sql
-- Update call with webhook data
UPDATE calls 
SET 
  status = $2,
  ended_at = CASE WHEN $2 IN ('ENDED', 'FAILED', 'CANCELED', 'TIMEOUT') THEN $3 ELSE ended_at END,
  ended_reason = $4,
  cost_usd = $5,
  recording_url = $6,
  transcript_json = $7,
  success_evaluation = $8,
  last_status_at = NOW()
WHERE provider_call_id = $1;
```

### Analytics Queries

#### Call Success Rate by Assistant
```sql
-- Assistant performance analytics
SELECT 
  a.name as assistant_name,
  COUNT(c.*) as total_calls,
  COUNT(*) FILTER (WHERE c.success_evaluation = true) as successful_calls,
  ROUND(
    COUNT(*) FILTER (WHERE c.success_evaluation = true)::DECIMAL / 
    NULLIF(COUNT(c.*), 0) * 100, 2
  ) as success_rate,
  AVG(c.cost_usd) as avg_cost
FROM assistants a
JOIN campaigns camp ON camp.assistant_id = a.id
JOIN calls c ON c.campaign_id = camp.id
WHERE c.status = 'ENDED'
  AND c.ended_at >= NOW() - INTERVAL '30 days'
GROUP BY a.id, a.name
ORDER BY success_rate DESC;
```

#### Daily Call Volume
```sql
-- Call volume trends
SELECT 
  DATE(started_at) as call_date,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE status = 'ENDED') as completed_calls,
  COUNT(*) FILTER (WHERE success_evaluation = true) as successful_calls,
  SUM(cost_usd) as total_cost
FROM calls
WHERE started_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(started_at)
ORDER BY call_date DESC;
```

---

## Testing Data & Scripts

### Sample Test Data

#### Create Test Assistant
```sql
INSERT INTO assistants (
  name,
  source,
  provider_assistant_id,
  config_json,
  active
) VALUES (
  'Test Assistant',
  'local',
  'test_assistant_123',
  '{"model": "gpt-4", "voice": {"provider": "11labs", "voiceId": "test"}}',
  true
);
```

#### Create Test Campaign
```sql
INSERT INTO campaigns (
  name,
  mode,
  cap,
  assistant_id,
  phone_number_id,
  total_contacts
) VALUES (
  'Test Campaign',
  'continuous',
  2,
  (SELECT id FROM assistants WHERE name = 'Test Assistant'),
  'test_phone_number',
  3
);
```

#### Create Test Contacts
```sql
INSERT INTO contacts (campaign_id, name, business_name, phone, batch_index)
SELECT 
  c.id,
  'Test Contact ' || generate_series,
  'Test Business ' || generate_series,
  '+155500000' || LPAD(generate_series::text, 2, '0'),
  (generate_series - 1) / 2  -- 2 contacts per batch
FROM campaigns c
CROSS JOIN generate_series(1, 3)
WHERE c.name = 'Test Campaign';
```

### Cleanup Scripts

#### Clean Test Data
```sql
-- Remove test data (in order of dependencies)
DELETE FROM call_events WHERE call_id IN (
  SELECT id FROM calls WHERE campaign_id IN (
    SELECT id FROM campaigns WHERE name LIKE 'Test%'
  )
);

DELETE FROM calls WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE name LIKE 'Test%'
);

DELETE FROM contacts WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE name LIKE 'Test%'
);

DELETE FROM campaigns WHERE name LIKE 'Test%';

DELETE FROM assistants WHERE name LIKE 'Test%';
```

#### Reset Auto-increment Sequences
```sql
-- Reset sequences if needed (PostgreSQL doesn't auto-reset UUIDs)
-- This is only needed if using SERIAL columns instead of UUIDs
```

---

## Troubleshooting Guide

### Common Issues

#### Webhook Signature Verification Failing
```typescript
// Debug webhook signature verification
function debugWebhookSignature(payload: string, signature: string, secret: string) {
  console.log('Payload:', payload);
  console.log('Received signature:', signature);
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
    
  console.log('Expected signature:', expectedSignature);
  
  return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
}
```

#### Stuck Calls Resolution
```sql
-- Find and mark stuck calls as TIMEOUT
UPDATE calls 
SET status = 'TIMEOUT', ended_at = NOW()
WHERE status IN ('QUEUED', 'RINGING', 'IN_PROGRESS')
  AND last_status_at < NOW() - INTERVAL '10 minutes';
```

#### Campaign Not Starting
```sql
-- Debug campaign start issues
SELECT 
  c.id,
  c.name,
  c.started_at,
  a.active as assistant_active,
  COUNT(contacts.id) as contact_count,
  COUNT(calls.id) as call_count
FROM campaigns c
JOIN assistants a ON a.id = c.assistant_id
LEFT JOIN contacts ON contacts.campaign_id = c.id
LEFT JOIN calls ON calls.campaign_id = c.id
WHERE c.started_at IS NULL
GROUP BY c.id, c.name, c.started_at, a.active;
```

### Performance Debugging

#### Slow Query Analysis
```sql
-- Enable query logging (requires superuser)
-- ALTER SYSTEM SET log_statement = 'all';
-- SELECT pg_reload_conf();

-- Find slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements
WHERE mean_time > 1000  -- queries slower than 1 second
ORDER BY mean_time DESC;
```

#### Index Usage Analysis
```sql
-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

---

## Migration Utilities

### Data Export Scripts

#### Export Campaign Data
```sql
-- Export complete campaign with all related data
\copy (
  SELECT 
    c.name as campaign_name,
    cont.name as contact_name,
    cont.business_name,
    cont.phone,
    calls.status as call_status,
    calls.ended_reason,
    calls.cost_usd,
    calls.recording_url,
    calls.transcript_json::text as transcript
  FROM campaigns c
  JOIN contacts cont ON cont.campaign_id = c.id
  LEFT JOIN calls ON calls.contact_id = cont.id
  WHERE c.id = 'campaign-uuid-here'
  ORDER BY cont.name
) TO 'campaign_export.csv' WITH CSV HEADER;
```

#### Backup Schema
```bash
# Backup complete schema
pg_dump -h db.project.supabase.co -U postgres -d postgres --schema-only > schema_backup.sql

# Backup data only
pg_dump -h db.project.supabase.co -U postgres -d postgres --data-only --table=assistants --table=campaigns > data_backup.sql
```

This completes the comprehensive sharding of the AutoLynx architecture documentation. The original 2,383-line document has been successfully broken down into 8 focused, manageable documents that enable parallel development and easier navigation while maintaining all the original technical detail and specifications. 