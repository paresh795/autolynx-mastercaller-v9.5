# EPIC-02: Assistant Directory

## Epic Overview
Implement a comprehensive Assistant Directory system that enables users to create, import, manage, and reuse Vapi assistants across multiple campaigns, eliminating the need for per-campaign assistant creation.

## Business Value
- Reduces setup time by enabling assistant reuse
- Prevents accidental deletion of active assistants
- Provides templates for common use cases
- Centralizes assistant management
- Improves campaign creation efficiency

## Success Criteria
- [ ] Users can create new assistants with custom configurations
- [ ] Existing Vapi assistants can be imported by ID
- [ ] Assistant templates are available for common scenarios
- [ ] Assistants persist across campaigns (no auto-delete)
- [ ] Campaign creation requires selecting from available assistants
- [ ] Assistant configurations can be edited and versioned

## User Stories
- **US-2.1**: Assistant Creation with Vapi Integration
- **US-2.2**: Import Existing Assistant by ID
- **US-2.3**: Edit Assistant Configuration
- **US-2.4**: Assistant Templates Library
- **US-2.5**: Assistant Selection in Campaign Flow

## Technical Components
- Assistant management database schema
- Vapi API integration for assistant CRUD
- Configuration JSON storage and versioning
- Template seeding system
- Assistant-campaign relationship tracking

## Dependencies
- Vapi API credentials configured
- Database schema for assistants table
- Authentication system for admin operations

## Acceptance Tests
1. Create new assistant → Vapi assistant created and ID stored
2. Import assistant by Vapi ID → Assistant registered in directory
3. Edit assistant configuration → Changes reflected in Vapi and DB
4. Delete assistant with active campaign → Deletion prevented
5. Select assistant for campaign → Campaign uses correct assistant ID
6. Clone template assistant → New assistant created with template config

## Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Vapi API failures | High | Implement retry logic with exponential backoff |
| Assistant config drift | Medium | Store config_json locally for reconciliation |
| Accidental deletion | High | Enforce referential integrity checks |
| Rate limiting | Medium | Cache assistant data, batch operations |

## Definition of Done
- Assistant CRUD operations fully functional
- Vapi integration tested with mock and real APIs
- Templates seeded for common use cases
- Assistant selection required in campaign flow
- Deletion protection for referenced assistants
- Configuration versioning implemented
- API endpoints secured with proper auth

## Metrics
- Number of assistants created vs imported
- Assistant reuse rate across campaigns
- Template usage frequency
- Time saved through assistant reuse
- API error rate for Vapi operations

## Notes
The Assistant Directory is critical for operational efficiency. It transforms assistants from ephemeral campaign resources to persistent, reusable assets. Special attention should be paid to the Vapi integration reliability and configuration management.