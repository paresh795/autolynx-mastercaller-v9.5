-- AutoLynx Database Schema
-- Run this in your Supabase SQL Editor

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enums (drop first if they exist)
DROP TYPE IF EXISTS call_status CASCADE;
CREATE TYPE call_status AS ENUM (
  'QUEUED','RINGING','IN_PROGRESS','ENDED','FAILED','CANCELED','TIMEOUT'
);

DROP TYPE IF EXISTS campaign_mode CASCADE;
CREATE TYPE campaign_mode AS ENUM ('continuous','batch');

DROP TYPE IF EXISTS assistant_source CASCADE;
CREATE TYPE assistant_source AS ENUM ('local','imported','template');

-- Assistants table
CREATE TABLE IF NOT EXISTS assistants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  source                 assistant_source NOT NULL DEFAULT 'local',
  provider               TEXT NOT NULL DEFAULT 'vapi',
  provider_assistant_id  TEXT UNIQUE NOT NULL,
  config_json            JSONB NOT NULL DEFAULT '{}'::JSONB,
  active                 BOOLEAN NOT NULL DEFAULT true,
  ephemeral              BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for assistants
CREATE INDEX IF NOT EXISTS idx_assistants_active ON assistants(active);
CREATE INDEX IF NOT EXISTS idx_assistants_source ON assistants(source);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  mode             campaign_mode NOT NULL DEFAULT 'continuous',
  cap              INT NOT NULL DEFAULT 8 CHECK (cap BETWEEN 1 AND 50),
  assistant_id     UUID NOT NULL REFERENCES assistants(id),
  phone_number_id  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  total_contacts   INT NOT NULL DEFAULT 0,
  stats_json       JSONB NOT NULL DEFAULT '{}'::JSONB
);

-- Indexes for campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_assistant ON campaigns(assistant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at DESC);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  business_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  phone_original TEXT,
  batch_index    INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, phone)
);

-- Indexes for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_batch ON contacts(campaign_id, batch_index);

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
  last_status_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for calls
CREATE INDEX IF NOT EXISTS idx_calls_campaign_status ON calls(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_provider ON calls(provider_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON calls(contact_id);

-- Call events table (immutable audit log)
CREATE TABLE IF NOT EXISTS call_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  status     call_status NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for call events
CREATE INDEX IF NOT EXISTS idx_call_events_call ON call_events(call_id);
CREATE INDEX IF NOT EXISTS idx_call_events_created ON call_events(created_at DESC);

-- Create a view for campaign summaries
CREATE OR REPLACE VIEW campaign_summaries AS
SELECT 
  c.id,
  c.name,
  c.mode,
  c.cap,
  c.created_at,
  c.started_at,
  c.completed_at,
  c.total_contacts,
  a.name as assistant_name,
  COALESCE(call_stats.total_calls, 0) as total_calls,
  COALESCE(call_stats.completed_calls, 0) as completed_calls,
  COALESCE(call_stats.active_calls, 0) as active_calls,
  COALESCE(call_stats.failed_calls, 0) as failed_calls
FROM campaigns c
LEFT JOIN assistants a ON c.assistant_id = a.id
LEFT JOIN (
  SELECT 
    campaign_id,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status IN ('ENDED', 'FAILED', 'CANCELED', 'TIMEOUT')) as completed_calls,
    COUNT(*) FILTER (WHERE status IN ('QUEUED', 'RINGING', 'IN_PROGRESS')) as active_calls,
    COUNT(*) FILTER (WHERE status IN ('FAILED', 'TIMEOUT')) as failed_calls
  FROM calls
  GROUP BY campaign_id
) call_stats ON c.id = call_stats.campaign_id;

-- Function to update campaign stats
CREATE OR REPLACE FUNCTION update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update campaign completion status
  IF NEW.status IN ('ENDED', 'FAILED', 'CANCELED', 'TIMEOUT') THEN
    -- Check if all calls are complete
    IF NOT EXISTS (
      SELECT 1 FROM calls 
      WHERE campaign_id = NEW.campaign_id 
      AND status IN ('QUEUED', 'RINGING', 'IN_PROGRESS')
    ) THEN
      -- Mark campaign as completed
      UPDATE campaigns 
      SET completed_at = NOW() 
      WHERE id = NEW.campaign_id 
      AND completed_at IS NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update campaign stats
CREATE TRIGGER trigger_update_campaign_stats
  AFTER UPDATE OF status ON calls
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_stats();

-- RLS Policies (basic for now, will expand for multi-tenant later)
-- For now, just enable RLS but don't restrict (single tenant)
ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_events ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (single tenant for now)
CREATE POLICY "Allow all for authenticated users" ON assistants FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users" ON campaigns FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users" ON contacts FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users" ON calls FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users" ON call_events FOR ALL TO authenticated USING (true);

-- Initial data verification
SELECT 'Schema setup complete!' as status;