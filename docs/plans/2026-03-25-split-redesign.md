# Split Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move initial split creation from web to sync, replace the batch split UI with per-split add/delete, and change round-up from a boolean flag to a date-gated feature.

**Architecture:** Python sync creates a default split (and round-up split when applicable) immediately after upserting each transaction. The web app adds/deletes individual splits inline in the account dock. A new `is_default` flag identifies the one uncancelable split per transaction. Round-up is enabled from a specific date (`round_up_since`) rather than a boolean, so no back-fill or cleanup is needed.

**Tech Stack:** Python/SQLite (`sync/`), TypeScript/better-sqlite3 (`web/src/lib/`), SvelteKit (`web/src/routes/`), pytest, vitest.

---

### Task 1: Rework migration 0003

**Files:**
- Modify: `migrations/0003_round_up.sql`
- Modify: `web/src/lib/__tests__/fixtures.ts` (seedAccount uses lunchflow_id timestamp — no schema changes needed there, but verify it still works)

Replace the `round_up INTEGER NOT NULL DEFAULT 0` column with a nullable `round_up_since TEXT` column, and add `is_default INTEGER NOT NULL DEFAULT 0` to splits.

**Step 1: Edit the migration file**

Replace the full contents of `migrations/0003_round_up.sql` with:

```sql
ALTER TABLE accounts ADD COLUMN round_up_since TEXT;
ALTER TABLE splits ADD COLUMN is_round_up INTEGER NOT NULL DEFAULT 0;
ALTER TABLE splits ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
```

**Step 2: Recreate the local DB**

```bash
cd /Users/wmayor/Projects/budget-tool
rm -f transactions.db transactions.db-shm transactions.db-wal
python migrate.py
```

Expected: migrations applied with no errors.

**Step 3: Commit**

```bash
git add migrations/0003_round_up.sql
git commit -m "chore: rework migration 0003 — round_up_since date + is_default split flag"
```

---

### Task 2: Python — update Account model and db reads

**Files:**
- Modify: `sync/models.py`
- Modify: `sync/db.py` (lines 78–88, `_row_to_account`)

**Step 1: Add `round_up_since` to Account**

In `sync/models.py`, add the field after `last_synced_at`:

```python
from datetime import date, datetime  # date is already imported
...
@dataclass
class Account:
    lunchflow_id: int
    currency: str
    name: Optional[str] = None
    institution_name: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    round_up_since: Optional[date] = None
    id: Optional[int] = None
```

**Step 2: Read `round_up_since` in `_row_to_account`**

In `sync/db.py`, update `_row_to_account`:

```python
def _row_to_account(row: sqlite3.Row) -> Account:
    return Account(
        id=row["id"],
        lunchflow_id=row["lunchflow_id"],
        name=row["name"],
        institution_name=row["institution_name"],
        currency=row["currency"],
        last_synced_at=(
            datetime.fromisoformat(row["last_synced_at"]) if row["last_synced_at"] else None
        ),
        round_up_since=(
            date.fromisoformat(row["round_up_since"]) if row["round_up_since"] else None
        ),
    )
```

**Step 3: Run existing Python tests to confirm nothing broke**

```bash
cd /Users/wmayor/Projects/budget-tool
python -m pytest tests/test_db.py tests/test_sync.py -v
```

Expected: all pass.

**Step 4: Commit**

```bash
git add sync/models.py sync/db.py
git commit -m "feat: add round_up_since to Account model and db reads"
```

---

### Task 3: Python — `ensure_default_split`

**Files:**
- Create: `tests/test_splits.py`
- Modify: `sync/db.py`

The function inserts a single split for the full transaction amount with `is_default = 1`. Idempotent — safe to call multiple times. The `conftest.py` already has a `db_conn` fixture and `make_transaction` helper.

**Step 1: Write the failing tests**

Create `tests/test_splits.py`:

```python
"""Tests for split management functions in sync/db.py."""

from decimal import Decimal
from sync.db import (
    ensure_default_split,
    insert_transaction,
)
from tests.conftest import make_transaction


def test_ensure_default_split_creates_split(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id, amount=Decimal("18.50")))
    ensure_default_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ?", (tx.id,)
    ).fetchone()
    assert row is not None
    assert row["amount"] == "18.50"
    assert row["is_default"] == 1


def test_ensure_default_split_is_idempotent(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id))
    ensure_default_split(db_conn, tx.id)
    ensure_default_split(db_conn, tx.id)
    ensure_default_split(db_conn, tx.id)

    rows = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ?", (tx.id,)
    ).fetchall()
    assert len(rows) == 1


def test_ensure_default_split_does_not_overwrite_existing(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id, amount=Decimal("20.00")))
    # Manually insert splits to simulate a transaction that already has them
    db_conn.execute(
        "INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, '10.00', 0, 1)",
        (tx.id,),
    )
    db_conn.execute(
        "INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 1)",
        (tx.id,),
    )
    db_conn.commit()

    ensure_default_split(db_conn, tx.id)

    rows = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ?", (tx.id,)
    ).fetchall()
    assert len(rows) == 2
```

**Step 2: Run to confirm they fail**

