# Phase 4: CSV Import & Transaction Management

## Overview
This phase implements the CSV import functionality that allows users to upload bank transaction files and automatically process them into the ledger system. All imported transactions are initially assigned to the Pending envelope for later allocation. The focus is on robust file handling, intelligent parsing, and clear user feedback.

## Duration
1 week (Week 4)

## Objectives
- Implement CSV file upload and parsing without external libraries
- Auto-detect common bank CSV formats
- Process transactions directly to the Pending envelope
- Handle various date and amount formats
- Provide clear feedback on import success/failure
- Implement comprehensive testing with TDD approach
- Deliver polished upload interface with proper error handling

## Deliverables

### 1. Backend API Implementation

#### CSV Import Endpoint
- `POST /api/import/upload` - Single endpoint for CSV processing
  - File upload handling
  - Format detection
  - Parsing and validation
  - Direct ledger integration
  - Success/error response

#### Response Format
```python
class ImportResult(BaseModel):
    success: bool
    imported_count: int
    failed_count: int
    errors: List[ImportError]
    duplicate_count: int
    total_amount: Decimal
    date_range: DateRange
```

### 2. CSV Processing Logic

#### Parser Implementation
```python
import csv
from io import StringIO
from datetime import datetime
from decimal import Decimal

class CSVProcessor:
    def detect_format(self, headers: List[str]) -> BankFormat
    def parse_date(self, date_str: str) -> date
    def parse_amount(self, amount_str: str) -> Decimal
    def detect_encoding(self, file_bytes: bytes) -> str
    def process_row(self, row: dict) -> Transaction
    def validate_transaction(self, transaction: Transaction) -> bool
```

#### Supported Bank Formats
- **Generic Format**: Date, Description, Amount
- **Common Patterns**:
  - Date variations: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
  - Amount patterns: 1,234.56, -1234.56, (1234.56), separate debit/credit columns
  - Description cleaning: Remove extra whitespace, normalize characters

#### Processing Workflow
1. Detect file encoding (UTF-8, ISO-8859-1, etc.)
2. Read and parse CSV headers
3. Auto-detect bank format or use generic
4. Process each row:
   - Parse date
   - Parse amount (handle negatives)
   - Clean description
   - Generate transaction ID
5. Check for duplicates
6. Write to ledger with Pending envelope
7. Return summary

### 3. Duplicate Detection

#### Strategies
```python
class DuplicateDetector:
    def generate_hash(self, transaction: Transaction) -> str
        # Hash of date + amount + description
    
    def check_existing(self, transaction: Transaction) -> bool
        # Check against recent transactions (30 days)
    
    def mark_as_duplicate(self, transaction: Transaction) -> None
        # Add metadata to track duplicates
```

### 4. Frontend Upload Interface

#### User Experience Flow
1. **Upload Area**:
   - Drag-and-drop zone
   - File selector button
   - Supported formats listed
   - File size limits displayed

2. **Processing Feedback**:
   - Upload progress bar
   - Processing spinner
   - Real-time row counter

3. **Results Display**:
   - Success message with count
   - Error details if any
   - Option to view imported transactions
   - Direct link to allocation

#### Component Structure
- File upload component with drag-drop
- Progress indicator component
- Results summary component
- Error display component

### 5. Error Handling

#### Error Categories
- **File Errors**:
  - Invalid file type
  - File too large
  - Corrupted file
  - Encoding issues

- **Parsing Errors**:
  - Invalid date format
  - Invalid amount format
  - Missing required fields
  - Malformed CSV structure

- **Business Logic Errors**:
  - All transactions are duplicates
  - No valid transactions found
  - Date range too old/future

#### Error Response Format
```python
class ImportError(BaseModel):
    row_number: Optional[int]
    field: Optional[str]
    value: Optional[str]
    message: str
    error_type: ErrorType
```

### 6. Testing Implementation

#### Backend Tests (pytest)

##### Unit Tests
```python
class TestCSVParser:
    def test_detect_encoding_utf8(self)
    def test_detect_encoding_iso88591(self)
    def test_parse_date_various_formats(self)
    def test_parse_amount_negative_patterns(self)
    def test_parse_amount_with_currency_symbols(self)
    def test_clean_description(self)
    def test_detect_bank_format(self)

class TestDuplicateDetection:
    def test_duplicate_same_day(self)
    def test_duplicate_similar_description(self)
    def test_not_duplicate_different_amount(self)

class TestCSVProcessor:
    def test_process_valid_csv(self)
    def test_handle_empty_csv(self)
    def test_handle_malformed_csv(self)
    def test_skip_invalid_rows(self)
    def test_large_file_processing(self)
```

##### Integration Tests
```python
class TestImportAPI:
    def test_upload_valid_file(self)
    def test_upload_invalid_file_type(self)
    def test_concurrent_uploads(self)
    def test_ledger_updated_after_import(self)
    def test_pending_envelope_balance_updated(self)
```

#### Frontend Tests

##### Unit Tests (Vitest)
```javascript
describe('FileUpload', () => {
    test('accepts CSV files')
    test('rejects non-CSV files')
    test('handles drag and drop')
    test('shows file size')
    test('validates file size limit')
})

describe('ImportProgress', () => {
    test('shows upload progress')
    test('shows processing state')
    test('displays row count')
})
```

