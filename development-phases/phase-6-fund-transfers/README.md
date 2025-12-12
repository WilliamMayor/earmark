# Phase 6: Fund Transfers

## Overview
This phase implements the fund transfer functionality that allows users to move money between envelopes within a specific month context. Transfers are recorded as double-entry transactions in the ledger, maintaining the integrity of the accounting system. This feature enables users to reallocate their budget, fill envelopes from Cash, and adjust their financial plan as needed.

## Duration
1 week (Week 6)

## Objectives
- Implement transfer creation between any envelopes
- Record transfers as proper ledger transactions
- Support negative envelope balances (overdrafts)
- Enable transfer reversal/deletion
- Display transfer history within month context
- Implement comprehensive TDD approach
- Deliver polished, intuitive transfer interface

## Deliverables

### 1. Backend API Implementation

#### Transfer Management Endpoints
- `POST /api/months/{year}/{month}/transfers`
  - Create transfer between envelopes
  - Validate envelope existence
  - Create double-entry ledger transaction
  - Return updated balances
  
- `GET /api/months/{year}/{month}/transfers`
  - List all transfers for the month
  - Include source and destination details
  - Sort by date and time
  - Support filtering by envelope

- `DELETE /api/transfers/{id}`
  - Reverse a transfer
  - Create compensating ledger entry
  - Update affected envelope balances
  - Maintain audit trail

#### Request/Response Formats
```python
class TransferRequest(BaseModel):
    from_envelope: str
    to_envelope: str
    amount: Decimal
    description: Optional[str]
    date: Optional[date]  # Defaults to today within month

class TransferResponse(BaseModel):
    id: str
    from_envelope: EnvelopeInfo
    to_envelope: EnvelopeInfo
    amount: Decimal
    date: date
    description: str
    created_at: datetime
    reversible: bool

class EnvelopeInfo(BaseModel):
    id: str
    name: str
    balance_before: Decimal
    balance_after: Decimal
```

### 2. Ledger Integration

#### Transaction Recording
```python
class TransferLedgerService:
    def create_transfer_entry(self, transfer: Transfer) -> str
        """
        Creates a double-entry ledger transaction:
        2024-01-20 * "Transfer: Groceries to Dining Out"
            Envelopes:DiningOut        £50.00
            Envelopes:Groceries       -£50.00
        """
    
    def create_reversal_entry(self, original_transfer: Transfer) -> str
        """
        Creates a compensating reversal entry:
        2024-01-21 * "Reversal: Transfer from Groceries to Dining Out"
            Envelopes:Groceries        £50.00
            Envelopes:DiningOut       -£50.00
        """
```

#### Business Rules
- Transfers must be within the same month
- No transfer amount validation (allow any positive amount)
- Allow negative balances (overdrafts permitted)
- Transfer description auto-generated if not provided
- Preserve transfer metadata in ledger comments
- Transfers cannot be to/from same envelope

### 3. Frontend Interface

#### Transfer Form Components
- **Envelope Selection**:
  - From envelope dropdown/selector
  - To envelope dropdown/selector
  - Current balance display
  - Balance preview after transfer
  - Quick swap button

- **Amount Input**:
  - Currency formatted input
  - Decimal validation
  - Quick amount buttons (£10, £50, £100)
  - "Transfer all" option
  - Calculator widget (optional)

- **Description Field**:
  - Optional description input
  - Auto-generated preview
  - Character limit indicator
  - Common descriptions dropdown

- **Date Selection**:
  - Defaults to today
  - Limited to current month
  - Calendar picker
  - Quick date options

#### Transfer History View
- List of month's transfers
- Source and destination envelopes
- Amount and date
- Description
- Reverse/undo action
- Filter by envelope
- Sort options

### 4. User Experience Flow

#### Standard Transfer Flow
1. User opens transfer modal/page
2. Selects source envelope (shows current balance)
3. Selects destination envelope
4. Enters amount (validates against business rules)
5. Optionally adds description
6. Confirms transfer
7. Sees success feedback with new balances
8. Modal closes or resets for another transfer

#### Bulk Transfer Flow (Optional Enhancement)
- Fill multiple envelopes from Cash
- Set amounts for each
- Single confirmation
- Batch processing

### 5. Testing Implementation

#### Backend Tests (pytest)

##### Unit Tests
```python
class TestTransferService:
    def test_create_valid_transfer(self)
    def test_transfer_updates_both_balances(self)
    def test_transfer_allows_negative_balance(self)
    def test_transfer_within_month_only(self)
    def test_cannot_transfer_to_same_envelope(self)
    def test_transfer_with_description(self)
    def test_auto_generated_description(self)

class TestTransferReversal:
    def test_reverse_transfer(self)
    def test_reversal_restores_balances(self)
    def test_reversal_creates_audit_trail(self)
    def test_cannot_reverse_twice(self)

class TestLedgerIntegration:
    def test_transfer_creates_ledger_entry(self)
    def test_ledger_format_correct(self)
    def test_reversal_ledger_entry(self)
    def test_concurrent_transfers(self)
```

##### Integration Tests
```python
class TestTransferAPI:
    def test_transfer_endpoint_success(self)
    def test_transfer_endpoint_validation(self)
    def test_transfer_list_filtering(self)
    def test_transfer_deletion(self)
    def test_month_boundary_enforcement(self)
```

#### Frontend Tests

##### Unit Tests (Vitest)
```javascript
describe('TransferForm', () => {
    test('validates amount input')
    test('prevents same envelope selection')
    test('shows balance previews')
    test('handles description input')
    test('date limited to current month')
})

describe('TransferHistory', () => {
    test('displays transfers correctly')
    test('filters by envelope')
    test('sorts by date')
    test('handles reversal action')
})

describe('TransferService', () => {
    test('creates transfer request')
    test('handles API errors')
    test('updates local state optimistically')
    test('rolls back on failure')
})
```

