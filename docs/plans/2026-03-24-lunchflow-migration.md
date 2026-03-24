# Lunchflow Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Enable Banking SDK with the Lunchflow REST API, removing the OAuth consent flow and simplifying the entire stack to a single API key.

**Architecture:** The CLI polls Lunchflow's REST API (`/accounts`, `/accounts/{id}/transactions`, `/accounts/{id}/balance`) using a simple `httpx` client. Bank connections are managed in the Lunchflow dashboard, not in the CLI. Deduplication is replaced by upsert-on-lunchflow-id. An opening balance adjustor transaction is inserted when the sum of fetched transactions doesn't match the current balance (indicating missing history).

**Tech Stack:** Python 3.14, httpx, SQLite (via stdlib sqlite3), pytest, pytest-mock, uv

---

### Task 1: Swap dependency from enablebanking_sdk to httpx

**Files:**
- Modify: `pyproject.toml`

**Step 1: Replace the dependency**

Edit `pyproject.toml` so the dependencies list reads:

```toml
dependencies = [
    "httpx>=0.27.0",
    "python-dotenv>=1.0.0",
]
```

**Step 2: Sync deps**

```bash
uv sync
```

Expected: httpx installed, enablebanking_sdk removed.

**Step 3: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "feat: replace enablebanking_sdk with httpx"
```

---

### Task 2: Delete files that are being fully replaced

**Files:**
- Delete: `sync/auth.py`
- Delete: `sync/dedup.py`
- Delete: `tests/test_auth.py`
- Delete: `tests/test_dedup.py`

**Step 1: Delete the files**

```bash
rm sync/auth.py sync/dedup.py tests/test_auth.py tests/test_dedup.py
```

**Step 2: Verify tests still collect (just skip failures)**

```bash
uv run pytest --collect-only 2>&1 | head -40
```

Expected: collection errors on missing imports — that's fine, we'll fix them in subsequent tasks.

**Step 3: Commit**

```bash
git add -u
git commit -m "chore: delete Enable Banking auth, dedup, and their tests"
```

---

### Task 3: Rewrite models

**Files:**
- Modify: `sync/models.py`

**Step 1: Rewrite `sync/models.py` in full**

```python
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional


class TransactionStatus(str, Enum):
    BOOKED = "booked"
    PENDING = "pending"
    OPENING_BALANCE = "opening_balance"


@dataclass
class Account:
    lunchflow_id: int
    currency: str
    name: Optional[str] = None
    institution_name: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    id: Optional[int] = None


@dataclass
class Transaction:
    account_id: int
    amount: Decimal
    currency: str
    credit_debit_indicator: str  # "CRDT" | "DBIT"
    status: TransactionStatus
    lunchflow_id: Optional[str] = None
    date: Optional[date] = None
    merchant: Optional[str] = None
    description: Optional[str] = None
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    id: Optional[int] = None
```

**Step 2: Verify it imports cleanly**

```bash
uv run python -c "from sync.models import Account, Transaction, TransactionStatus; print('ok')"
```

Expected: `ok`

**Step 3: Commit**

```bash
git add sync/models.py
git commit -m "feat: simplify models to match Lunchflow schema"
```

---

### Task 4: Rewrite migration SQL

**Files:**
- Modify: `migrations/0001_initial.sql`

**Step 1: Rewrite `migrations/0001_initial.sql` in full**

```sql
CREATE TABLE IF NOT EXISTS accounts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    lunchflow_id     INTEGER NOT NULL UNIQUE,
    name             TEXT,
    institution_name TEXT,
    currency         TEXT NOT NULL,
    last_synced_at   TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id             INTEGER NOT NULL REFERENCES accounts(id),
    lunchflow_id           TEXT,
    date                   TEXT,
    amount                 TEXT NOT NULL,
    currency               TEXT NOT NULL,
    credit_debit_indicator TEXT NOT NULL CHECK(credit_debit_indicator IN ('CRDT', 'DBIT')),
    status                 TEXT NOT NULL CHECK(status IN ('booked', 'pending', 'opening_balance')),
    merchant               TEXT,
    description            TEXT,
    note                   TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_lunchflow_id
    ON transactions(lunchflow_id) WHERE lunchflow_id IS NOT NULL;
```

**Step 2: Verify migration runs against in-memory DB**

```bash
uv run python -c "
from sync.db import get_connection, init_schema
conn = get_connection(':memory:')
init_schema(conn)
tables = [r[0] for r in conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()]
print(tables)
"
```

Expected: `['schema_migrations', 'accounts', 'transactions']` (no `sessions`).

**Step 3: Commit**

```bash
git add migrations/0001_initial.sql
git commit -m "feat: rewrite migration for Lunchflow schema"
```

---

### Task 5: Rewrite config.py

**Files:**
- Modify: `sync/config.py`

**Step 1: Rewrite `sync/config.py` in full**

```python
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    api_key: str
    db_path: Path


