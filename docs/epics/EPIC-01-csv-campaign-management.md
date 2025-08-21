# EPIC-01: CSV Campaign Management

## Epic Overview
Enable operators to efficiently upload CSV files containing contact information and create calling campaigns with proper validation, error handling, and progress tracking.

## Business Value
- Streamlines the campaign creation process from CSV data
- Ensures data quality through comprehensive validation
- Provides clear feedback on import success/failures
- Enables efficient contact management at scale

## Success Criteria
- [ ] CSV files up to 10,000 contacts can be uploaded and processed
- [ ] Invalid data is clearly reported with row-level error details
- [ ] Phone numbers are normalized to E.164 format
- [ ] Duplicate contacts within a campaign are prevented
- [ ] Campaign creation completes within 30 seconds for 1,000 contacts
- [ ] Import reports show accepted vs rejected records

## User Stories
- **US-1.1**: CSV File Upload Interface
- **US-1.2**: CSV Validation & Error Reporting
- **US-1.3**: Campaign Creation Flow
- **US-1.4**: Contact Import & Normalization
- **US-1.5**: Campaign List View
- **US-1.6**: Campaign Detail View

## Technical Components
- CSV parser with streaming support
- Phone number normalization library
- Database schema for campaigns and contacts
- API endpoints for campaign CRUD operations
- Real-time progress indicators

## Dependencies
- Supabase database setup complete
- Authentication system in place
- File upload infrastructure configured

## Acceptance Tests
1. Upload valid CSV with 100 contacts → All imported successfully
2. Upload CSV with mixed valid/invalid data → Clear report of accepted/rejected
3. Upload CSV with duplicate phone numbers → Deduplication handled correctly
4. Upload malformed CSV → Graceful error handling
5. Create campaign with 1,000 contacts → Completes in <30 seconds

## Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Large file uploads timeout | High | Implement streaming parser |
| Invalid phone formats | Medium | Robust normalization with fallbacks |
| Memory issues with large CSVs | High | Process in batches |

## Definition of Done
- All user stories completed and tested
- CSV parsing handles edge cases
- Phone normalization works for US numbers
- Database constraints enforce data integrity
- API endpoints have proper validation
- Integration tests cover happy and error paths
- Documentation updated

## Metrics
- Average time to import 1,000 contacts
- Percentage of successfully normalized phone numbers
- Error rate in CSV processing
- User task completion rate for campaign creation

## Notes
This epic forms the foundation of the system. Without reliable CSV import and campaign management, the calling features cannot function. Priority should be given to robust error handling and clear user feedback.