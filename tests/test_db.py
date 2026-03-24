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
    assert tx.id is not None
    update_transaction_status(db_conn, tx.id, TransactionStatus.BOOKED)
    result = get_transactions_for_account(db_conn, saved_account.id)
    assert result[0].status == TransactionStatus.BOOKED


@pytest.mark.parametrize("status", list(TransactionStatus))
def test_all_statuses_round_trip(db_conn, saved_account, status):
    insert_transaction(db_conn, make_transaction(saved_account.id, status=status))
    result = get_transactions_for_account(db_conn, saved_account.id)
    assert result[0].status == status
