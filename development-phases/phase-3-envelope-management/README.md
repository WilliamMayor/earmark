# Phase 3: Envelope Management with Month View

## Overview
This phase implements the core envelope management functionality with the month-by-month view as the primary interaction model. Users will create and manage their budget envelopes while always operating within the context of a specific month. This phase establishes the fundamental user interface patterns and the monthly budget paradigm.

## Duration
1 week (Week 3)

## Objectives
- Implement envelope CRUD operations with month-aware balances
- Create the month-by-month navigation interface
- Display envelope balances within monthly context
- Establish the default Cash and Pending envelopes
- Implement comprehensive TDD approach
- Deliver a polished, production-ready UI

## Deliverables

### 1. Backend API Endpoints

#### Envelope Management
- `GET /api/months/{year}/{month}` - Get complete month summary
  - All envelopes with opening/closing balances
  - Total income/expenses for the month
  - Month metadata

- `GET /api/months/{year}/{month}/envelopes` - List envelopes for month
  - Opening balance (previous month closing)
  - Current month activity
  - Closing balance
  - Transaction count

- `GET /api/months/{year}/{month}/envelopes/{id}` - Get envelope details
  - Full transaction list for the month
  - Running balance
  - Month-over-month comparison

- `POST /api/envelopes` - Create new envelope
  - Validation for unique names
  - Automatic ledger account creation
  - Available in all months

- `PUT /api/envelopes/{id}` - Update envelope
  - Name and notes modification
  - Validation for duplicates
  - Historical data preserved

- `GET /api/months/{year}/{month}/envelopes/{id}/transactions` - Envelope transactions
  - Filtered by month
  - Include transfers
  - Chronological order

- `POST /api/months/{year}/{month}/envelopes/{id}/transactions` - Create transaction
  - Manual transaction entry
  - Direct envelope assignment
  - Month-specific dating

### 2. Business Logic Implementation

#### Core Features
- **Default Envelopes**: Automatic creation of "Cash" and "Pending" on first run
- **Month Calculations**: 
  - Opening balance from previous month
  - Running calculations through the month
  - Closing balance computation
- **Validation Rules**:
  - Unique envelope names
  - Alphanumeric with spaces allowed
  - Cannot delete non-empty envelopes
  - Case-insensitive uniqueness

#### Balance Calculations
```python
def calculate_envelope_month(envelope_id: str, year: int, month: int):
    opening_balance = get_closing_balance(envelope_id, year, month - 1)
    transactions = get_month_transactions(envelope_id, year, month)
    closing_balance = opening_balance + sum(transactions)
    return {
        "opening": opening_balance,
        "transactions": transactions,
        "closing": closing_balance
    }
```

### 3. Frontend Implementation

#### User Interface Features
- **Month Navigation Bar**:
  - Current month display
  - Previous/Next month buttons
  - Quick month/year selector
  - Always visible at top

- **Envelope Grid/List View**:
  - Card-based layout
  - Opening and closing balances
  - Quick balance indicator (positive/negative)
  - Activity sparkline (optional)

- **Envelope Management**:
  - Create new envelope modal
  - Edit envelope inline or modal
  - Delete confirmation with balance check
  - Reorder envelopes (drag or manual)

- **Empty States**:
  - Welcome message for new users
  - Setup wizard suggestion
  - Clear call-to-action buttons

### 4. Testing Implementation

#### Backend Tests (pytest)

##### Unit Tests
```python
class TestEnvelope:
    def test_create_envelope_valid_name(self)
    def test_create_envelope_duplicate_name_fails(self)
    def test_update_envelope_preserves_transactions(self)
    def test_delete_envelope_with_balance_fails(self)
    def test_default_envelopes_created_on_init(self)

class TestMonthCalculations:
    def test_opening_balance_from_previous_month(self)
    def test_closing_balance_calculation(self)
    def test_no_transactions_preserves_balance(self)
    def test_multiple_transactions_in_month(self)
    def test_transfers_affect_both_envelopes(self)
```

##### Integration Tests
```python
class TestEnvelopeAPI:
    def test_create_envelope_updates_ledger(self)
    def test_month_endpoint_returns_all_data(self)
    def test_concurrent_envelope_operations(self)
    def test_month_boundary_calculations(self)
    def test_year_boundary_calculations(self)
```

#### Frontend Tests

##### Unit Tests (Vitest)
```javascript
describe('EnvelopeService', () => {
    test('fetches month data correctly')
    test('handles API errors gracefully')
    test('caches month data appropriately')
    test('invalidates cache on updates')
})

describe('MonthNavigation', () => {
    test('navigates to previous month')
    test('navigates to next month')
    test('handles year boundaries')
    test('displays current month by default')
})
```

##### E2E Tests (Playwright)
```javascript
test('Complete envelope creation flow', async ({ page }) => {
    // Navigate to app
    // Click create envelope
    // Fill in form
    // Submit and verify
    // Check ledger file updated
})

test('Month navigation preserves state', async ({ page }) => {
    // Start at current month
    // Navigate to previous month
    // Verify data changes
    // Navigate back
    // Verify original state
})
```

