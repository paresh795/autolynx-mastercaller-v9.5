# US-1.2: CSV Validation & Error Reporting

## Story
**As an** operator  
**I want to** receive detailed validation feedback on my CSV data  
**So that** I can fix any issues before the campaign starts

## Story Points
**5** (High complexity - complex validation logic, detailed reporting)

## Priority
**P0** - Critical (Data quality essential)

## Acceptance Criteria
1. **Row-Level Validation**
   - Each row is validated independently
   - Invalid rows are collected with specific error reasons
   - Row numbers are included in error reports
   - Validation continues even after finding errors

2. **Phone Number Validation**
   - Phone numbers validated for basic format
   - International format support (+1 for US)
   - Invalid phone numbers flagged with reason
   - Duplicate phone numbers within file detected

3. **Field Validation**
   - Name field: Required, max 100 characters
   - Business name: Required, max 200 characters
   - Phone: Required, valid format
   - Empty or whitespace-only fields rejected

4. **Validation Report**
   - Summary shows: Total rows, Valid rows, Invalid rows
   - Detailed list of errors by row number
   - Downloadable error report as CSV
   - Option to proceed with valid rows only

5. **Performance**
   - Validation completes within 10 seconds for 10,000 rows
   - Progress indicator during validation
   - Validation can be cancelled

## Technical Implementation Notes

### Validation Pipeline
```typescript
interface ValidationResult {
  valid: ContactData[];
  invalid: InvalidRow[];
  summary: ValidationSummary;
}

interface InvalidRow {
  row: number;
  data: Partial<ContactData>;
  errors: string[];
}

interface ValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicates: number;
}
```

### Validation Rules
1. **Phone Normalization**
   - Strip non-numeric characters
   - Add country code if missing
   - Validate length (10-15 digits)

2. **Duplicate Detection**
   - Check within current file
   - Check against existing campaign contacts

3. **Character Encoding**
   - Handle UTF-8, ASCII
   - Sanitize special characters

### Backend Processing
- Stream processing for memory efficiency
- Batch validation for performance
- Transaction for valid row insertion

## Dependencies
- US-1.1 (File upload must be complete)

## Test Cases
1. **Valid Data**
   - All valid rows → 100% success
   - 90% valid, 10% invalid → Report shows both

2. **Invalid Phone Numbers**
   - Letters in phone → Error: "Invalid characters"
   - Too short (5 digits) → Error: "Phone too short"
   - Too long (20 digits) → Error: "Phone too long"

3. **Missing Fields**
   - Missing name → Error: "Name is required"
   - Missing phone → Error: "Phone is required"
   - Empty row → Skipped with note

4. **Duplicates**
   - Same phone twice → Warning: "Duplicate phone"
   - Case variations → Detected as duplicate

5. **Large Files**
   - 10,000 rows → Completes in <10 seconds
   - Mixed valid/invalid → Accurate counts

## UI Mockup Description
- Validation results modal/page
- Summary cards: Total, Valid, Invalid
- Table showing invalid rows with errors
- Download button for error report
- Action buttons: "Fix and Re-upload" or "Proceed with Valid"
- Progress bar during validation

## Definition of Ready
- [ ] Validation rules documented
- [ ] Error message templates approved
- [ ] Performance requirements confirmed

## Definition of Done
- [ ] All validation rules implemented
- [ ] Row-level error reporting works
- [ ] Error report downloadable
- [ ] Performance meets requirements
- [ ] Unit tests for each validation rule
- [ ] Integration tests for full pipeline
- [ ] User-friendly error messages
- [ ] Documentation updated

## Notes
- Consider async validation for very large files
- May need to add custom validation rules per client
- Track common validation errors for UX improvements
- Consider machine learning for phone number format detection