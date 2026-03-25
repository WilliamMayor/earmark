from __future__ import annotations

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
        round_up_since=(
            date.fromisoformat(row["round_up_since"]) if row["round_up_since"] else None
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


def has_opening_balance(conn: sqlite3.Connection, account_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM transactions WHERE account_id = ? AND status = ? LIMIT 1",
        (account_id, TransactionStatus.OPENING_BALANCE.value),
    ).fetchone()
    return row is not None


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