def load_config() -> Config:
    return Config(
        api_key=os.environ["LUNCHFLOW_API_KEY"],
        db_path=Path(os.environ.get("DB_PATH", "transactions.db")),
    )
```

**Step 2: Verify it imports**

```bash
uv run python -c "from sync.config import Config, load_config; print('ok')"
```

Expected: `ok`

**Step 3: Commit**

```bash
git add sync/config.py
git commit -m "feat: simplify config to LUNCHFLOW_API_KEY only"
```

---

### Task 6: Rewrite db.py

**Files:**
- Modify: `sync/db.py`
- Modify: `tests/conftest.py`
- Modify: `tests/test_db.py`

**Step 1: Write failing tests in `tests/test_db.py`**

Replace the entire file:

```python
"""Tests for sync/db.py — schema, CRUD operations, and constraints."""

import sqlite3 as _sqlite3
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from sync.db import (
    get_all_accounts,
    get_transactions_for_account,
    insert_transaction,
    update_account_sync_info,
    update_transaction_status,
    upsert_account,
    upsert_transaction,
)
from sync.models import Account, Transaction, TransactionStatus
from tests.conftest import make_transaction


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def test_upsert_account_insert(db_conn):
    account = upsert_account(db_conn, Account(lunchflow_id=42, currency="GBP", name="Monzo"))
    assert account.id is not None
    accounts = get_all_accounts(db_conn)
    assert any(a.lunchflow_id == 42 for a in accounts)


def test_upsert_account_updates_on_duplicate_lunchflow_id(db_conn):
    upsert_account(db_conn, Account(lunchflow_id=42, currency="GBP", name="Old Name"))
    upsert_account(db_conn, Account(lunchflow_id=42, currency="GBP", name="New Name"))
    accounts = get_all_accounts(db_conn)
    matching = [a for a in accounts if a.lunchflow_id == 42]
    assert len(matching) == 1
    assert matching[0].name == "New Name"


def test_update_account_sync_info(db_conn, saved_account):
    synced_at = datetime(2025, 6, 15, 12, 0, tzinfo=timezone.utc)
    update_account_sync_info(db_conn, saved_account.id, synced_at)
    accounts = get_all_accounts(db_conn)
    account = next(a for a in accounts if a.id == saved_account.id)
    assert account.last_synced_at == synced_at


# ---------------------------------------------------------------------------
# Transactions — insert
# ---------------------------------------------------------------------------

def test_insert_transaction_assigns_id(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id))
    assert tx.id is not None
    assert tx.id > 0


def test_insert_transaction_round_trips_amount(db_conn, saved_account):
    insert_transaction(db_conn, make_transaction(saved_account.id, amount=Decimal("123.45")))
    retrieved = get_transactions_for_account(db_conn, saved_account.id)
    assert retrieved[0].amount == Decimal("123.45")


def test_null_lunchflow_id_allows_multiple(db_conn, saved_account):
    insert_transaction(db_conn, make_transaction(saved_account.id, lunchflow_id=None))
    insert_transaction(db_conn, make_transaction(saved_account.id, lunchflow_id=None))
    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert len(txns) == 2


def test_lunchflow_id_unique_per_account(db_conn, saved_account):
    insert_transaction(db_conn, make_transaction(saved_account.id, lunchflow_id="lf-1"))
    with pytest.raises(_sqlite3.IntegrityError):
        insert_transaction(db_conn, make_transaction(saved_account.id, lunchflow_id="lf-1"))


# ---------------------------------------------------------------------------
# Transactions — upsert
# ---------------------------------------------------------------------------

def test_upsert_transaction_inserts_new(db_conn, saved_account):
    tx = make_transaction(saved_account.id, lunchflow_id="lf-new")
    result = upsert_transaction(db_conn, tx)
    assert result.id is not None
    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert len(txns) == 1


def test_upsert_transaction_updates_existing(db_conn, saved_account):
    insert_transaction(
        db_conn,
        make_transaction(saved_account.id, lunchflow_id="lf-1", status=TransactionStatus.PENDING),
    )
    upsert_transaction(
        db_conn,
        make_transaction(saved_account.id, lunchflow_id="lf-1", status=TransactionStatus.BOOKED),
    )
    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert len(txns) == 1
    assert txns[0].status == TransactionStatus.BOOKED