```bash
cd /Users/wmayor/Projects/budget-tool
python -m pytest tests/test_splits.py -v
```

Expected: FAIL — `ImportError: cannot import name 'ensure_default_split'`

**Step 3: Implement `ensure_default_split` in `sync/db.py`**

Add after `has_opening_balance`:

```python
# ---------------------------------------------------------------------------
# Splits
# ---------------------------------------------------------------------------

def ensure_default_split(conn: sqlite3.Connection, tx_id: int) -> None:
    """Create the default split for a transaction if it doesn't exist. Idempotent."""
    existing = conn.execute(
        "SELECT COUNT(*) AS cnt FROM splits WHERE transaction_id = ? AND is_default = 1",
        (tx_id,),
    ).fetchone()
    if existing["cnt"] > 0:
        return

    tx = conn.execute(
        "SELECT amount FROM transactions WHERE id = ?", (tx_id,)
    ).fetchone()
    if not tx:
        raise ValueError(f"Transaction {tx_id} not found")

    conn.execute(
        "INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, ?, 0, 1)",
        (tx_id, tx["amount"]),
    )
    conn.commit()
```

**Step 4: Run tests to confirm they pass**

```bash
python -m pytest tests/test_splits.py -v
```

Expected: 3 tests pass.

**Step 5: Commit**

```bash
git add sync/db.py tests/test_splits.py
git commit -m "feat: add ensure_default_split to sync/db.py"
```

---

### Task 4: Python — `get_or_create_round_up_envelope`

**Files:**
- Modify: `tests/test_splits.py`
- Modify: `sync/db.py`

**Step 1: Add failing tests to `tests/test_splits.py`**

```python
from sync.db import (
    ensure_default_split,
    get_or_create_round_up_envelope,
    insert_transaction,
    upsert_account,
)
from sync.models import Account

ROUND_UP_ENVELOPE_NAME = "Round Up"


def test_get_or_create_round_up_envelope_creates_envelope(db_conn, saved_account):
    envelope_id = get_or_create_round_up_envelope(db_conn, saved_account.id)
    row = db_conn.execute(
        "SELECT name FROM envelopes WHERE id = ?", (envelope_id,)
    ).fetchone()
    assert row["name"] == ROUND_UP_ENVELOPE_NAME


def test_get_or_create_round_up_envelope_is_idempotent(db_conn, saved_account):
    id1 = get_or_create_round_up_envelope(db_conn, saved_account.id)
    id2 = get_or_create_round_up_envelope(db_conn, saved_account.id)
    assert id1 == id2


def test_get_or_create_round_up_envelope_separate_per_account(db_conn, saved_account):
    second = upsert_account(db_conn, Account(lunchflow_id=9999, currency="GBP", name="Second"))
    id1 = get_or_create_round_up_envelope(db_conn, saved_account.id)
    id2 = get_or_create_round_up_envelope(db_conn, second.id)
    assert id1 != id2
```

**Step 2: Run to confirm they fail**

```bash
python -m pytest tests/test_splits.py::test_get_or_create_round_up_envelope_creates_envelope -v
```

Expected: FAIL — `ImportError`

**Step 3: Implement in `sync/db.py`**

Add after `ensure_default_split`:

```python
ROUND_UP_ENVELOPE_NAME = "Round Up"


def get_or_create_round_up_envelope(conn: sqlite3.Connection, account_id: int) -> int:
    """Return the id of the Round Up envelope for the account, creating it if needed."""
    existing = conn.execute(
        "SELECT id FROM envelopes WHERE account_id = ? AND name = ?",
        (account_id, ROUND_UP_ENVELOPE_NAME),
    ).fetchone()
    if existing:
        return existing["id"]

    cursor = conn.execute(
        "INSERT INTO envelopes (account_id, name) VALUES (?, ?)",
        (account_id, ROUND_UP_ENVELOPE_NAME),
    )
    conn.commit()
    return cursor.lastrowid
```

**Step 4: Run tests**

```bash
python -m pytest tests/test_splits.py -v
```

Expected: all 6 tests pass.

**Step 5: Commit**

```bash
git add sync/db.py tests/test_splits.py
git commit -m "feat: add get_or_create_round_up_envelope to sync/db.py"
```

---

### Task 5: Python — `ensure_round_up_split`

**Files:**
- Modify: `tests/test_splits.py`
- Modify: `sync/db.py`

The function: for DBIT transactions where `tx.date >= account.round_up_since` and amount is non-whole, inserts a round-up split and auto-allocates it to the Round Up envelope. Idempotent.

**Step 1: Add failing tests**

Add to the imports in `tests/test_splits.py`:
```python
from datetime import date
from sync.db import ensure_round_up_split
```

Add tests:

