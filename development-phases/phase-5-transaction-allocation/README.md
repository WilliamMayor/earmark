# Phase 5: Transaction Allocation Interface

## Overview
This phase implements the transaction allocation workflow, where users categorize pending transactions from CSV imports by moving them from the Pending envelope to their appropriate budget envelopes. The interface presents transactions one at a time and uses transfers to move funds between envelopes, maintaining the double-entry bookkeeping system.

## Duration
1 week (Week 5)

## Objectives
- Create intuitive transaction allocation interface
- Implement transfer mechanism from Pending to budget envelopes
- Provide efficient keyboard-driven workflow
- Display clear progress through pending transactions
- Support skipping and reversal of allocations
- Implement comprehensive TDD approach
- Deliver polished, responsive interface

## Deliverables

### 1. Backend API Implementation

#### Transaction Management Endpoints
- `GET /api/months/{year}/{month}/envelopes/pending/transactions`
  - Retrieve pending transactions for the month
  - Ordered by date (oldest first)
  - Include transaction metadata
  - Support pagination for large sets

- `POST /api/months/{year}/{month}/transfers`
  - Create transfer from Pending to target envelope
  - Atomic ledger update
  - Return updated balances
  - Support description override

- `GET /api/months/{year}/{month}/transactions`
  - List all transactions for the month
  - Include allocation status
  - Filter options available

- `DELETE /api/transfers/{id}`
  - Reverse a transfer
  - Restore funds to Pending
  - Update ledger atomically
  - Return affected envelopes

#### Response Formats
```python
class PendingTransaction(BaseModel):
    id: str
    date: date
    description: str
    amount: Decimal
    original_description: str
    import_date: datetime
    position: int  # X of Y
    total_pending: int

class AllocationResult(BaseModel):
    transfer_id: str
    from_envelope: str
    to_envelope: str
    amount: Decimal
    remaining_pending: int
    next_transaction: Optional[PendingTransaction]
```

### 2. Allocation Logic

#### Transfer Creation
```python
class AllocationService:
    def get_next_pending(self, month: int, year: int) -> PendingTransaction
    def allocate_transaction(
        self,
        transaction_id: str,
        to_envelope_id: str,
        month: int,
        year: int
    ) -> AllocationResult
    def skip_transaction(self, transaction_id: str) -> PendingTransaction
    def undo_last_allocation(self) -> PendingTransaction
    def get_allocation_progress(self, month: int, year: int) -> Progress
```

#### Business Rules
- Transactions allocated in chronological order
- Skipped transactions remain in Pending
- Transfers maintain transaction metadata
- Allocation creates audit trail
- Support batch operations (future)

### 3. Frontend Interface

#### Allocation View Components
- **Transaction Display**:
  - Large, readable transaction details
  - Original bank description
  - Amount with proper formatting
  - Date clearly visible
  - Import metadata available

- **Envelope Selector**:
  - Quick access envelope list
  - Current balance display
  - Keyboard number shortcuts (1-9)
  - Search/filter capability
  - Most-used envelopes first

- **Progress Indicator**:
  - "Transaction X of Y" display
  - Progress bar
  - Estimated time remaining
  - Skip counter

- **Action Controls**:
  - Allocate button (Enter key)
  - Skip button (Space key)
  - Undo last (Backspace key)
  - Exit allocation mode

#### Keyboard Shortcuts
```
1-9: Select envelope by position
Enter: Confirm allocation
Space: Skip transaction
Backspace: Undo last allocation
Tab: Focus envelope search
Escape: Exit allocation mode
Arrow keys: Navigate envelopes
```

### 4. User Experience Flow

#### Standard Allocation Flow
1. User navigates to allocation view
2. First pending transaction displayed
3. User selects target envelope (keyboard or click)
4. Confirmation of allocation
5. Next transaction appears automatically
6. Progress updates in real-time
7. Completion message when done

#### Skip and Undo Flow
- Skip leaves transaction in Pending
- Skip counter shows deferred items
- Undo reverses last transfer
- Returns to previous transaction
- Can undo multiple in sequence

### 5. Testing Implementation

#### Backend Tests (pytest)

##### Unit Tests
```python
class TestAllocationService:
    def test_get_next_pending_chronological(self)
    def test_allocate_creates_transfer(self)
    def test_allocate_updates_balances(self)
    def test_skip_preserves_transaction(self)
    def test_undo_reverses_transfer(self)
    def test_empty_pending_returns_none(self)

class TestTransferCreation:
    def test_transfer_from_pending(self)
    def test_transfer_preserves_metadata(self)
    def test_transfer_atomic_operation(self)
    def test_transfer_validation(self)

class TestAllocationAPI:
    def test_pending_endpoint_filtering(self)
    def test_transfer_endpoint_validation(self)
    def test_delete_transfer_reversal(self)
    def test_concurrent_allocations(self)
```

##### Integration Tests
```python
class TestAllocationWorkflow:
    def test_complete_allocation_flow(self)
    def test_partial_allocation_session(self)
    def test_allocation_with_skips(self)
    def test_undo_chain_operations(self)
    def test_month_boundary_handling(self)
```

#### Frontend Tests

##### Unit Tests (Vitest)
```javascript
describe('AllocationService', () => {
    test('fetches pending transactions')
    test('creates transfer correctly')
    test('handles allocation errors')
    test('tracks progress accurately')
    test('manages undo stack')
})

describe('EnvelopeSelector', () => {
    test('displays envelopes with balances')
    test('handles keyboard shortcuts')
    test('sorts by frequency/recency')
    test('filters envelopes on search')
})

describe('TransactionDisplay', () => {
    test('formats amount correctly')
    test('shows transaction details')
    test('indicates position in queue')
})
```