def test_upsert_transaction_preserves_note(db_conn, saved_account):
    insert_transaction(
        db_conn,
        make_transaction(saved_account.id, lunchflow_id="lf-1", note="my note"),
    )
    upsert_transaction(
        db_conn,
        make_transaction(saved_account.id, lunchflow_id="lf-1", note=None),
    )
    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert txns[0].note == "my note"


def test_upsert_transaction_with_null_lunchflow_id_inserts(db_conn, saved_account):
    tx = make_transaction(saved_account.id, lunchflow_id=None)
    result = upsert_transaction(db_conn, tx)
    assert result.id is not None


# ---------------------------------------------------------------------------
# Transactions — queries
# ---------------------------------------------------------------------------

def test_get_transactions_filtered_by_date_range(db_conn, saved_account):
    for d in [date(2025, 1, 1), date(2025, 6, 1), date(2025, 12, 1)]:
        insert_transaction(db_conn, make_transaction(saved_account.id, date=d))
    result = get_transactions_for_account(
        db_conn, saved_account.id, date_from=date(2025, 3, 1), date_to=date(2025, 9, 1)
    )
    assert len(result) == 1
    assert result[0].date == date(2025, 6, 1)


def test_update_transaction_status(db_conn, saved_account):
    tx = insert_transaction(
        db_conn, make_transaction(saved_account.id, status=TransactionStatus.PENDING)
    )
    update_transaction_status(db_conn, tx.id, TransactionStatus.BOOKED)
    result = get_transactions_for_account(db_conn, saved_account.id)
    assert result[0].status == TransactionStatus.BOOKED


@pytest.mark.parametrize("status", list(TransactionStatus))
def test_all_statuses_round_trip(db_conn, saved_account, status):
    insert_transaction(db_conn, make_transaction(saved_account.id, status=status))
    result = get_transactions_for_account(db_conn, saved_account.id)
    assert result[0].status == status
```

**Step 2: Rewrite `tests/conftest.py`**

```python
"""Shared fixtures and factory helpers used across the test suite."""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from sync.db import get_connection, init_schema, upsert_account
from sync.models import Account, Transaction, TransactionStatus


@pytest.fixture
def db_conn():
    """Fresh in-memory SQLite connection with schema initialised."""
    conn = get_connection(":memory:")
    init_schema(conn)
    yield conn
    conn.close()


@pytest.fixture
def saved_account(db_conn):
    return upsert_account(
        db_conn,
        Account(
            lunchflow_id=1001,
            currency="GBP",
            name="Personal Current Account",
            institution_name="Monzo",
        ),
    )


def make_transaction(account_id: int, **overrides) -> Transaction:
    """Build a Transaction with sensible defaults; override any field via kwargs."""
    defaults = dict(
        account_id=account_id,
        amount=Decimal("10.00"),
        currency="GBP",
        credit_debit_indicator="DBIT",
        status=TransactionStatus.BOOKED,
        date=date(2025, 6, 1),
        merchant="Tesco",
        lunchflow_id=None,
    )
    defaults.update(overrides)
    return Transaction(**defaults)
```

**Step 3: Run tests to confirm they fail**

```bash
uv run pytest tests/test_db.py -v 2>&1 | head -50
```

Expected: errors importing `upsert_transaction` (doesn't exist yet).

**Step 4: Rewrite `sync/db.py` in full**

```python
import json
import sqlite3
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Optional, Union

from .migrations import run_migrations
from .models import Account, Transaction, TransactionStatus


def get_connection(db_path: Union[Path, str]) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    """Apply all pending migrations. Safe to call on every startup."""
    run_migrations(conn)


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def upsert_account(conn: sqlite3.Connection, account: Account) -> Account:
    existing = conn.execute(
        "SELECT id FROM accounts WHERE lunchflow_id = ?",
        (account.lunchflow_id,),
    ).fetchone()

    if existing:
        conn.execute(
            "UPDATE accounts SET name = ?, institution_name = ?, currency = ? WHERE lunchflow_id = ?",
            (account.name, account.institution_name, account.currency, account.lunchflow_id),
        )
        conn.commit()
        account_id = existing["id"]
    else:
        cursor = conn.execute(
            "INSERT INTO accounts (lunchflow_id, name, institution_name, currency) VALUES (?, ?, ?, ?)",
            (account.lunchflow_id, account.name, account.institution_name, account.currency),
        )
        conn.commit()
        account_id = cursor.lastrowid

    return Account(
        id=account_id,
        lunchflow_id=account.lunchflow_id,
        name=account.name,
        institution_name=account.institution_name,
        currency=account.currency,
        last_synced_at=account.last_synced_at,
    )


def get_all_accounts(conn: sqlite3.Connection) -> list[Account]:
    rows = conn.execute("SELECT * FROM accounts").fetchall()
    return [_row_to_account(row) for row in rows]