```python
def _enable_round_up(db_conn, account_id, since="2025-01-01"):
    db_conn.execute(
        "UPDATE accounts SET round_up_since = ? WHERE id = ?", (since, account_id)
    )
    db_conn.commit()


def test_ensure_round_up_split_creates_split_for_non_whole_dbit(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id, "2025-01-01")
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT amount FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is not None
    assert row["amount"] == "0.25"


def test_ensure_round_up_split_auto_allocates_to_envelope(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id)
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    split = db_conn.execute(
        "SELECT id FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    alloc = db_conn.execute(
        "SELECT * FROM allocations WHERE split_id = ?", (split["id"],)
    ).fetchone()
    assert alloc is not None


def test_ensure_round_up_split_skips_whole_amount(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id)
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("5.00"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is None


def test_ensure_round_up_split_skips_crdt(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id)
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="CRDT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is None


def test_ensure_round_up_split_respects_date_gate(db_conn, saved_account):
    # Transaction is before round_up_since — should not get a round-up split
    _enable_round_up(db_conn, saved_account.id, since="2025-07-01")
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is None


def test_ensure_round_up_split_skips_when_disabled(db_conn, saved_account):
    # round_up_since is NULL — feature disabled
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is None


def test_ensure_round_up_split_is_idempotent(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id)
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)
    ensure_round_up_split(db_conn, tx.id)
    ensure_round_up_split(db_conn, tx.id)

    rows = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchall()
    assert len(rows) == 1
```

**Step 2: Run to confirm they fail**

```bash
python -m pytest tests/test_splits.py -k "round_up_split" -v
```

Expected: FAIL — `ImportError`

**Step 3: Implement in `sync/db.py`**

Add `import math` at the top of the file. Add the function after `get_or_create_round_up_envelope`:

```python
def ensure_round_up_split(conn: sqlite3.Connection, tx_id: int) -> None:
    """
    Create a round-up split for a DBIT transaction when round-up is enabled
    and the transaction date is on or after round_up_since. Idempotent.
    """
    row = conn.execute(
        """SELECT t.amount, t.credit_debit_indicator, t.date, t.account_id,
                  a.round_up_since
           FROM transactions t
           JOIN accounts a ON a.id = t.account_id
           WHERE t.id = ?""",
        (tx_id,),
    ).fetchone()

    if not row:
        return
    if not row["round_up_since"]:
        return
    if row["credit_debit_indicator"] != "DBIT":
        return
    if not row["date"]:
        return

    tx_date = date.fromisoformat(row["date"])
    round_up_since = date.fromisoformat(row["round_up_since"])
    if tx_date < round_up_since:
        return

    minor_units = int(Decimal(row["amount"]) * 100)
    rounded_up = math.ceil(minor_units / 100) * 100
    round_up_minor = rounded_up - minor_units

    if round_up_minor == 0:
        return

    existing = conn.execute(
        "SELECT id FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx_id,)
    ).fetchone()
    if existing:
        return

    round_up_amount = str((Decimal(round_up_minor) / 100).quantize(Decimal("0.01")))
    cursor = conn.execute(
        "INSERT INTO splits (transaction_id, amount, sort_order, is_round_up) VALUES (?, ?, 999, 1)",
        (tx_id, round_up_amount),
    )
    conn.commit()

    envelope_id = get_or_create_round_up_envelope(conn, row["account_id"])
    conn.execute(
        "INSERT INTO allocations (envelope_id, split_id) VALUES (?, ?)",
        (envelope_id, cursor.lastrowid),
    )
    conn.commit()
```

Add `import math` and `from decimal import Decimal` at the top of `sync/db.py` (Decimal is already imported).

**Step 4: Run all split tests**

```bash
python -m pytest tests/test_splits.py -v
```

Expected: all 13 tests pass.

**Step 5: Commit**

```bash
git add sync/db.py tests/test_splits.py
git commit -m "feat: add ensure_round_up_split to sync/db.py"
```

---

### Task 6: Python — wire split creation into sync

**Files:**
- Modify: `sync/sync.py`
- Modify: `sync/db.py` (update imports list at top of sync.py)
- Modify: `tests/test_sync.py`

**Step 1: Add a failing integration test to `tests/test_sync.py`**

