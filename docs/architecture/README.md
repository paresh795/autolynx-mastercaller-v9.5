# AutoLynx Architecture — Sharded Documentation

> **Architecture Document v1.0**  
> **CSV-driven Outbound Calling System**  
> **2,383 lines → 8 focused documents**

This comprehensive architecture document has been broken down into focused documents for better maintainability, faster navigation, and parallel team development.

## Document Structure

### 🎯 [System Overview](./system-overview.md)
**High-level architecture and design principles**
- Purpose & summary
- System context and actors
- Component overview
- Design pillars and non-goals

### 🔄 [Concurrency & Flows](./concurrency-flows.md)  
**Campaign management and call flow orchestration**
- Concurrency models (Continuous Cap vs Strict Batching)
- Monitoring strategies (Call-ID vs Phone Number)
- Key workflows step-by-step
- Batch semantics and gating strategies

### 🔌 [API Design](./api-design.md)
**Complete API specification and integration points**
- Internal app routes (Assistants, Campaigns, Webhooks)
- Read models for UI
- Error handling and retries
- Vapi integration patterns

### 🗄️ [Data Architecture](./data-architecture.md)
**Database design and data management**
- Complete SQL schema with enums and indexes
- Table relationships and constraints
- Transcript storage decisions
- RLS and multi-tenancy considerations

### 🤖 [Assistant Management](./assistant-management.md)
**Assistant Directory system and lifecycle**
- Persistent vs ephemeral assistants
- Create, import, update, delete workflows
- Template management
- Campaign integration

### 🔒 [Security & Auth](./security-auth.md)
**Authentication, authorization, and security measures**
- Supabase Auth integration
- Allow-list management
- Webhook security
- PII handling and privacy

### 🚀 [Deployment & Operations](./deployment-ops.md)
**Infrastructure, configuration, and operational concerns**
- Vercel + Supabase deployment
- Environment configuration
- Monitoring and observability
- Testing strategy and defaults

### 📋 [Reference Materials](./reference-materials.md)
**SQL quickstart, examples, and integration templates**
- Copy-paste SQL DDL
- Environment variable templates
- n8n workflow JSON (complete)
- Vapi integration examples

## Quick Navigation

### By Role
- **🏗️ System Architect**: Start with [System Overview](./system-overview.md) → [Data Architecture](./data-architecture.md)
- **💻 Backend Developer**: Focus on [API Design](./api-design.md) → [Data Architecture](./data-architecture.md) → [Concurrency & Flows](./concurrency-flows.md)
- **🤖 AI/Voice Engineer**: Review [Assistant Management](./assistant-management.md) → [API Design](./api-design.md)
- **🔒 Security Engineer**: Examine [Security & Auth](./security-auth.md) → [Deployment & Operations](./deployment-ops.md)
- **🚀 DevOps Engineer**: Study [Deployment & Operations](./deployment-ops.md) → [Reference Materials](./reference-materials.md)

### By Development Phase
1. **Planning**: [System Overview](./system-overview.md) + [Concurrency & Flows](./concurrency-flows.md)
2. **Design**: [Data Architecture](./data-architecture.md) + [API Design](./api-design.md)
3. **Implementation**: [Assistant Management](./assistant-management.md) + [Security & Auth](./security-auth.md)
4. **Deployment**: [Deployment & Operations](./deployment-ops.md) + [Reference Materials](./reference-materials.md)

## Key Architectural Decisions

### **Locked-In Decisions**
- **Assistant Selection**: Directory-based with dropdown selection at campaign start
- **Cron Cadence**: 60s default with jitter
- **Concurrency Cap**: 8 by default, user-configurable per campaign
- **Transcript Storage**: Inline JSONB in `calls.transcript_json` for v1
- **Truth Source**: Webhook-driven with Call-ID tracking (primary), phone number polling (health only)

### **Design Pillars** 
- **Event-driven truth** via webhooks; no long background loops
- **Call-ID tracking (primary)** for correctness; phone number polling (fallback) for health
- **Keep complexity down**: short Vercel functions + cron ticks
- **Assistant persistence**: no auto-deletes, reuse across campaigns

## Implementation Phases

0. **Assistant Directory**: Tables + CRUD + Vapi create/import/update; seed templates
1. **DB Schema + CRUD**: CSV upload; campaigns list/detail (assistant required)  
2. **Vapi Integration**: createCall using assistant from campaign; webhook handler; dashboard
3. **Scheduler Tick**: Continuous cap; stuck/timeout handling
4. **Advanced Features**: Strict batching; phone number health widget
5. **Production Polish**: Auth allow-list; alerts; cost/export

## Related Documents
- **PRD (Sharded)**: `../prd/` (product requirements)
- **Original Architecture**: `../architecture.md` (consolidated 2,383-line version)

---

*This sharded structure enables parallel development while maintaining architectural consistency and provides faster access to specific implementation details.* 