def update_account_sync_info(
    conn: sqlite3.Connection,
    account_id: int,
    synced_at: datetime,
) -> None:
    conn.execute(
        "UPDATE accounts SET last_synced_at = ? WHERE id = ?",
        (synced_at.isoformat(), account_id),
    )
    conn.commit()


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
    )


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

def insert_transaction(conn: sqlite3.Connection, tx: Transaction) -> Transaction:
    cursor = conn.execute(
        """
        INSERT INTO transactions (
            account_id, lunchflow_id, date, amount, currency,
            credit_debit_indicator, status, merchant, description, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            tx.account_id,
            tx.lunchflow_id,
            tx.date.isoformat() if tx.date else None,
            str(tx.amount),
            tx.currency,
            tx.credit_debit_indicator,
            tx.status.value,
            tx.merchant,
            tx.description,
            tx.note,
        ),
    )
    conn.commit()
    return Transaction(
        id=cursor.lastrowid,
        account_id=tx.account_id,
        lunchflow_id=tx.lunchflow_id,
        date=tx.date,
        amount=tx.amount,
        currency=tx.currency,
        credit_debit_indicator=tx.credit_debit_indicator,
        status=tx.status,
        merchant=tx.merchant,
        description=tx.description,
        note=tx.note,
    )


def upsert_transaction(conn: sqlite3.Connection, tx: Transaction) -> Transaction:
    """Insert or update a transaction by lunchflow_id. The note field is never overwritten."""
    if tx.lunchflow_id is not None:
        existing = conn.execute(
            "SELECT id, note FROM transactions WHERE lunchflow_id = ?",
            (tx.lunchflow_id,),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE transactions SET
                    date = ?, amount = ?, currency = ?, credit_debit_indicator = ?,
                    status = ?, merchant = ?, description = ?, updated_at = datetime('now')
                WHERE lunchflow_id = ?
                """,
                (
                    tx.date.isoformat() if tx.date else None,
                    str(tx.amount),
                    tx.currency,
                    tx.credit_debit_indicator,
                    tx.status.value,
                    tx.merchant,
                    tx.description,
                    tx.lunchflow_id,
                ),
            )
            conn.commit()
            return Transaction(
                id=existing["id"],
                account_id=tx.account_id,
                lunchflow_id=tx.lunchflow_id,
                date=tx.date,
                amount=tx.amount,
                currency=tx.currency,
                credit_debit_indicator=tx.credit_debit_indicator,
                status=tx.status,
                merchant=tx.merchant,
                description=tx.description,
                note=existing["note"],
            )
    return insert_transaction(conn, tx)


def update_transaction_status(
    conn: sqlite3.Connection,
    transaction_id: int,
    status: TransactionStatus,
) -> None:
    conn.execute(
        "UPDATE transactions SET status = ?, updated_at = datetime('now') WHERE id = ?",
        (status.value, transaction_id),
    )
    conn.commit()