```python
from sync.db import get_or_create_round_up_envelope


def test_sync_creates_default_split_for_each_transaction(db_conn, saved_account):
    txs = [
        _make_api_tx(saved_account.id, date(2025, 6, d), lunchflow_id=f"lf-{d}")
        for d in range(1, 4)
    ]
    client = _make_client(txs, balance=Decimal("-30.00"))
    sync_account(db_conn, client, saved_account)

    for d in range(1, 4):
        tx_row = db_conn.execute(
            "SELECT id FROM transactions WHERE lunchflow_id = ?", (f"lf-{d}",)
        ).fetchone()
        split = db_conn.execute(
            "SELECT * FROM splits WHERE transaction_id = ? AND is_default = 1",
            (tx_row["id"],),
        ).fetchone()
        assert split is not None, f"No default split for lf-{d}"


def test_sync_creates_round_up_split_when_enabled(db_conn, saved_account):
    # Enable round-up from before the transaction date
    db_conn.execute(
        "UPDATE accounts SET round_up_since = '2025-01-01' WHERE id = ?",
        (saved_account.id,),
    )
    db_conn.commit()

    tx = _make_api_tx(
        saved_account.id, date(2025, 6, 1),
        amount=Decimal("4.75"), cdi="DBIT", lunchflow_id="lf-roundup"
    )
    client = _make_client([tx], balance=Decimal("-4.75"))
    sync_account(db_conn, client, saved_account)

    tx_row = db_conn.execute(
        "SELECT id FROM transactions WHERE lunchflow_id = 'lf-roundup'"
    ).fetchone()
    split = db_conn.execute(
        "SELECT amount FROM splits WHERE transaction_id = ? AND is_round_up = 1",
        (tx_row["id"],),
    ).fetchone()
    assert split is not None
    assert split["amount"] == "0.25"


def test_sync_no_round_up_split_before_enabled_date(db_conn, saved_account):
    db_conn.execute(
        "UPDATE accounts SET round_up_since = '2025-07-01' WHERE id = ?",
        (saved_account.id,),
    )
    db_conn.commit()

    tx = _make_api_tx(
        saved_account.id, date(2025, 6, 1),
        amount=Decimal("4.75"), cdi="DBIT", lunchflow_id="lf-before"
    )
    client = _make_client([tx], balance=Decimal("-4.75"))
    sync_account(db_conn, client, saved_account)

    tx_row = db_conn.execute(
        "SELECT id FROM transactions WHERE lunchflow_id = 'lf-before'"
    ).fetchone()
    split = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1",
        (tx_row["id"],),
    ).fetchone()
    assert split is None
```

**Step 2: Run to confirm they fail**

```bash
python -m pytest tests/test_sync.py::test_sync_creates_default_split_for_each_transaction -v
```

Expected: FAIL — assertion error (no default split created).

**Step 3: Update `sync/sync.py`**

Add `ensure_default_split` and `ensure_round_up_split` to the import from `.db`:

```python
from .db import (
    get_all_accounts,
    has_opening_balance,
    insert_transaction,
    update_account_sync_info,
    upsert_transaction,
    ensure_default_split,
    ensure_round_up_split,
)
```

In `sync_account`, after `upsert_transaction(conn, tx)`:

```python
    for tx in api_transactions:
        tx.account_id = account.id
        saved = upsert_transaction(conn, tx)
        ensure_default_split(conn, saved.id)
        ensure_round_up_split(conn, saved.id)
```

Also do the same after `insert_transaction` for the opening balance adjustor:

```python
                saved_adjustor = insert_transaction(conn, Transaction(...))
                ensure_default_split(conn, saved_adjustor.id)
```

**Step 4: Run all Python tests**

```bash
python -m pytest tests/ -v
```

Expected: all pass.

**Step 5: Commit**

```bash
git add sync/sync.py sync/db.py tests/test_sync.py
git commit -m "feat: create default and round-up splits during sync"
```

---

### Task 7: TypeScript — update types

**Files:**
- Modify: `web/src/lib/types.ts`

**Step 1: Update Account and Split interfaces**

In `types.ts`:

- Change `round_up: boolean` → `round_up_since: string | null`
- Add `is_default: boolean` to `Split`

```typescript
export interface Account {
    id: number;
    lunchflow_id: number;
    institution_name: string;
    name: string | null;
    currency: string;
    last_synced_at: string | null;
    round_up_since: string | null;
}

export interface Split {
    id: number;
    transaction_id: number;
    amount: string;
    note: string | null;
    sort_order: number;
    is_round_up: boolean;
    is_default: boolean;
}
```

**Step 2: Run web tests to see what breaks**

```bash
cd /Users/wmayor/Projects/budget-tool/web
npx vitest run
```

Expected: TypeScript compile errors in tests and queries referencing `round_up`.

**Step 3: Commit the type changes (other files fixed in subsequent tasks)**

```bash
git add web/src/lib/types.ts
git commit -m "feat: update Account and Split types for round_up_since and is_default"
```

---

### Task 8: TypeScript — remove old query functions

**Files:**
- Modify: `web/src/lib/queries.ts`
- Modify: `web/src/lib/__tests__/queries.test.ts`

**Step 1: In `queries.ts`, remove these exported functions:**
- `ensureDefaultSplit`
- `ensureRoundUpSplit`
- `saveSplits`
- `resetSplits`