##### E2E Tests (Playwright)
```javascript
test('Complete allocation workflow', async ({ page }) => {
    // Navigate to allocation view
    // Verify first transaction displayed
    // Select envelope with keyboard
    // Confirm allocation
    // Verify next transaction appears
    // Complete all allocations
    // Verify completion state
})

test('Skip and undo operations', async ({ page }) => {
    // Start allocation
    // Skip first transaction
    // Allocate second
    // Undo allocation
    // Verify returned to second
    // Allocate to different envelope
})

test('Keyboard-only allocation', async ({ page }) => {
    // Complete entire flow with keyboard
    // No mouse interactions
    // Verify all shortcuts work
})
```

### 6. Polish & UX Requirements

#### Visual Design
- **Transaction Card**:
  - Clear visual hierarchy
  - Sufficient whitespace
  - High contrast text
  - Responsive sizing

- **Envelope Selection**:
  - Clear hover states
  - Selected state obvious
  - Balance changes preview
  - Smooth animations

#### Loading States
- Transaction loading spinner
- Allocation processing feedback
- Balance update animations
- Network error recovery

#### Feedback Systems
- **Success Feedback**:
  - Quick confirmation animation
  - Balance update highlight
  - Smooth transition to next
  - Progress bar advancement

- **Error Handling**:
  - Clear error messages
  - Recovery suggestions
  - Retry mechanisms
  - No data loss

#### Responsive Design
- Mobile-optimized layout
- Touch-friendly controls
- Swipe gestures (optional)
- Appropriate font sizes

#### Accessibility
- Full keyboard navigation
- Screen reader support
- ARIA labels
- Focus management
- High contrast mode

## Task Breakdown Structure

### Backend Tasks

1. **Allocation Service** (4 hours)
   - Implement pending retrieval
   - Create allocation logic
   - Handle skip functionality
   - Build undo mechanism

2. **Transfer Integration** (3 hours)
   - Connect to transfer system
   - Preserve transaction metadata
   - Handle edge cases
   - Ensure atomicity

3. **API Endpoints** (3 hours)
   - Pending transactions endpoint
   - Transfer creation endpoint
   - Transfer reversal endpoint
   - Progress tracking endpoint

4. **Business Logic** (2 hours)
   - Chronological ordering
   - Month filtering
   - Progress calculation
   - State management

### Frontend Tasks

1. **Allocation View Layout** (3 hours)
   - Transaction card design
   - Envelope selector layout
   - Progress indicator
   - Action buttons

2. **Interaction Logic** (4 hours)
   - Keyboard shortcut handling
   - Envelope selection
   - Allocation confirmation
   - Skip and undo logic

3. **State Management** (3 hours)
   - Progress tracking
   - Undo stack
   - Error recovery
   - Cache management

4. **API Integration** (2 hours)
   - Service methods
   - Error handling
   - Optimistic updates
   - Loading states

### Testing Tasks

1. **Backend Tests** (3 hours)
   - Unit test coverage
   - Integration tests
   - Performance tests
   - Edge cases

2. **Frontend Tests** (2 hours)
   - Component tests
   - Service tests
   - Interaction tests

3. **E2E Tests** (3 hours)
   - Complete workflows
   - Error scenarios
   - Performance testing

### Polish Tasks

1. **Visual Polish** (2 hours)
   - Animations
   - Transitions
   - Loading states
   - Empty states

2. **UX Optimization** (2 hours)
   - Response times
   - Keyboard flow
   - Error messages
   - Help text

## Success Criteria

### Functional Requirements
- [ ] All pending transactions retrievable
- [ ] Allocation creates proper transfers
- [ ] Skip functionality works correctly
- [ ] Undo reverses allocations
- [ ] Progress tracking accurate

### Performance Requirements
- [ ] Transaction load time < 200ms
- [ ] Allocation completes < 300ms
- [ ] Smooth 60fps animations
- [ ] No UI blocking

### Quality Requirements
- [ ] 85% test coverage
- [ ] All E2E tests passing
- [ ] No memory leaks
- [ ] Graceful error handling

### UX Requirements
- [ ] Keyboard shortcuts intuitive
- [ ] Progress always visible
- [ ] Clear success feedback
- [ ] Mobile responsive
- [ ] Accessibility compliant

## Dependencies
- Phase 3: Envelope management complete
- Phase 4: CSV import functional
- Transfer system implemented
- Month-based filtering working

## Risks and Mitigations

### Risk 1: Large Transaction Volumes
**Risk**: Hundreds of pending transactions overwhelming
**Mitigation**: Pagination, session resumption, bulk operations (future)

### Risk 2: Accidental Allocations
**Risk**: User allocates to wrong envelope
**Mitigation**: Undo functionality, confirmation for large amounts, allocation review

### Risk 3: Network Interruptions
**Risk**: Allocation fails mid-session
**Mitigation**: Optimistic UI updates, retry logic, session recovery

### Risk 4: Complex Transaction Descriptions
**Risk**: Bank descriptions unclear or too long
**Mitigation**: Description cleaning, search functionality, manual editing (future)

## Notes for Task Breakdown
When breaking this phase into smaller tasks:
1. Start with basic flow, add features incrementally
2. Prioritize keyboard navigation early
3. Test with realistic transaction volumes
4. Consider mobile experience throughout
5. Build undo functionality from start
6. Plan for session interruption
7. Document allocation patterns for analytics

## Phase Completion Checklist
- [ ] Allocation workflow complete
- [ ] All keyboard shortcuts working
- [ ] Skip and undo functional
- [ ] Progress tracking accurate
- [ ] UI polished and responsive
- [ ] All tests passing
- [ ] Performance targets met
- [ ] Accessibility validated
- [ ] Mobile experience tested
- [ ] User feedback incorporated