def get_transactions_for_account(
    conn: sqlite3.Connection,
    account_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[Transaction]:
    query = "SELECT * FROM transactions WHERE account_id = ?"
    params: list = [account_id]

    if date_from:
        query += " AND (date IS NULL OR date >= ?)"
        params.append(date_from.isoformat())
    if date_to:
        query += " AND (date IS NULL OR date <= ?)"
        params.append(date_to.isoformat())

    query += " ORDER BY date ASC, id ASC"
    rows = conn.execute(query, params).fetchall()
    return [_row_to_transaction(row) for row in rows]


def _row_to_transaction(row: sqlite3.Row) -> Transaction:
    return Transaction(
        id=row["id"],
        account_id=row["account_id"],
        lunchflow_id=row["lunchflow_id"],
        date=date.fromisoformat(row["date"]) if row["date"] else None,
        amount=Decimal(row["amount"]),
        currency=row["currency"],
        credit_debit_indicator=row["credit_debit_indicator"],
        status=TransactionStatus(row["status"]),
        merchant=row["merchant"],
        description=row["description"],
        note=row["note"],
        created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
        updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
    )
```

**Step 5: Run tests to verify they pass**

```bash
uv run pytest tests/test_db.py -v
```

Expected: all tests pass.

**Step 6: Commit**

```bash
git add sync/db.py tests/test_db.py tests/conftest.py
git commit -m "feat: rewrite db.py for Lunchflow schema with upsert_transaction"
```

---

### Task 7: Write client.py

**Files:**
- Modify: `sync/client.py`
- Create: `tests/test_client.py`

**Step 1: Write failing tests in `tests/test_client.py`**

```python
"""Tests for sync/client.py — Lunchflow API mapping."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from sync.client import LunchflowClient, _map_account, _map_transaction
from sync.models import Account, TransactionStatus


# ---------------------------------------------------------------------------
# _map_account
# ---------------------------------------------------------------------------

def test_map_account_basic():
    data = {"id": 42, "name": "Current", "institution_name": "Monzo", "currency": "GBP", "status": "ACTIVE"}
    account = _map_account(data)
    assert account.lunchflow_id == 42
    assert account.name == "Current"
    assert account.institution_name == "Monzo"
    assert account.currency == "GBP"


# ---------------------------------------------------------------------------
# _map_transaction
# ---------------------------------------------------------------------------

def test_map_transaction_debit():
    data = {
        "id": "tx-1",
        "accountId": 42,
        "amount": -25.50,
        "currency": "GBP",
        "date": "2025-06-01",
        "merchant": "Tesco",
        "description": "groceries",
        "isPending": False,
    }
    tx = _map_transaction(data)
    assert tx.lunchflow_id == "tx-1"
    assert tx.credit_debit_indicator == "DBIT"
    assert tx.amount == Decimal("25.50")
    assert tx.status == TransactionStatus.BOOKED
    assert tx.merchant == "Tesco"
    assert tx.date == date(2025, 6, 1)


def test_map_transaction_credit():
    data = {
        "id": "tx-2",
        "accountId": 42,
        "amount": 1000.00,
        "currency": "GBP",
        "date": "2025-06-15",
        "merchant": "Employer",
        "description": "salary",
        "isPending": False,
    }
    tx = _map_transaction(data)
    assert tx.credit_debit_indicator == "CRDT"
    assert tx.amount == Decimal("1000.00")


def test_map_transaction_pending():
    data = {
        "id": "tx-3",
        "accountId": 42,
        "amount": -5.00,
        "currency": "GBP",
        "date": "2025-06-10",
        "merchant": "Coffee",
        "description": None,
        "isPending": True,
    }
    tx = _map_transaction(data)
    assert tx.status == TransactionStatus.PENDING


def test_map_transaction_null_id_returns_none():
    data = {
        "id": None,
        "accountId": 42,
        "amount": -5.00,
        "currency": "GBP",
        "date": "2025-06-10",
        "merchant": "Unknown",
        "description": None,
        "isPending": False,
    }
    result = _map_transaction(data)
    assert result is None


# ---------------------------------------------------------------------------
# LunchflowClient (mocked HTTP)
# ---------------------------------------------------------------------------

def _make_client(responses: dict) -> LunchflowClient:
    """Build a LunchflowClient whose HTTP calls return pre-canned responses."""
    import httpx

    def handler(request):
        path = request.url.path
        for pattern, response_data in responses.items():
            if pattern in path:
                return httpx.Response(200, json=response_data)
        return httpx.Response(404, json={"error": "not found"})

    transport = httpx.MockTransport(handler)
    client = LunchflowClient.__new__(LunchflowClient)
    client._client = httpx.Client(transport=transport, base_url="https://lunchflow.app/api/v1")
    return client


def test_list_accounts_returns_accounts():
    client = _make_client({
        "/accounts": {"accounts": [
            {"id": 1, "name": "Current", "institution_name": "Monzo", "currency": "GBP", "status": "ACTIVE"},
        ], "total": 1}
    })
    accounts = client.list_accounts()
    assert len(accounts) == 1
    assert isinstance(accounts[0], Account)
    assert accounts[0].lunchflow_id == 1


def test_get_transactions_maps_correctly():
    client = _make_client({
        "/transactions": {"transactions": [
            {"id": "t1", "accountId": 1, "amount": -10.0, "currency": "GBP",
             "date": "2025-06-01", "merchant": "Shop", "description": "stuff", "isPending": False},
        ], "total": 1}
    })
    txs = client.get_transactions(1)
    assert len(txs) == 1
    assert txs[0].credit_debit_indicator == "DBIT"
    assert txs[0].amount == Decimal("10.00")


def test_get_transactions_skips_null_id(capsys):
    client = _make_client({
        "/transactions": {"transactions": [
            {"id": None, "accountId": 1, "amount": -10.0, "currency": "GBP",
             "date": "2025-06-01", "merchant": "Shop", "description": None, "isPending": False},
        ], "total": 1}
    })
    txs = client.get_transactions(1)
    assert txs == []


def test_get_balance_returns_decimal():
    client = _make_client({
        "/balance": {"balance": {"amount": 1234.56, "currency": "GBP"}}
    })
    balance = client.get_balance(1)
    assert balance == Decimal("1234.56")
```

**Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_client.py -v 2>&1 | head -30
```

Expected: ImportError — `_map_account`, `_map_transaction` don't exist yet.

**Step 3: Rewrite `sync/client.py` in full**

```python
"""
Lunchflow API client.

All bank connections are managed in the Lunchflow dashboard.
This module handles HTTP communication and maps API responses to internal models.
"""

import warnings
from datetime import date
from decimal import Decimal
from typing import Optional

import httpx

from .models import Account, Transaction, TransactionStatus

_BASE_URL = "https://lunchflow.app/api/v1"


class LunchflowClient:
    def __init__(self, api_key: str):
        self._client = httpx.Client(
            base_url=_BASE_URL,
            headers={"x-api-key": api_key},
        )

    def list_accounts(self) -> list[Account]:
        response = self._client.get("/accounts")
        response.raise_for_status()
        return [_map_account(a) for a in response.json()["accounts"]]

    def get_transactions(self, account_id: int) -> list[Transaction]:
        response = self._client.get(
            f"/accounts/{account_id}/transactions",
            params={"include_pending": "true"},
        )
        response.raise_for_status()
        result = []
        for tx_data in response.json()["transactions"]:
            tx = _map_transaction(tx_data)
            if tx is not None:
                result.append(tx)
        return result

    def get_balance(self, account_id: int) -> Decimal:
        response = self._client.get(f"/accounts/{account_id}/balance")
        response.raise_for_status()
        return Decimal(str(response.json()["balance"]["amount"]))

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def _map_account(data: dict) -> Account:
    return Account(
        lunchflow_id=data["id"],
        name=data.get("name"),
        institution_name=data.get("institution_name"),
        currency=data["currency"],
    )


def _map_transaction(data: dict) -> Optional[Transaction]:
    lunchflow_id = data.get("id")
    if lunchflow_id is None:
        warnings.warn(f"Skipping transaction with null id: {data}")
        return None

    raw_amount = Decimal(str(data["amount"]))
    if raw_amount < 0:
        credit_debit_indicator = "DBIT"
        amount = -raw_amount
    else:
        credit_debit_indicator = "CRDT"
        amount = raw_amount

    tx_date = date.fromisoformat(data["date"]) if data.get("date") else None

    return Transaction(
        account_id=data["accountId"],
        lunchflow_id=lunchflow_id,
        amount=amount,
        currency=data["currency"],
        credit_debit_indicator=credit_debit_indicator,
        status=TransactionStatus.PENDING if data.get("isPending") else TransactionStatus.BOOKED,
        date=tx_date,
        merchant=data.get("merchant"),
        description=data.get("description"),
    )
```

**Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/test_client.py -v
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add sync/client.py tests/test_client.py
git commit -m "feat: add Lunchflow HTTP client with account/transaction/balance endpoints"
```

---

### Task 8: Rewrite sync.py

**Files:**
- Modify: `sync/sync.py`
- Modify: `tests/test_sync.py`

**Step 1: Write failing tests in `tests/test_sync.py`**

Replace the entire file:

```python
"""Tests for sync/sync.py — sync orchestration."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from sync.db import get_all_accounts, get_transactions_for_account, insert_transaction
from sync.models import Account, TransactionStatus
from sync.sync import sync_account
from tests.conftest import make_transaction


def _make_client(transactions=None, balance=Decimal("0")):
    """Build a mock LunchflowClient."""
    client = MagicMock()
    client.get_transactions.return_value = transactions or []
    client.get_balance.return_value = balance
    return client


def _make_api_tx(account_id, tx_date, amount=Decimal("10.00"), cdi="DBIT",
                 lunchflow_id="lf-1", status=TransactionStatus.BOOKED):
    from sync.models import Transaction
    return Transaction(
        account_id=account_id,
        lunchflow_id=lunchflow_id,
        amount=amount,
        currency="GBP",
        credit_debit_indicator=cdi,
        status=status,
        date=tx_date,
        merchant="Tesco",
    )


# ---------------------------------------------------------------------------
# Opening balance adjustor
# ---------------------------------------------------------------------------

def test_no_adjustor_when_balance_matches(db_conn, saved_account):
    # One DBIT of £10, balance is -£10 (net). current_balance = -10.
    tx = _make_api_tx(saved_account.id, date(2025, 6, 1), amount=Decimal("10.00"), cdi="DBIT")
    client = _make_client([tx], balance=Decimal("-10.00"))

    sync_account(db_conn, client, saved_account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    opening = [t for t in txns if t.status == TransactionStatus.OPENING_BALANCE]
    assert len(opening) == 0


def test_adjustor_inserted_when_balance_does_not_match(db_conn, saved_account):
    # One DBIT of £10, but current_balance = £90 (meaning £100 was there before)
    tx = _make_api_tx(saved_account.id, date(2025, 6, 1), amount=Decimal("10.00"), cdi="DBIT")
    client = _make_client([tx], balance=Decimal("90.00"))

    sync_account(db_conn, client, saved_account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    opening = [t for t in txns if t.status == TransactionStatus.OPENING_BALANCE]
    assert len(opening) == 1
    # adjustor = 90 - (-10) = 100 CRDT
    assert opening[0].amount == Decimal("100.00")
    assert opening[0].credit_debit_indicator == "CRDT"


def test_adjustor_dated_one_day_before_earliest_transaction(db_conn, saved_account):
    tx = _make_api_tx(saved_account.id, date(2025, 6, 5), amount=Decimal("10.00"), cdi="DBIT")
    client = _make_client([tx], balance=Decimal("50.00"))

    sync_account(db_conn, client, saved_account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    opening = [t for t in txns if t.status == TransactionStatus.OPENING_BALANCE]
    assert opening[0].date == date(2025, 6, 4)


def test_no_adjustor_when_no_transactions(db_conn, saved_account):
    client = _make_client([], balance=Decimal("0.00"))
    sync_account(db_conn, client, saved_account)
    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert txns == []


# ---------------------------------------------------------------------------
# Upsert behaviour
# ---------------------------------------------------------------------------

def test_sync_inserts_new_transactions(db_conn, saved_account):
    txs = [
        _make_api_tx(saved_account.id, date(2025, 6, d), lunchflow_id=f"lf-{d}")
        for d in range(1, 4)
    ]
    client = _make_client(txs, balance=Decimal("-30.00"))

    result = sync_account(db_conn, client, saved_account)

    assert result["upserted"] == 3


def test_sync_updates_pending_to_booked(db_conn, saved_account):
    insert_transaction(
        db_conn,
        make_transaction(
            saved_account.id,
            lunchflow_id="lf-1",
            status=TransactionStatus.PENDING,
            date=date(2025, 6, 1),
        ),
    )
    tx = _make_api_tx(
        saved_account.id, date(2025, 6, 1),
        lunchflow_id="lf-1", status=TransactionStatus.BOOKED,
    )
    client = _make_client([tx], balance=Decimal("-10.00"))

    sync_account(db_conn, client, saved_account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert txns[0].status == TransactionStatus.BOOKED


def test_sync_preserves_note_on_update(db_conn, saved_account):
    insert_transaction(
        db_conn,
        make_transaction(saved_account.id, lunchflow_id="lf-1", note="keep me"),
    )
    tx = _make_api_tx(saved_account.id, date(2025, 6, 1), lunchflow_id="lf-1")
    client = _make_client([tx], balance=Decimal("-10.00"))

    sync_account(db_conn, client, saved_account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert txns[0].note == "keep me"


# ---------------------------------------------------------------------------
# Sync metadata
# ---------------------------------------------------------------------------

def test_sync_updates_last_synced_at(db_conn, saved_account):
    client = _make_client([], balance=Decimal("0.00"))
    sync_account(db_conn, client, saved_account)

    accounts = get_all_accounts(db_conn)
    account = next(a for a in accounts if a.id == saved_account.id)
    assert account.last_synced_at is not None


def test_sync_result_has_expected_keys(db_conn, saved_account):
    client = _make_client([], balance=Decimal("0.00"))
    result = sync_account(db_conn, client, saved_account)
    assert "lunchflow_id" in result
    assert "institution_name" in result
    assert "upserted" in result
```

**Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_sync.py -v 2>&1 | head -30
```

Expected: ImportError or AttributeError — sync.py still has old code.

**Step 3: Rewrite `sync/sync.py` in full**

```python
"""
Sync orchestration: fetches transactions and balance from Lunchflow,
upserts transactions by lunchflow_id, and inserts an opening balance
adjustor if the fetched history doesn't account for the full balance.
"""

import sqlite3
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from .db import (
    get_all_accounts,
    insert_transaction,
    update_account_sync_info,
    upsert_transaction,
)
from .models import Account, Transaction, TransactionStatus


def sync_account(conn: sqlite3.Connection, client, account: Account) -> dict:
    """
    Sync transactions for a single account. Returns a summary dict.
    Raises httpx.HTTPError on API errors — the caller is responsible for handling these.
    """
    api_transactions = client.get_transactions(account.lunchflow_id)
    current_balance = client.get_balance(account.lunchflow_id)

    # Detect missing history by comparing balance against sum of fetched transactions.
    # Signed sum: CRDT adds, DBIT subtracts.
    if api_transactions:
        expected_balance = sum(
            tx.amount if tx.credit_debit_indicator == "CRDT" else -tx.amount
            for tx in api_transactions
        )
        if expected_balance != current_balance:
            earliest_date = min(
                (tx.date for tx in api_transactions if tx.date),
                default=None,
            )
            if earliest_date:
                adjustor_signed = current_balance - expected_balance
                if adjustor_signed < 0:
                    cdi = "DBIT"
                    adj_amount = -adjustor_signed
                else:
                    cdi = "CRDT"
                    adj_amount = adjustor_signed

                insert_transaction(
                    conn,
                    Transaction(
                        account_id=account.id,
                        amount=adj_amount,
                        currency=account.currency,
                        credit_debit_indicator=cdi,
                        status=TransactionStatus.OPENING_BALANCE,
                        date=earliest_date - timedelta(days=1),
                        note="Opening balance adjustor — edit if incorrect.",
                    ),
                )

    # Upsert all transactions, setting account_id to our DB ID
    for tx in api_transactions:
        tx.account_id = account.id
        upsert_transaction(conn, tx)

    now = datetime.now(timezone.utc)
    update_account_sync_info(conn, account.id, now)

    return {
        "lunchflow_id": account.lunchflow_id,
        "institution_name": account.institution_name,
        "upserted": len(api_transactions),
    }


def sync_all(conn: sqlite3.Connection, client) -> list[dict]:
    """Sync every registered account. Returns a list of per-account result dicts."""
    accounts = get_all_accounts(conn)
    if not accounts:
        print("No accounts found. Connect banks in the Lunchflow dashboard.")
        return []

    results = []
    for account in accounts:
        label = f"{account.institution_name or 'Unknown'} / {account.name or account.lunchflow_id}"
        print(f"Syncing {label}...")
        try:
            result = sync_account(conn, client, account)
            results.append(result)
            print(f"  {result['upserted']} transaction(s) synced")
        except Exception as e:
            print(f"  Failed: {e}")
            results.append({
                "lunchflow_id": account.lunchflow_id,
                "institution_name": account.institution_name,
                "error": str(e),
            })

    return results
```

**Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/test_sync.py -v
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add sync/sync.py tests/test_sync.py
git commit -m "feat: rewrite sync with balance-based opening adjustor and upsert-by-lunchflow-id"
```

---

### Task 9: Rewrite sync_transactions.py

**Files:**
- Modify: `sync_transactions.py`

**Step 1: Rewrite `sync_transactions.py` in full**

```python
#!/usr/bin/env python3
"""
Sync bank account transactions to a local SQLite database via Lunchflow.

Usage:
  uv run sync_transactions.py           # sync all connected accounts
  uv run sync_transactions.py --db PATH # use a specific database file

Bank connections are managed at https://www.lunchflow.app
"""

import argparse
import sys
from pathlib import Path

import httpx

from sync.client import LunchflowClient
from sync.config import load_config
from sync.db import get_connection, init_schema, upsert_account
from sync.sync import sync_all


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync bank transactions via Lunchflow")
    parser.add_argument("--db", default="transactions.db", help="Path to SQLite database")
    args = parser.parse_args()

    config = load_config()
    conn = get_connection(Path(args.db))
    init_schema(conn)

    try:
        with LunchflowClient(config.api_key) as client:
            # Refresh account list from Lunchflow on every run
            for api_account in client.list_accounts():
                upsert_account(conn, api_account)

            results = sync_all(conn, client)

        if not results:
            return

        total = sum(r.get("upserted", 0) for r in results)
        errors = [r for r in results if "error" in r]
        print(f"\nDone. {total} transaction(s) synced across {len(results)} account(s).")
        if errors:
            print(f"  {len(errors)} account(s) failed — see errors above.")

    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (401, 403):
            print("Authentication failed. Check your LUNCHFLOW_API_KEY.")
        else:
            print(f"Lunchflow API error: {exc}")
        sys.exit(1)

    except KeyboardInterrupt:
        print("\nCancelled.")
        sys.exit(0)


if __name__ == "__main__":
    main()
```

**Step 2: Verify it imports cleanly**

```bash
uv run python -c "import sync_transactions; print('ok')"
```

Expected: `ok`

**Step 3: Run the full test suite**

```bash
uv run pytest -v
```

Expected: all tests pass, no collection errors.

**Step 4: Commit**

```bash
git add sync_transactions.py
git commit -m "feat: rewrite CLI for Lunchflow — remove --setup, use API key auth"
```

---

### Task 10: Run tests/test_migrations.py and clean up

**Files:**
- Modify: `tests/test_migrations.py` (if it references old schema)

**Step 1: Run migration tests**

```bash
uv run pytest tests/test_migrations.py -v
```

Review any failures against the new schema and fix them.

**Step 2: Run full suite one final time**

```bash
uv run pytest -v
```

Expected: all tests pass.

**Step 3: Final commit**

```bash
git add -u
git commit -m "chore: verify all tests pass after Lunchflow migration"
```
