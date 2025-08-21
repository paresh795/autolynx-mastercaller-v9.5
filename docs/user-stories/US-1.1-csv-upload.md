# US-1.1: CSV File Upload Interface

## Story
**As an** operator  
**I want to** upload a CSV file containing contact information  
**So that** I can quickly import multiple contacts for a calling campaign

## Story Points
**3** (Medium complexity - file handling, validation, UI)

## Priority
**P0** - Critical (Core functionality)

## Acceptance Criteria
1. **File Selection**
   - User can select a CSV file through a file input or drag-and-drop interface
   - Only .csv files are accepted (file type validation)
   - Maximum file size of 10MB is enforced
   - Clear error message shown for invalid file types or oversized files

2. **Upload Progress**
   - Progress indicator shows during file upload
   - Upload can be cancelled before completion
   - Success message displays when upload completes

3. **File Validation**
   - System validates CSV has required headers: name, business_name, phone
   - Headers are case-insensitive
   - Missing headers trigger clear error message
   - Empty files are rejected with appropriate message

4. **User Experience**
   - Drag-and-drop zone clearly marked
   - File input has clear labeling
   - Selected file name is displayed
   - Option to remove/change file before processing

## Technical Implementation Notes

### Frontend
- Use Next.js App Router with server action for file handling
- Implement react-dropzone or native HTML5 drag-and-drop
- File validation on client before upload
- Multipart form data for file transmission

### Backend
- API endpoint: `POST /api/campaigns/upload`
- Stream parsing for memory efficiency
- Return upload session ID for tracking
- Store raw file temporarily for processing

### Validation Rules
```typescript
interface CSVHeaders {
  name: string;
  business_name: string;
  phone: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['text/csv', 'application/csv'];
```

## Dependencies
- None (first story in the flow)

## Test Cases
1. **Happy Path**
   - Upload valid CSV with all headers → Success
   - Drag and drop valid file → Success

2. **Error Cases**
   - Upload .xlsx file → Error: "Please upload a CSV file"
   - Upload 15MB file → Error: "File too large. Maximum size is 10MB"
   - Upload CSV missing headers → Error: "Missing required headers: [list]"
   - Upload empty file → Error: "File is empty"

3. **Edge Cases**
   - Upload CSV with BOM → Handles correctly
   - Upload CSV with different header cases → Accepts
   - Cancel upload midway → Cleans up properly

## UI Mockup Description
- Card component with dashed border for drop zone
- Icon indicating drag-and-drop capability
- "Choose File" button as alternative
- File name display with remove button
- Progress bar during upload
- Success/error alerts

## Definition of Ready
- [ ] UI designs approved
- [ ] API endpoint specification reviewed
- [ ] File size and type limits confirmed

## Definition of Done
- [ ] File upload works via button and drag-drop
- [ ] All validation rules implemented
- [ ] Error messages are user-friendly
- [ ] Unit tests for validation logic
- [ ] Integration test for upload flow
- [ ] Responsive design for mobile/desktop
- [ ] Documentation updated

## Notes
- Consider chunked upload for future if larger files needed
- May need virus scanning in production
- Track upload metrics for monitoring