Make `getOrCreateRoundUpEnvelope` unexported (remove the `export` keyword — it's still needed by `setAccountRoundUp`).

Remove the side-effect call to `ensureDefaultSplit` inside `getUnallocatedTransactions` (lines 441-444 — the for loop at the bottom of the function).

**Step 2: In `queries.test.ts`, remove the import and test blocks for:**
- `ensureDefaultSplit` (describe block ~lines 42–73)
- `saveSplits` (describe block ~lines 79–135)
- `resetSplits` (describe block ~lines 292–303)
- `resetSplits with round_up enabled` (describe block ~lines 484–500)
- `ensureRoundUpSplit` (describe block ~lines 368–442)
- `saveSplits with round_up enabled` (describe block ~lines 448–478)
- `getOrCreateRoundUpEnvelope` (describe block ~lines 338–362)
- `setAccountRoundUp` (describe block ~lines 506–530)

Also remove the imports of these functions from the top of the test file.

**Step 3: Run web tests**

```bash
cd /Users/wmayor/Projects/budget-tool/web
npx vitest run src/lib/__tests__/queries.test.ts
```

Expected: remaining tests (allocateSplit, getUnallocatedTransactions, getEnvelopes, deleteEnvelope, getSplitsWithStatus) all pass.

**Step 4: Commit**

```bash
git add web/src/lib/queries.ts web/src/lib/__tests__/queries.test.ts
git commit -m "refactor: remove ensureDefaultSplit, ensureRoundUpSplit, saveSplits, resetSplits from web"
```

---

### Task 9: TypeScript — update `setAccountRoundUp`

**Files:**
- Modify: `web/src/lib/queries.ts`

**Step 1: Update the function signature and body**

Replace the existing `setAccountRoundUp`:

```typescript
export function setAccountRoundUp(
    accountId: number,
    since: string | null,
    db: Database.Database = getDb()
): void {
    db.prepare(`UPDATE accounts SET round_up_since = ? WHERE id = ?`).run(since, accountId);
    if (since) {
        getOrCreateRoundUpEnvelope(accountId, db);
    }
}
```

**Step 2: Update the server action call site**

In `web/src/routes/accounts/[accountId]/+page.server.ts`, update `toggle_round_up`:

```typescript
toggle_round_up: async ({ request, params }) => {
    const accountId = parseInt(params.accountId, 10);
    const data = await request.formData();
    const enabled = data.get('enabled') === '1';
    const since = enabled ? new Date().toISOString().split('T')[0] : null;
    setAccountRoundUp(accountId, since);
    redirect(303, `/accounts/${accountId}`);
}
```

**Step 3: Run web tests**

```bash
cd /Users/wmayor/Projects/budget-tool/web
npx vitest run
```

Expected: pass.

**Step 4: Commit**

```bash
git add web/src/lib/queries.ts web/src/routes/accounts/[accountId]/+page.server.ts
git commit -m "feat: setAccountRoundUp now accepts a date string instead of boolean"
```

---

### Task 10: TypeScript — add `createSplit` and `deleteSplit`

**Files:**
- Modify: `web/src/lib/queries.ts`
- Modify: `web/src/lib/__tests__/queries.test.ts`

**Step 1: Write failing tests**

Add to `queries.test.ts` (import `createSplit`, `deleteSplit` at top):

```typescript
// ---------------------------------------------------------------------------
// createSplit
// ---------------------------------------------------------------------------

describe('createSplit', () => {
    beforeEach(() => {
        // Manually create a default split (sync's job in production)
        // ensureDefaultSplit is gone, so insert directly
    });

    it('creates a non-default split and reduces the default split', () => {
        const txId = seedTransaction(db, accountId, { amount: '10.00' });
        db.prepare(
            `INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, '10.00', 0, 1)`
        ).run(txId);

        createSplit(txId, '4.00', undefined, db);

        const defaultSplit = db.prepare(
            `SELECT amount FROM splits WHERE transaction_id = ? AND is_default = 1`
        ).get(txId) as { amount: string };
        expect(defaultSplit.amount).toBe('6.00');

        const newSplit = db.prepare(
            `SELECT amount, is_default FROM splits WHERE transaction_id = ? AND is_default = 0 AND is_round_up = 0`
        ).get(txId) as { amount: string; is_default: number };
        expect(newSplit.amount).toBe('4.00');
        expect(newSplit.is_default).toBe(0);
    });

    it('saves optional note on the new split', () => {
        const txId = seedTransaction(db, accountId, { amount: '10.00' });
        db.prepare(
            `INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, '10.00', 0, 1)`
        ).run(txId);

        createSplit(txId, '3.00', 'Coffee', db);

        const split = db.prepare(
            `SELECT note FROM splits WHERE transaction_id = ? AND is_default = 0 AND is_round_up = 0`
        ).get(txId) as { note: string };
        expect(split.note).toBe('Coffee');
    });

    it('rejects amount equal to or greater than the default split amount', () => {
        const txId = seedTransaction(db, accountId, { amount: '10.00' });
        db.prepare(
            `INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, '10.00', 0, 1)`
        ).run(txId);

        expect(() => createSplit(txId, '10.00', undefined, db)).toThrow(SplitValidationError);
        expect(() => createSplit(txId, '15.00', undefined, db)).toThrow(SplitValidationError);
    });

    it('rejects zero or negative amount', () => {
        const txId = seedTransaction(db, accountId, { amount: '10.00' });
        db.prepare(
            `INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, '10.00', 0, 1)`
        ).run(txId);

        expect(() => createSplit(txId, '0.00', undefined, db)).toThrow(SplitValidationError);
        expect(() => createSplit(txId, '-1.00', undefined, db)).toThrow(SplitValidationError);
    });
});

// ---------------------------------------------------------------------------
// deleteSplit
// ---------------------------------------------------------------------------

describe('deleteSplit', () => {
    it('deletes a non-default split and returns its amount to the default split', () => {
        const txId = seedTransaction(db, accountId, { amount: '10.00' });
        db.prepare(
            `INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, '6.00', 0, 1)`
        ).run(txId);
        db.prepare(
            `INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '4.00', 1)`
        ).run(txId);
        const nonDefault = db.prepare(
            `SELECT id FROM splits WHERE transaction_id = ? AND is_default = 0 AND is_round_up = 0`
        ).get(txId) as { id: number };

        deleteSplit(nonDefault.id, db);

        const splits = db.prepare(
            `SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 0`
        ).all(txId);
        expect(splits).toHaveLength(1);

        const defaultSplit = db.prepare(
            `SELECT amount FROM splits WHERE transaction_id = ? AND is_default = 1`
        ).get(txId) as { amount: string };
        expect(defaultSplit.amount).toBe('10.00');
    });

    it('throws when attempting to delete the default split', () => {
        const txId = seedTransaction(db, accountId, { amount: '10.00' });
        db.prepare(
            `INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, '10.00', 0, 1)`
        ).run(txId);
        const defaultSplit = db.prepare(
            `SELECT id FROM splits WHERE transaction_id = ? AND is_default = 1`
        ).get(txId) as { id: number };

        expect(() => deleteSplit(defaultSplit.id, db)).toThrow();
    });

    it('removes any existing allocation when deleting a split', () => {
        const txId = seedTransaction(db, accountId, { amount: '10.00' });
        db.prepare(
            `INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, '6.00', 0, 1)`
        ).run(txId);
        db.prepare(
            `INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '4.00', 1)`
        ).run(txId);
        const nonDefault = db.prepare(
            `SELECT id FROM splits WHERE transaction_id = ? AND is_default = 0 AND is_round_up = 0`
        ).get(txId) as { id: number };
        const envelopeId = seedEnvelope(db, accountId);
        db.prepare(`INSERT INTO allocations (envelope_id, split_id) VALUES (?, ?)`).run(envelopeId, nonDefault.id);

        deleteSplit(nonDefault.id, db);

        const alloc = db.prepare(`SELECT * FROM allocations WHERE split_id = ?`).get(nonDefault.id);
        expect(alloc).toBeUndefined();
    });
});
```

