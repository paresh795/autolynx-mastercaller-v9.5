# US-1.4: Contact Import & Normalization

## Story
**As an** operator  
**I want to** have my contacts properly normalized and stored  
**So that** calls can be placed successfully to valid phone numbers

## Story Points
**5** (High complexity - normalization logic, batch processing)

## Priority
**P0** - Critical (Required for calling)

## Acceptance Criteria
1. **Phone Normalization**
   - Convert to E.164 format (+1XXXXXXXXXX for US)
   - Handle various input formats: (555) 123-4567, 555.123.4567, etc.
   - Add +1 country code when missing (US default)
   - Strip extensions (x123, ext 123)
   - Store normalized and original format

2. **Batch Processing**
   - Process contacts in batches of 100
   - Transaction per batch for reliability
   - Progress tracking during import
   - Resumable on failure

3. **Duplicate Handling**
   - Detect duplicates within campaign (by normalized phone)
   - Keep first occurrence, skip duplicates
   - Report duplicate count in summary
   - No duplicates in database

4. **Data Storage**
   - Store all contact fields
   - Link to campaign ID
   - Assign batch_index for batch mode
   - Track import timestamp

5. **Import Report**
   - Total contacts processed
   - Successfully imported count
   - Normalized phone count
   - Duplicates skipped count
   - Failed normalizations with reasons

## Technical Implementation Notes

### Normalization Pipeline
```typescript
interface NormalizationResult {
  success: boolean;
  normalized?: string;
  original: string;
  error?: string;
}

class PhoneNormalizer {
  normalize(phone: string): NormalizationResult {
    // Remove non-numeric except leading +
    // Validate length
    // Add country code if missing
    // Format to E.164
  }
}
```

### Batch Processing
```typescript
async function importContacts(
  contacts: RawContact[],
  campaignId: string
) {
  const BATCH_SIZE = 100;
  const results = {
    imported: 0,
    duplicates: 0,
    failed: 0
  };
  
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    await processBatch(batch, campaignId, results);
  }
  
  return results;
}
```

### Database Schema
```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id),
  name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  phone TEXT NOT NULL,        -- Normalized E.164
  phone_original TEXT,        -- As provided
  batch_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, phone)
);
```

## Dependencies
- US-1.2 (Validation complete)
- US-1.3 (Campaign created)

## Test Cases
1. **Normalization Success**
   - (555) 123-4567 → +15551234567
   - 555.123.4567 → +15551234567
   - 15551234567 → +15551234567
   - +1-555-123-4567 → +15551234567

2. **Extensions Handling**
   - 555-123-4567 x123 → +15551234567
   - 5551234567 ext 99 → +15551234567

3. **Invalid Numbers**
   - 123 → Error: Too short
   - 555-CALL-NOW → Partial: +15552255
   - Empty → Error: Required

4. **Duplicates**
   - Same number twice → Second skipped
   - Different format, same normalized → Skipped

5. **Batch Processing**
   - 1000 contacts → 10 batches processed
   - Failure at batch 5 → Can resume

## UI Mockup Description
- Progress bar showing import progress
- Real-time counters updating
- Import summary card when complete
- Table showing sample of imported contacts
- Error details expandable section
- Option to download import report

## Definition of Ready
- [ ] Normalization rules finalized
- [ ] E.164 format confirmed for US
- [ ] Batch size determined

## Definition of Done
- [ ] Phone normalization working for all formats
- [ ] Batch processing implemented
- [ ] Duplicates properly handled
- [ ] Import report accurate
- [ ] Database constraints enforced
- [ ] Unit tests for normalizer
- [ ] Integration tests for import
- [ ] Performance tested with 10k contacts
- [ ] Documentation updated

## Notes
- Consider international number support later
- May need custom normalization rules per client
- Track normalization success rate
- Consider async processing for large imports
- Store normalization rules version for future changes