##### E2E Tests (Playwright)
```javascript
test('Complete CSV import flow', async ({ page }) => {
    // Navigate to import page
    // Upload test CSV file
    // Wait for processing
    // Verify success message
    // Check transaction count
    // Navigate to pending transactions
})

test('Handle import errors gracefully', async ({ page }) => {
    // Upload invalid CSV
    // Verify error display
    // Check error details
    // Verify no partial import
})
```

### 7. Polish & UX Requirements

#### Visual Feedback
- **Drag-and-Drop**:
  - Hover state with dashed border
  - Drop zone highlighting
  - File type validation feedback
  - Animated upload icon

- **Progress Indicators**:
  - Percentage-based progress bar
  - Estimated time remaining
  - Cancel upload option
  - Animated processing state

#### Error Presentation
- Clear error messages with solutions
- Row-specific error details
- Option to download error report
- Retry mechanism for failures

#### Success States
- Transaction count prominently displayed
- Total amount imported
- Date range of transactions
- Clear next action (allocate)

#### Responsive Design
- Mobile file upload handling
- Touch-friendly drop zone
- Appropriate file picker on mobile
- Readable error messages on small screens

## Task Breakdown Structure

### Backend Tasks

1. **CSV Parser Core** (4 hours)
   - Implement encoding detection
   - Create date parser
   - Create amount parser
   - Handle various formats

2. **Bank Format Detection** (3 hours)
   - Pattern matching for headers
   - Format configuration
   - Fallback strategies

3. **Duplicate Detection** (2 hours)
   - Hash generation
   - Comparison logic
   - Metadata tracking

4. **Import Endpoint** (3 hours)
   - File upload handling
   - Process orchestration
   - Response formatting
   - Error aggregation

5. **Ledger Integration** (2 hours)
   - Transaction creation
   - Pending envelope assignment
   - Atomic operations

### Frontend Tasks

1. **Upload Component** (3 hours)
   - Drag-and-drop implementation
   - File validation
   - Visual states
   - Progress tracking

2. **Results Display** (2 hours)
   - Success message design
   - Error display
   - Summary statistics
   - Navigation options

3. **API Integration** (2 hours)
   - Upload service
   - Progress tracking
   - Error handling
   - Response processing

### Testing Tasks

1. **Parser Test Suite** (3 hours)
   - Unit tests for all parsers
   - Edge case coverage
   - Performance tests

2. **Integration Tests** (2 hours)
   - End-to-end import tests
   - Error scenario tests
   - Concurrent upload tests

3. **Frontend Tests** (2 hours)
   - Component tests
   - E2E upload tests
   - Error handling tests

### Polish Tasks

1. **Upload UX** (2 hours)
   - Animation polish
   - Loading states
   - Error states
   - Mobile optimization

2. **Feedback Systems** (2 hours)
   - Progress indicators
   - Success messages
   - Error formatting
   - Help text

## Success Criteria

### Functional Requirements
- [ ] CSV files upload successfully
- [ ] Common bank formats auto-detected
- [ ] Transactions created in Pending envelope
- [ ] Duplicates detected and handled
- [ ] Error reporting comprehensive

### Performance Requirements
- [ ] Process 1000 transactions in < 2 seconds
- [ ] Upload feedback immediate
- [ ] No UI blocking during processing
- [ ] Memory efficient for large files

### Quality Requirements
- [ ] 85% test coverage
- [ ] All E2E tests passing
- [ ] No data loss on errors
- [ ] Graceful error recovery

### UX Requirements
- [ ] Clear upload instructions
- [ ] Intuitive drag-and-drop
- [ ] Helpful error messages
- [ ] Obvious next actions
- [ ] Mobile-friendly upload

## Dependencies
- Phase 1: Infrastructure complete
- Phase 2: Ledger system working
- Phase 3: Envelope management functional
- CSV parsing library (built-in)
- File upload middleware

## Risks and Mitigations

### Risk 1: CSV Format Variations
**Risk**: Banks use inconsistent CSV formats
**Mitigation**: Flexible parser, format detection, manual column mapping (future)

### Risk 2: Large File Processing
**Risk**: Browser/server timeout with large files
**Mitigation**: Streaming parser, batch processing, progress feedback

### Risk 3: Duplicate Transaction Handling
**Risk**: Same transaction imported multiple times
**Mitigation**: Robust duplicate detection, user confirmation option

### Risk 4: Character Encoding Issues
**Risk**: Non-UTF8 files cause parsing errors
**Mitigation**: Encoding detection, multiple encoding support, clear error messages

## Notes for Task Breakdown
When breaking this phase into smaller tasks:
1. Start with parser core functionality
2. Build error handling incrementally
3. Test with real bank CSV samples
4. Consider streaming for large files
5. Create test fixtures from various banks
6. Document supported formats clearly
7. Plan for format configuration in future

## Phase Completion Checklist
- [ ] CSV upload endpoint functional
- [ ] Multiple bank formats supported
- [ ] Duplicate detection working
- [ ] Error handling comprehensive
- [ ] Upload UI polished
- [ ] All tests passing
- [ ] Performance targets met
- [ ] Documentation complete
- [ ] Real bank CSVs tested
- [ ] User feedback incorporated