### 5. Polish & UX Requirements

#### Loading States
- Skeleton screens for envelope cards
- Smooth transitions between months
- Progressive loading for large datasets
- Loading indicators for actions

#### Error Handling
- **Validation Errors**:
  - Inline field validation
  - Clear error messages
  - Suggestion for fixes
- **System Errors**:
  - Friendly error pages
  - Retry mechanisms
  - Fallback to cached data

#### User Feedback
- **Success States**:
  - Confirmation messages (not toasts)
  - Visual feedback for actions
  - Smooth animations
- **Confirmation Dialogs**:
  - Delete envelope confirmation
  - Large value warnings
  - Destructive action prevention

#### Responsive Design
- Mobile-first approach
- Tablet optimization
- Desktop multi-column layout
- Touch-friendly controls

## Task Breakdown Structure

### Backend Development Tasks

1. **Month Calculation Service** (4 hours)
   - Implement month boundary logic
   - Create balance calculation methods
   - Handle year transitions
   - Write comprehensive tests

2. **Envelope CRUD Operations** (4 hours)
   - Create envelope endpoint
   - Update envelope endpoint
   - Validation logic
   - Ledger integration

3. **Month API Endpoints** (3 hours)
   - Month summary endpoint
   - Envelope list endpoint
   - Transaction filtering
   - Response formatting

4. **Default Envelope Setup** (2 hours)
   - Initialize Cash envelope
   - Initialize Pending envelope
   - First-run detection
   - Migration logic (future)

### Frontend Development Tasks

1. **Month Navigation Component** (3 hours)
   - Navigation bar layout
   - Month/year selectors
   - State management
   - URL routing integration

2. **Envelope Display Components** (4 hours)
   - Envelope card component
   - Envelope list/grid layout
   - Balance display formatting
   - Activity indicators

3. **Envelope Management Forms** (3 hours)
   - Create envelope form
   - Edit envelope form
   - Validation display
   - Form state management

4. **API Integration** (3 hours)
   - API client methods
   - Error handling
   - Loading states
   - Cache management

### Testing Tasks

1. **Backend Test Suite** (3 hours)
   - Unit tests for all endpoints
   - Integration tests
   - Edge case coverage
   - Performance tests

2. **Frontend Unit Tests** (2 hours)
   - Component tests
   - Service tests
   - Utility function tests

3. **E2E Test Suite** (3 hours)
   - User flow tests
   - Error scenario tests
   - Performance tests

### Polish Tasks

1. **UI Polish** (3 hours)
   - Loading animations
   - Transitions
   - Empty states
   - Error states

2. **Responsive Design** (2 hours)
   - Mobile layout
   - Tablet optimization
   - Desktop enhancements

## Success Criteria

### Functional Requirements
- [ ] Create, edit envelopes working
- [ ] Month navigation smooth and accurate
- [ ] Balance calculations correct
- [ ] Default envelopes created automatically
- [ ] All data persisted to ledger

### Performance Requirements
- [ ] Month view loads in < 500ms
- [ ] Envelope operations complete in < 200ms
- [ ] Smooth animations at 60fps
- [ ] No memory leaks during navigation

### Quality Requirements
- [ ] 85% test coverage (backend)
- [ ] 80% test coverage (frontend)
- [ ] All E2E tests passing
- [ ] No console errors or warnings
- [ ] Accessibility score > 90

### UX Requirements
- [ ] All interactive elements have loading states
- [ ] All errors handled gracefully
- [ ] Mobile responsive design working
- [ ] Keyboard navigation functional
- [ ] Clear visual hierarchy

## Dependencies
- Phase 1: Infrastructure (must be complete)
- Phase 2: Ledger Integration (must be complete)
- FastAPI and Pydantic
- SvelteKit and Tailwind CSS
- Testing frameworks configured

## Risks and Mitigations

### Risk 1: Month Calculation Complexity
**Risk**: Edge cases in month boundaries, leap years, etc.
**Mitigation**: Extensive test coverage, use proven date libraries, clear documentation

### Risk 2: Performance with Many Envelopes
**Risk**: UI becomes slow with 50+ envelopes
**Mitigation**: Pagination consideration, virtual scrolling, optimize rendering

### Risk 3: State Management Complexity
**Risk**: Keeping month state synchronized across components
**Mitigation**: Clear state management pattern, consider state library if needed

## Notes for Task Breakdown
When breaking this phase into smaller tasks:
1. Frontend and backend can progress in parallel after API contract defined
2. Start with TDD - write tests first
3. Each task should include its own tests
4. Polish happens continuously, not at the end
5. Consider component library for consistent UI
6. Document patterns established for future phases
7. Create reusable components for later phases

## Phase Completion Checklist
- [ ] All endpoints implemented and tested
- [ ] Month navigation fully functional
- [ ] Envelope CRUD operations working
- [ ] Balance calculations accurate
- [ ] UI polished and responsive
- [ ] 85% test coverage achieved
- [ ] No critical bugs
- [ ] Performance targets met
- [ ] Documentation updated
- [ ] Code review completed
- [ ] Demo prepared for stakeholders