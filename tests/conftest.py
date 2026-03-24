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