##### E2E Tests (Playwright)
```javascript
test('Complete transfer flow', async ({ page }) => {
    // Open transfer modal
    // Select source envelope
    // Select destination envelope
    // Enter amount
    // Submit transfer
    // Verify success message
    // Check updated balances
})

test('Transfer reversal flow', async ({ page }) => {
    // View transfer history
    // Click reverse on transfer
    // Confirm reversal
    // Verify balances restored
    // Check reversal in history
})

test('Transfer with overdraft', async ({ page }) => {
    // Create transfer exceeding balance
    // Verify negative balance shown
    // Confirm warning acknowledged
    // Complete transfer
})
```

### 6. Polish & UX Requirements

#### Visual Feedback
- **Balance Changes**:
  - Animated balance updates
  - Color coding (positive/negative)
  - Before/after comparison
  - Warning for overdrafts

- **Form Validation**:
  - Real-time validation
  - Clear error messages
  - Field highlighting
  - Success confirmations

#### Loading States
- Transfer processing spinner
- Balance calculation indicator
- History loading skeleton
- Optimistic UI updates

#### Error Handling
- **Validation Errors**:
  - Invalid amount format
  - Same envelope selected
  - Date outside month
  - Network failures

- **Business Logic Errors**:
  - Envelope not found
  - Concurrent modification
  - Reversal failures

#### Confirmation Dialogs
- Large transfer amounts (> £500)
- Overdraft warnings
- Reversal confirmations
- Bulk transfer review

#### Responsive Design
- Mobile-optimized form
- Touch-friendly controls
- Appropriate input types
- Readable on small screens

## Task Breakdown Structure

### Backend Tasks

1. **Transfer Service Core** (3 hours)
   - Create transfer logic
   - Balance update mechanism
   - Validation rules
   - Description generation

2. **Ledger Integration** (3 hours)
   - Double-entry creation
   - Format specification
   - Comment metadata
   - Atomic operations

3. **Reversal Logic** (2 hours)
   - Reversal service
   - Compensating entries
   - Audit trail
   - State management

4. **API Endpoints** (2 hours)
   - POST transfer endpoint
   - GET transfers endpoint
   - DELETE transfer endpoint
   - Response formatting

### Frontend Tasks

1. **Transfer Form** (4 hours)
   - Form layout
   - Envelope selectors
   - Amount input
   - Validation display

2. **Transfer History** (2 hours)
   - List component
   - Filtering logic
   - Sort functionality
   - Reversal actions

3. **State Management** (2 hours)
   - Balance updates
   - Optimistic updates
   - Error recovery
   - Cache invalidation

4. **API Integration** (2 hours)
   - Service methods
   - Error handling
   - Loading states
   - Response processing

### Testing Tasks

1. **Backend Tests** (3 hours)
   - Unit test suite
   - Integration tests
   - Ledger verification
   - Performance tests

2. **Frontend Tests** (2 hours)
   - Component tests
   - Service tests
   - Form validation tests

3. **E2E Tests** (2 hours)
   - Complete workflows
   - Error scenarios
   - Mobile testing

### Polish Tasks

1. **Visual Polish** (2 hours)
   - Animations
   - Transitions
   - Loading feedback
   - Success states

2. **UX Refinement** (2 hours)
   - Form flow
   - Error messages
   - Confirmation dialogs
   - Help text

## Success Criteria

### Functional Requirements
- [ ] Transfers between envelopes working
- [ ] Ledger entries created correctly
- [ ] Negative balances supported
- [ ] Transfer reversal functional
- [ ] Month limitation enforced

### Performance Requirements
- [ ] Transfer completes < 300ms
- [ ] History loads < 200ms
- [ ] Balance updates instant
- [ ] No UI blocking

### Quality Requirements
- [ ] 85% test coverage
- [ ] All E2E tests passing
- [ ] No data inconsistencies
- [ ] Graceful error handling

### UX Requirements
- [ ] Clear balance feedback
- [ ] Intuitive form flow
- [ ] Helpful error messages
- [ ] Mobile responsive
- [ ] Overdraft warnings clear

## Dependencies
- Phase 3: Envelope management complete
- Phase 2: Ledger system functional
- Transfer recorded as transactions
- Month context implemented

## Risks and Mitigations

### Risk 1: Balance Inconsistencies
**Risk**: Concurrent transfers cause balance discrepancies
**Mitigation**: Atomic operations, optimistic locking, balance recalculation

### Risk 2: Accidental Large Transfers
**Risk**: User transfers wrong amount
**Mitigation**: Confirmation for large amounts, easy reversal, amount preview

### Risk 3: Complex Transfer Patterns
**Risk**: Users need bulk or recurring transfers
**Mitigation**: Start simple, plan for enhancements, gather user feedback

### Risk 4: Overdraft Confusion
**Risk**: Users confused by negative balances
**Mitigation**: Clear warnings, visual indicators, help documentation

## Notes for Task Breakdown
When breaking this phase into smaller tasks:
1. Start with simple transfer, add features incrementally
2. Test concurrent operations thoroughly
3. Ensure ledger consistency throughout
4. Consider bulk operations for future
5. Plan for recurring transfers later
6. Document overdraft behavior clearly
7. Build reversal from the start

## Phase Completion Checklist
- [ ] Transfer creation working
- [ ] Ledger integration complete
- [ ] Reversal functionality tested
- [ ] History view implemented
- [ ] UI polished and responsive
- [ ] All tests passing
- [ ] Performance targets met
- [ ] Documentation updated
- [ ] Mobile experience validated
- [ ] User feedback collected