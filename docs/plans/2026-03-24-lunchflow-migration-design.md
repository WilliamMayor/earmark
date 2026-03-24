# Design: Migrate from Enable Banking to Lunchflow

**Date:** 2026-03-24
**Status:** Approved

## Context

The project syncs UK bank transactions to a local SQLite database. It currently uses the Enable Banking SDK, which requires owning an OAuth/PSD2 consent flow (app ID, private key certificate, redirect URLs, session management). This is being replaced with Lunchflow, a hosted aggregator where bank connections are managed through the Lunchflow dashboard. The CLI just polls Lunchflow's REST API with a simple API key.

Starting fresh — no existing data to migrate.

## Architecture

### Files deleted
- `sync/auth.py` — entire OAuth consent flow, session management, bank allowlist
- `sync/dedup.py` — brittle dedup logic, replaced by upsert-by-lunchflow-id

### Files replaced
- `sync/client.py` — new `httpx`-based Lunchflow API client
- `sync/config.py` — simplified to just `LUNCHFLOW_API_KEY`

### Files updated
- `sync/models.py` — remove `Session`, `PsuType`; simplify `Account` and `Transaction` (see below)
- `sync/db.py` — remove all session functions; update account/transaction functions for new schema
- `sync/sync.py` — replace dedup-based sync with upsert-by-lunchflow-id + balance-based opening adjustor
- `sync/migrations.py` — rewrite from scratch (no data to preserve)
- `sync_transactions.py` — simplified CLI (remove `--setup`, remove Enable Banking service construction)
- `pyproject.toml` — replace `enablebanking_sdk` with `httpx`

## Models

### Transaction

| Field | Type | Source |
|---|---|---|
| `id` | `int \| None` | internal DB PK |
| `account_id` | `int` | DB FK |
| `lunchflow_id` | `str \| None` | Lunchflow `id` (dedup key) |
| `date` | `date \| None` | Lunchflow `date` |
| `amount` | `Decimal` | `abs(Lunchflow.amount)` |
| `currency` | `str` | Lunchflow `currency` |
| `credit_debit_indicator` | `str` | `"DBIT"` if amount < 0, else `"CRDT"` |
| `status` | `TransactionStatus` | `PENDING` if `isPending` else `BOOKED` |
| `merchant` | `str \| None` | Lunchflow `merchant` |
| `description` | `str \| None` | Lunchflow `description` |
| `note` | `str \| None` | manual, never overwritten by sync |
| `created_at` | `datetime \| None` | DB |
| `updated_at` | `datetime \| None` | DB |

### TransactionStatus
`BOOKED`, `PENDING`, `OPENING_BALANCE` (remove `UNCONFIRMED` — was only set by dedup logic).

### Account

| Field | Type | Source |
|---|---|---|
| `id` | `int \| None` | internal DB PK |
| `lunchflow_id` | `int` | Lunchflow account `id` |
| `name` | `str \| None` | Lunchflow `name` |
| `institution_name` | `str \| None` | Lunchflow `institution_name` |
| `currency` | `str` | Lunchflow `currency` |
| `last_synced_at` | `datetime \| None` | updated each sync |

### Removed models
`Session`, `PsuType` — deleted entirely.

## Sync Flow

For each account returned by `GET /accounts`:

1. **Fetch all transactions** — `GET /accounts/{id}/transactions?include_pending=true`
2. **Fetch current balance** — `GET /accounts/{id}/balance`
3. **Detect missing history** — compute `expected_balance = sum(signed amounts of all fetched transactions)`. If `expected_balance ≠ current_balance`, insert an `OPENING_BALANCE` adjustor transaction dated one day before the earliest fetched transaction, with `amount = current_balance - expected_balance` (sign determines `credit_debit_indicator`).
4. **Upsert by lunchflow_id** — for each transaction, insert if `lunchflow_id` not present, otherwise update `status`, `merchant`, `description`, `amount`, `date` (do not overwrite `note`). Skip transactions where `lunchflow_id` is `None` (log a warning).

No date-range filtering — Lunchflow returns full history on every call. Deduplication is handled entirely by the upsert on `lunchflow_id`.

## DB Schema

### accounts
```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lunchflow_id INTEGER NOT NULL UNIQUE,
    name TEXT,
    institution_name TEXT,
    currency TEXT NOT NULL,
    last_synced_at TEXT
);
```

### transactions
```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    lunchflow_id TEXT UNIQUE,
    date TEXT,
    amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    credit_debit_indicator TEXT NOT NULL,
    status TEXT NOT NULL,
    merchant TEXT,
    description TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

`lunchflow_id` is nullable (some transactions may not have one) but unique where present.

## Configuration

Single env var: `LUNCHFLOW_API_KEY`. No private key file, no redirect URL, no app ID.

## CLI

```
uv run sync_transactions.py            # sync all accounts
uv run sync_transactions.py --db PATH  # use a specific database file
```

`--setup` is removed. Bank connections are managed in the Lunchflow dashboard.
