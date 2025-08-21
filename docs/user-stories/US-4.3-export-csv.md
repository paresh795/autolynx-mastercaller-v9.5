# US-4.3: Campaign Results CSV Export

## Story
**As an** operator  
**I want to** export campaign results to CSV  
**So that** I can analyze outcomes and share reports with stakeholders

## Story Points
**3** (Medium complexity - streaming export, data formatting)

## Priority
**P1** - High (Important for analysis)

## Acceptance Criteria
1. **Export Functionality**
   - Export button on campaign detail page
   - Includes all contact and call data
   - Streams for large datasets (10k+ records)
   - Downloads as .csv file

2. **Data Completeness**
   - Contact: name, business_name, phone
   - Call: status, started_at, ended_at, duration
   - Outcome: ended_reason, cost_usd
   - Recording: recording_url, transcript_summary
   - Campaign: name, assistant_used

3. **Performance**
   - 10,000 records export in <30 seconds
   - No memory issues with large datasets
   - Progress indicator during export
   - Can export during active campaign

4. **File Format**
   - Standard CSV with headers
   - UTF-8 encoding
   - Proper escaping for commas/quotes
   - Timestamp in ISO format

5. **Access Control**
   - Only campaign owner can export
   - Export action logged
   - No sensitive data in filename
   - Temporary download link expires

## Technical Implementation Notes

### Streaming Export
```typescript
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const campaignId = params.id;
  
  // Verify access
  await verifyCampaignAccess(campaignId);
  
  // Create readable stream
  const stream = new ReadableStream({
    async start(controller) {
      // Send headers
      const headers = [
        'name', 'business_name', 'phone', 
        'call_status', 'started_at', 'ended_at', 
        'duration_seconds', 'ended_reason', 'cost_usd',
        'recording_url', 'transcript_summary'
      ];
      controller.enqueue(headers.join(',') + '\n');
      
      // Stream data in batches
      const BATCH_SIZE = 100;
      let offset = 0;
      
      while (true) {
        const batch = await getExportBatch(campaignId, offset, BATCH_SIZE);
        if (batch.length === 0) break;
        
        for (const row of batch) {
          const csvRow = formatExportRow(row);
          controller.enqueue(csvRow + '\n');
        }
        
        offset += BATCH_SIZE;
      }
      
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="campaign-${campaignId}-export.csv"`
    }
  });
}
```

### Data Query
```sql
-- Export query with joins
SELECT 
  c.name,
  c.business_name,
  c.phone,
  ca.status as call_status,
  ca.started_at,
  ca.ended_at,
  EXTRACT(EPOCH FROM (ca.ended_at - ca.started_at)) as duration_seconds,
  ca.ended_reason,
  ca.cost_usd,
  ca.recording_url,
  LEFT(ca.transcript_json->>'text', 100) as transcript_summary
FROM contacts c
LEFT JOIN calls ca ON c.id = ca.contact_id
WHERE c.campaign_id = $1
ORDER BY c.created_at;
```

### CSV Formatting
```typescript
function formatExportRow(row: ExportRow): string {
  const values = [
    escapeCsvValue(row.name),
    escapeCsvValue(row.business_name),
    row.phone,
    row.call_status || 'PENDING',
    row.started_at?.toISOString() || '',
    row.ended_at?.toISOString() || '',
    row.duration_seconds?.toString() || '',
    escapeCsvValue(row.ended_reason || ''),
    row.cost_usd?.toString() || '',
    row.recording_url || '',
    escapeCsvValue(row.transcript_summary || '')
  ];
  
  return values.join(',');
}

function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

## Dependencies
- Campaign and call data available
- Authentication system

## Test Cases
1. **Export Functionality**
   - Click export → Download starts
   - Large dataset → Streams correctly
   - Empty campaign → Headers only

2. **Data Accuracy**
   - All contacts included
   - Call data matches UI
   - Timestamps correct format
   - Currency formatted properly

3. **Performance**
   - 10k records → <30 seconds
   - Memory usage stable
   - No timeout errors
   - Progress shown to user

4. **File Format**
   - Valid CSV structure
   - Special characters escaped
   - Opens in Excel correctly
   - UTF-8 encoding preserved

5. **Security**
   - Unauthorized user → 403
   - Invalid campaign → 404
   - Export logged → Audit trail

## UI Mockup Description
- Export button in campaign header
- Dropdown with format options (CSV only for v1)
- Progress modal during export
- Success notification with download
- Export history in settings

## Definition of Ready
- [ ] Export format finalized
- [ ] Performance requirements set
- [ ] Security requirements clear

## Definition of Done
- [ ] Export generates correct CSV
- [ ] Streaming works for large datasets
- [ ] Performance meets requirements
- [ ] All data fields included
- [ ] CSV format validated
- [ ] Security checks implemented
- [ ] Unit tests for formatting
- [ ] Integration tests for export
- [ ] Performance tested
- [ ] Documentation updated

## Notes
- Consider multiple format support later
- Add custom field selection
- Track export frequency
- Consider scheduled exports
- Add export templates