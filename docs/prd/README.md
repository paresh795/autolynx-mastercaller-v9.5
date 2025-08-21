# AutoLynx PRD — Sharded Documentation

> **Product Requirements Document v1.0**  
> **CSV-driven Outbound Calling System**

This PRD has been broken down into focused documents for better maintainability and navigation.

## Document Structure

### 📋 [Overview](./overview.md)
**Core vision, success criteria, and scope definition**
- Purpose & vision statement
- Success criteria and key metrics
- In-scope vs out-of-scope features
- User personas and key decisions

### 🔄 [User Flows](./user-flows.md)
**End-to-end workflows and user stories**
- CSV import and campaign creation
- Campaign start and monitoring flows
- Concurrency management modes
- State transitions and edge cases

### ⚙️ [Technical Requirements](./technical-requirements.md)
**Functional and non-functional requirements**
- Authentication and authorization
- CSV processing and validation
- Assistant directory management
- Performance and reliability targets

### 🔌 [API Specification](./api-spec.md)
**Complete API interface documentation**
- Internal app routes and endpoints
- Request/response schemas
- Authentication and security
- Error handling and rate limiting

### 🗄️ [Data Model](./data-model.md)
**Database schema and relationships**
- Core tables and constraints
- Indexes and performance considerations
- Data integrity and business rules
- Privacy and retention policies

### 🚀 [Deployment](./deployment.md)
**Infrastructure and operations**
- Architecture overview
- Environment configuration
- Monitoring and observability
- Security and disaster recovery

## Quick Navigation

### By Role
- **👤 Product Manager**: Start with [Overview](./overview.md) → [User Flows](./user-flows.md)
- **💻 Developer**: Focus on [Technical Requirements](./technical-requirements.md) → [API Spec](./api-spec.md) → [Data Model](./data-model.md)
- **🔧 DevOps**: Review [Deployment](./deployment.md) and security considerations
- **📊 Analyst**: Examine [Data Model](./data-model.md) and metrics in [Technical Requirements](./technical-requirements.md)

### By Development Phase
1. **Planning**: [Overview](./overview.md) + [User Flows](./user-flows.md)
2. **Architecture**: [Technical Requirements](./technical-requirements.md) + [Data Model](./data-model.md)
3. **Implementation**: [API Spec](./api-spec.md) + [Technical Requirements](./technical-requirements.md)
4. **Deployment**: [Deployment](./deployment.md)

## Key Decisions (Locked)
- **Default concurrency cap**: 8 calls
- **Cron cadence**: 60s ± jitter
- **Truth source**: Webhook-driven call status
- **Assistant model**: Persistent directory (no auto-deletes)
- **Transcript storage**: Inline JSONB in database

## Related Documents
- **Architecture Document**: `../architecture.md` (implementation details)
- **Original PRD**: `../prd.md` (consolidated version)

---

*This sharded structure enables parallel work across teams while maintaining consistency with the overall product vision.* 