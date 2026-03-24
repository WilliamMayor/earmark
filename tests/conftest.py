"""
Shared fixtures and factory helpers used across the test suite.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from sync.db import get_connection, init_schema, insert_session, upsert_account
from sync.models import Account, PsuType, Session, Transaction, TransactionStatus


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

@pytest.fixture
def db_conn():
    """Fresh in-memory SQLite connection with schema initialised."""
    conn = get_connection(":memory:")
    init_schema(conn)
    yield conn
    conn.close()


# ---------------------------------------------------------------------------
# Persisted model fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def saved_session(db_conn):
    return insert_session(
        db_conn,
        Session(
            session_id="sess-abc-001",
            aspsp_name="Monzo",
            psu_type=PsuType.PERSONAL,
            valid_until=datetime(2026, 12, 31, tzinfo=timezone.utc),
            created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            is_active=True,
        ),
    )


@pytest.fixture
def saved_account(db_conn, saved_session):
    return upsert_account(
        db_conn,
        Account(
            session_id=saved_session.id,
            account_uid="acc-uid-001",
            aspsp_name="Monzo",
            currency="GBP",
            name="Personal Current Account",
        ),
    )


# ---------------------------------------------------------------------------
# Factory helpers (not fixtures — call these inside tests for flexibility)
# ---------------------------------------------------------------------------

def make_transaction(account_id: int, **overrides) -> Transaction:
    """Build a Transaction with sensible defaults; override any field via kwargs."""
    defaults = dict(
        account_id=account_id,
        amount=Decimal("10.00"),
        currency="GBP",
        credit_debit_indicator="DBIT",
        status=TransactionStatus.BOOKED,
        booking_date=date(2025, 6, 1),
        payee="Tesco",
        entry_reference=None,
    )
    defaults.update(overrides)
    return Transaction(**defaults)