**Step 2: Run to confirm they fail**

```bash
cd /Users/wmayor/Projects/budget-tool/web
npx vitest run src/lib/__tests__/queries.test.ts --reporter=verbose 2>&1 | grep -A3 "createSplit\|deleteSplit"
```

Expected: FAIL — `createSplit is not a function`

**Step 3: Implement in `queries.ts`**

Add after `setAccountRoundUp`:

```typescript
export function createSplit(
    transactionId: number,
    amount: string,
    note: string | undefined,
    db: Database.Database = getDb()
): void {
    const newMinor = toMinorUnits(amount);
    if (newMinor <= 0) throw new SplitValidationError('Amount must be greater than zero');

    withRetry(() =>
        db.transaction(() => {
            const defaultSplit = db
                .prepare(`SELECT id, amount FROM splits WHERE transaction_id = ? AND is_default = 1`)
                .get(transactionId) as { id: number; amount: string } | null;
            if (!defaultSplit) throw new Error(`No default split for transaction ${transactionId}`);

            const defaultMinor = toMinorUnits(defaultSplit.amount);
            if (newMinor >= defaultMinor) {
                throw new SplitValidationError('Amount must be less than the remaining default split amount');
            }

            const newDefaultAmount = fromMinorUnits(defaultMinor - newMinor);
            db.prepare(`UPDATE splits SET amount = ? WHERE id = ?`).run(newDefaultAmount, defaultSplit.id);

            const maxOrder = db
                .prepare(
                    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM splits WHERE transaction_id = ? AND is_round_up = 0 AND is_default = 0`
                )
                .get(transactionId) as { m: number };
            db.prepare(
                `INSERT INTO splits (transaction_id, amount, note, sort_order) VALUES (?, ?, ?, ?)`
            ).run(transactionId, amount, note ?? null, maxOrder.m + 1);
        })()
    );
}

