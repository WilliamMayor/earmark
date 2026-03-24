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
# Sessions
# ---------------------------------------------------------------------------

def insert_session(conn: sqlite3.Connection, session: Session) -> Session:
    cursor = conn.execute(
        """
        INSERT INTO sessions (session_id, aspsp_name, psu_type, valid_until, created_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            session.session_id,
            session.aspsp_name,
            session.psu_type.value,
            session.valid_until.isoformat(),
            session.created_at.isoformat(),
            int(session.is_active),
        ),
    )
    conn.commit()
    return Session(
        id=cursor.lastrowid,
        session_id=session.session_id,
        aspsp_name=session.aspsp_name,
        psu_type=session.psu_type,
        valid_until=session.valid_until,
        created_at=session.created_at,
        is_active=session.is_active,
    )


def get_active_session(conn: sqlite3.Connection, aspsp_name: str) -> Optional[Session]:
    row = conn.execute(
        """
        SELECT * FROM sessions
        WHERE aspsp_name = ? AND is_active = 1
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (aspsp_name,),
    ).fetchone()
    return _row_to_session(row) if row else None


def deactivate_session(conn: sqlite3.Connection, session_id: int) -> None:
    conn.execute("UPDATE sessions SET is_active = 0 WHERE id = ?", (session_id,))
    conn.commit()


def _row_to_session(row: sqlite3.Row) -> Session:
    return Session(
        id=row["id"],
        session_id=row["session_id"],
        aspsp_name=row["aspsp_name"],
        psu_type=PsuType(row["psu_type"]),
        valid_until=datetime.fromisoformat(row["valid_until"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        is_active=bool(row["is_active"]),
    )


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def upsert_account(conn: sqlite3.Connection, account: Account) -> Account:
    existing = conn.execute(
        "SELECT id FROM accounts WHERE account_uid = ?",
        (account.account_uid,),
    ).fetchone()

    if existing:
        conn.execute(
            """
            UPDATE accounts SET session_id = ?, name = ?, currency = ?
            WHERE account_uid = ?
            """,
            (account.session_id, account.name, account.currency, account.account_uid),
        )
        conn.commit()
        account_id = existing["id"]
    else:
        cursor = conn.execute(
            """
            INSERT INTO accounts (session_id, account_uid, aspsp_name, name, currency)
            VALUES (?, ?, ?, ?, ?)
            """,
            (account.session_id, account.account_uid, account.aspsp_name, account.name, account.currency),
        )
        conn.commit()
        account_id = cursor.lastrowid

    return Account(
        id=account_id,
        session_id=account.session_id,
        account_uid=account.account_uid,
        aspsp_name=account.aspsp_name,
        name=account.name,
        currency=account.currency,
        last_synced_at=account.last_synced_at,
        last_synced_booking_date=account.last_synced_booking_date,
    )


def get_all_accounts(conn: sqlite3.Connection) -> list[Account]:
    rows = conn.execute("SELECT * FROM accounts").fetchall()
    return [_row_to_account(row) for row in rows]


def get_accounts_for_session(conn: sqlite3.Connection, session_id: int) -> list[Account]:
    rows = conn.execute(
        "SELECT * FROM accounts WHERE session_id = ?", (session_id,)
    ).fetchall()
    return [_row_to_account(row) for row in rows]


def update_account_sync_info(
    conn: sqlite3.Connection,
    account_id: int,
    synced_at: datetime,
    latest_booking_date: Optional[date],
) -> None:
    conn.execute(
        """
        UPDATE accounts
        SET last_synced_at = ?, last_synced_booking_date = ?
        WHERE id = ?
        """,
        (
            synced_at.isoformat(),
            latest_booking_date.isoformat() if latest_booking_date else None,
            account_id,
        ),
    )
    conn.commit()


def _row_to_account(row: sqlite3.Row) -> Account:
    return Account(
        id=row["id"],
        session_id=row["session_id"],
        account_uid=row["account_uid"],
        aspsp_name=row["aspsp_name"],
        name=row["name"],
        currency=row["currency"],
        last_synced_at=datetime.fromisoformat(row["last_synced_at"]) if row["last_synced_at"] else None,
        last_synced_booking_date=(
            date.fromisoformat(row["last_synced_booking_date"])
            if row["last_synced_booking_date"]
            else None
        ),
    )


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

def insert_transaction(conn: sqlite3.Connection, tx: Transaction) -> Transaction:
    cursor = conn.execute(
        """
        INSERT INTO transactions (
            account_id, entry_reference, booking_date, value_date,
            amount, currency, credit_debit_indicator, status,
            payee, remittance_information, note, raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            tx.account_id,
            tx.entry_reference,
            tx.booking_date.isoformat() if tx.booking_date else None,
            tx.value_date.isoformat() if tx.value_date else None,
            str(tx.amount),
            tx.currency,
            tx.credit_debit_indicator,
            tx.status.value,
            tx.payee,
            json.dumps(tx.remittance_information) if tx.remittance_information else None,
            tx.note,
            json.dumps(tx.raw_data) if tx.raw_data else None,
        ),
    )
    conn.commit()
    return Transaction(
        id=cursor.lastrowid,
        account_id=tx.account_id,
        entry_reference=tx.entry_reference,
        booking_date=tx.booking_date,
        value_date=tx.value_date,
        amount=tx.amount,
        currency=tx.currency,
        credit_debit_indicator=tx.credit_debit_indicator,
        status=tx.status,
        payee=tx.payee,
        remittance_information=tx.remittance_information,
        note=tx.note,
        raw_data=tx.raw_data,
    )


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
        query += " AND (booking_date IS NULL OR booking_date >= ?)"
        params.append(date_from.isoformat())
    if date_to:
        query += " AND (booking_date IS NULL OR booking_date <= ?)"
        params.append(date_to.isoformat())

    query += " ORDER BY booking_date ASC, id ASC"
    rows = conn.execute(query, params).fetchall()
    return [_row_to_transaction(row) for row in rows]


def get_transaction_by_entry_ref(
    conn: sqlite3.Connection,
    account_id: int,
    entry_reference: str,
) -> Optional[Transaction]:
    row = conn.execute(
        "SELECT * FROM transactions WHERE account_id = ? AND entry_reference = ?",
        (account_id, entry_reference),
    ).fetchone()
    return _row_to_transaction(row) if row else None


def _row_to_transaction(row: sqlite3.Row) -> Transaction:
    return Transaction(
        id=row["id"],
        account_id=row["account_id"],
        entry_reference=row["entry_reference"],
        booking_date=date.fromisoformat(row["booking_date"]) if row["booking_date"] else None,
        value_date=date.fromisoformat(row["value_date"]) if row["value_date"] else None,
        amount=Decimal(row["amount"]),
        currency=row["currency"],
        credit_debit_indicator=row["credit_debit_indicator"],
        status=TransactionStatus(row["status"]),
        payee=row["payee"],
        remittance_information=(
            json.loads(row["remittance_information"]) if row["remittance_information"] else None
        ),
        note=row["note"],
        raw_data=json.loads(row["raw_data"]) if row["raw_data"] else None,
        created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
        updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
    )