export function deleteSplit(
    splitId: number,
    db: Database.Database = getDb()
): void {
    withRetry(() =>
        db.transaction(() => {
            const split = db
                .prepare(`SELECT transaction_id, amount, is_default FROM splits WHERE id = ?`)
                .get(splitId) as { transaction_id: number; amount: string; is_default: number } | null;
            if (!split) throw new Error(`Split ${splitId} not found`);
            if (split.is_default) throw new Error('Cannot delete the default split');

            const defaultSplit = db
                .prepare(`SELECT id, amount FROM splits WHERE transaction_id = ? AND is_default = 1`)
                .get(split.transaction_id) as { id: number; amount: string };

            const returnedMinor = toMinorUnits(split.amount);
            const currentDefaultMinor = toMinorUnits(defaultSplit.amount);
            const newDefaultAmount = fromMinorUnits(currentDefaultMinor + returnedMinor);

            db.prepare(`DELETE FROM allocations WHERE split_id = ?`).run(splitId);
            db.prepare(`DELETE FROM splits WHERE id = ?`).run(splitId);
            db.prepare(`UPDATE splits SET amount = ? WHERE id = ?`).run(newDefaultAmount, defaultSplit.id);
        })()
    );
}
```

**Step 4: Run all web tests**

```bash
cd /Users/wmayor/Projects/budget-tool/web
npx vitest run
```

Expected: all pass.

**Step 5: Commit**

```bash
git add web/src/lib/queries.ts web/src/lib/__tests__/queries.test.ts
git commit -m "feat: add createSplit and deleteSplit to web queries"
```

---

### Task 11: Web — update server actions on account page

**Files:**
- Modify: `web/src/routes/accounts/[accountId]/+page.server.ts`

**Step 1: Update imports**

Replace the import block with:

```typescript
import {
    getAccount,
    getEnvelopes,
    getUnallocatedTransactions,
    createEnvelope,
    renameEnvelope,
    deleteEnvelope,
    allocateSplit,
    getSplitsWithStatus,
    setAccountRoundUp,
    createSplit,
    deleteSplit
} from '$lib/queries.js';
```

**Step 2: Add `create_split` and `delete_split` actions, remove `toggle_round_up` back-fill**

The `toggle_round_up` action is already updated in Task 9.

Add after the `delete_envelope` action:

```typescript
create_split: async ({ request, params }) => {
    const accountId = parseInt(params.accountId, 10);
    const data = await request.formData();
    const txId = parseInt(data.get('tx_id') as string, 10);
    const amount = (data.get('amount') as string)?.trim();
    const note = (data.get('note') as string)?.trim() || undefined;

    if (isNaN(txId) || !amount) return fail(400, { error: 'Invalid input' });

    try {
        createSplit(txId, amount, note);
    } catch (err) {
        if (err instanceof SplitValidationError) return fail(422, { error: err.message });
        throw err;
    }

    redirect(303, `/accounts/${accountId}?tx=${data.get('tx_index') ?? 0}`);
},

delete_split: async ({ request, params }) => {
    const accountId = parseInt(params.accountId, 10);
    const data = await request.formData();
    const splitId = parseInt(data.get('split_id') as string, 10);

    if (isNaN(splitId)) return fail(400, { error: 'Invalid split id' });

    deleteSplit(splitId);
    redirect(303, `/accounts/${accountId}?tx=${data.get('tx_index') ?? 0}`);
},
```

Also import `SplitValidationError` if not already imported:

```typescript
import { AlreadyAllocatedError, EnvelopeHasAllocationsError, SplitValidationError } from '$lib/types.js';
```

**Step 3: Remove the `cancel` action** (it doesn't exist on this page — the cancel was on the split page which we'll delete in Task 13).

**Step 4: Commit**

```bash
git add web/src/routes/accounts/[accountId]/+page.server.ts
git commit -m "feat: add create_split and delete_split server actions to account page"
```

---

### Task 12: Web — update account page UI

**Files:**
- Modify: `web/src/routes/accounts/[accountId]/+page.svelte`

**Step 1: Update the round-up toggle to use `round_up_since`**

Replace the two references to `account.round_up` in the toggle section:

```svelte
<input type="hidden" name="enabled" value={account.round_up_since ? '0' : '1'} />
<button
    ...
    class:bg-indigo-600={account.round_up_since !== null}
    class:bg-gray-200={account.round_up_since === null}
    role="switch"
    aria-checked={account.round_up_since !== null}
    ...
>
    <span
        ...
        class:translate-x-5={account.round_up_since !== null}
        class:translate-x-0={account.round_up_since === null}
    ></span>
</button>
```

**Step 2: Replace the "✂ Split" link with inline split management**

The dock currently shows a "✂ Split" link (line 330–337) navigating to the `/split` page. Replace that entire `<!-- Actions -->` block and the splits summary with:

```svelte
<!-- Split parts -->
<div class="mt-2 space-y-1">
    {#each splits as split (split.id)}
        {#if !split.is_round_up}
            <div class="flex items-center gap-2 text-xs py-1">
                <span class={split.is_allocated ? 'text-green-600' : 'text-orange-400'}>
                    {split.is_allocated ? '✓' : '○'}
                </span>
                <span class="text-gray-700 font-medium">{formatCurrency(split.amount, tx.currency)}</span>
                {#if split.is_default}
                    <span class="text-gray-400 text-[10px] uppercase tracking-wide">default</span>
                {/if}
                {#if split.note}
                    <span class="text-gray-400">— {split.note}</span>
                {/if}
                {#if split.is_allocated && split.envelope_name}
                    <span class="text-green-600 ml-auto">{split.envelope_name}</span>
                {:else if !split.is_default}
                    <form method="POST" action="?/delete_split" use:enhance class="ml-auto">
                        <input type="hidden" name="split_id" value={split.id} />
                        <input type="hidden" name="tx_index" value={data.currentTxIndex} />
                        <button type="submit" class="text-red-400 hover:text-red-600 text-[10px]">
                            Delete
                        </button>
                    </form>
                {/if}
            </div>
        {/if}
    {/each}
</div>

<!-- Add split form (shown on default split if unallocated) -->
{@const defaultSplit = splits.find(s => s.is_default)}
{#if defaultSplit && !defaultSplit.is_allocated}
    {#if showSplitForm}
        <form method="POST" action="?/create_split" use:enhance
              onsubmit={() => { showSplitForm = false; }}
              class="mt-2 flex gap-2 items-end">
            <input type="hidden" name="tx_id" value={tx.id} />
            <input type="hidden" name="tx_index" value={data.currentTxIndex} />
            <div>
                <label class="text-[10px] text-gray-500 block mb-0.5">Amount</label>
                <div class="relative">
                    <span class="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                        {tx.currency === 'GBP' ? '£' : tx.currency === 'EUR' ? '€' : '$'}
                    </span>
                    <input name="amount" type="text" inputmode="decimal" required
                           class="w-24 border border-gray-300 rounded pl-5 pr-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                           placeholder="0.00" />
                </div>
            </div>
            <div class="flex-1">
                <label class="text-[10px] text-gray-500 block mb-0.5">Note</label>
                <input name="note" type="text"
                       class="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                       placeholder="optional" />
            </div>
            <button type="submit"
                    class="bg-indigo-600 text-white text-xs font-medium rounded px-3 py-1 hover:bg-indigo-700 shrink-0">
                Split
            </button>
            <button type="button" onclick={() => { showSplitForm = false; }}
                    class="text-gray-400 text-xs hover:text-gray-600 shrink-0">
                Cancel
            </button>
        </form>
    {:else}
        <button
            type="button"
            onclick={() => { showSplitForm = true; }}
            class="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            data-testid="split-btn"
        >
            ✂ Split
        </button>
    {/if}
{/if}
```

**Step 3: Add `showSplitForm` to the script block**

In the `<script>` block, add:

```typescript
let showSplitForm = $state(false);
```

And reset it when the transaction changes:

```typescript
$effect(() => {
    data.currentTxIndex;
    showSplitForm = false;
});
```

**Step 4: Remove the old `isMultiSplit` / `unallocatedSplits` derived values** that are no longer used, and the old split summary block and "✂ Split" link.

**Step 5: Run the app and verify manually** (no automated UI test for this iteration).

**Step 6: Commit**

```bash
git add web/src/routes/accounts/[accountId]/+page.svelte
git commit -m "feat: inline split management in account dock — add/delete per-split"
```

---

### Task 13: Remove the `/split` route

**Files:**
- Delete: `web/src/routes/accounts/[accountId]/split/+page.server.ts`
- Delete: `web/src/routes/accounts/[accountId]/split/+page.svelte`

**Step 1: Delete the files**

```bash
rm web/src/routes/accounts/[accountId]/split/+page.server.ts
rm web/src/routes/accounts/[accountId]/split/+page.svelte
```

**Step 2: Run web tests to confirm nothing references the deleted route**

```bash
cd /Users/wmayor/Projects/budget-tool/web
npx vitest run
```

Expected: all pass.

**Step 3: Commit**

```bash
git add -A web/src/routes/accounts/\[accountId\]/split/
git commit -m "refactor: remove /split route — split management is now inline"
```

---

### Task 14: Update `getSplitsWithStatus` to include `is_default`

**Files:**
- Modify: `web/src/lib/queries.ts`

The `getSplitsWithStatus` query returns splits but doesn't include `is_default`. The Svelte page now uses `split.is_default`, so it must be in the result.

**Step 1: Update the SELECT in `getSplitsWithStatus`**

The query already does `s.*` so `is_default` is already included. Verify the type cast includes it by confirming `SplitWithStatus` extends `Split` which now has `is_default: boolean`. No query change needed — just verify.

**Step 2: Update the `.map()` in `getSplitsWithStatus`** to pass through `is_default`:

```typescript
.map((row: Record<string, unknown>) => ({
    ...(row as Split),
    is_allocated: (row.is_allocated as number) === 1,
    is_round_up: (row.is_round_up as number) === 1,
    is_default: (row.is_default as number) === 1,
    envelope_id: (row.envelope_id as number | null) ?? null,
    envelope_name: (row.envelope_name as string | null) ?? null
})) as SplitWithStatus[];
```

(The existing map already has `is_round_up: false` hardcoded — that's wrong, fix it here to read from the row.)

**Step 3: Run all web tests**

```bash
cd /Users/wmayor/Projects/budget-tool/web
npx vitest run
```

Expected: all pass.

**Step 4: Commit**

```bash
git add web/src/lib/queries.ts
git commit -m "fix: include is_default and correct is_round_up in getSplitsWithStatus"
```

---

### Task 15: Final check

**Step 1: Run all Python tests**

```bash
cd /Users/wmayor/Projects/budget-tool
python -m pytest tests/ -v
```

Expected: all pass.

**Step 2: Run all web tests**

```bash
cd /Users/wmayor/Projects/budget-tool/web
npx vitest run
```

Expected: all pass.

**Step 3: Run the web app and smoke-test manually**

```bash
cd /Users/wmayor/Projects/budget-tool/web
npm run dev
```

Check:
- Account page loads
- Round-up toggle shows correctly (no `round_up` boolean errors)
- Unallocated transaction appears in dock with splits listed
- "✂ Split" button appears, shows inline form
- Creating a split reduces the default split amount
- Delete button on non-default split returns amount to default
- Default split cannot be deleted
