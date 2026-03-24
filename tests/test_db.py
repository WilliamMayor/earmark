"""Tests for sync/db.py — schema, CRUD operations, and constraints."""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from sync.db import (
    deactivate_session,
    get_accounts_for_session,
    get_active_session,
    get_all_accounts,
    get_transaction_by_entry_ref,
    get_transactions_for_account,
    insert_session,
    insert_transaction,
    update_account_sync_info,
    update_transaction_status,
    upsert_account,
)
from sync.models import Account, PsuType, Session, Transaction, TransactionStatus
from tests.conftest import make_transaction


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

def test_insert_session_assigns_id(db_conn):
    session = Session(
        session_id="s1",
        aspsp_name="Monzo",
        psu_type=PsuType.PERSONAL,
        valid_until=datetime(2026, 1, 1, tzinfo=timezone.utc),
        created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    saved = insert_session(db_conn, session)
    assert saved.id is not None
    assert saved.id > 0


def test_get_active_session_returns_most_recent(db_conn):
    for i, sid in enumerate(["first", "second"]):
        insert_session(
            db_conn,
            Session(
                session_id=sid,
                aspsp_name="Monzo",
                psu_type=PsuType.PERSONAL,
                valid_until=datetime(2026, 1, 1, tzinfo=timezone.utc),
                created_at=datetime(2025, 1, i + 1, tzinfo=timezone.utc),
                is_active=True,
            ),
        )
    result = get_active_session(db_conn, "Monzo")
    assert result.session_id == "second"


def test_get_active_session_returns_none_when_absent(db_conn):
    assert get_active_session(db_conn, "Starling") is None


def test_get_active_session_ignores_inactive(db_conn):
    s = insert_session(
        db_conn,
        Session(
            session_id="inactive",
            aspsp_name="Monzo",
            psu_type=PsuType.PERSONAL,
            valid_until=datetime(2026, 1, 1, tzinfo=timezone.utc),
            created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            is_active=True,
        ),
    )
    deactivate_session(db_conn, s.id)
    assert get_active_session(db_conn, "Monzo") is None


def test_deactivate_session(db_conn):
    s = insert_session(
        db_conn,
        Session(
            session_id="to-deactivate",
            aspsp_name="Nationwide",
            psu_type=PsuType.PERSONAL,
            valid_until=datetime(2026, 1, 1, tzinfo=timezone.utc),
            created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            is_active=True,
        ),
    )
    deactivate_session(db_conn, s.id)
    result = get_active_session(db_conn, "Nationwide")
    assert result is None


def test_session_preserves_psu_type(db_conn):
    insert_session(
        db_conn,
        Session(
            session_id="biz",
            aspsp_name="Mettle",
            psu_type=PsuType.BUSINESS,
            valid_until=datetime(2026, 1, 1, tzinfo=timezone.utc),
            created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            is_active=True,
        ),
    )
    result = get_active_session(db_conn, "Mettle")
    assert result.psu_type == PsuType.BUSINESS


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def test_upsert_account_insert(db_conn, saved_session):
    account = upsert_account(
        db_conn,
        Account(
            session_id=saved_session.id,
            account_uid="new-acc",
            aspsp_name="Monzo",
            currency="GBP",
            name="Savings",
        ),
    )
    assert account.id is not None
    accounts = get_accounts_for_session(db_conn, saved_session.id)
    assert any(a.account_uid == "new-acc" for a in accounts)


def test_upsert_account_updates_on_duplicate_uid(db_conn, saved_session):
    upsert_account(
        db_conn,
        Account(
            session_id=saved_session.id,
            account_uid="dup-acc",
            aspsp_name="Monzo",
            currency="GBP",
            name="Original",
        ),
    )
    updated = upsert_account(
        db_conn,
        Account(
            session_id=saved_session.id,
            account_uid="dup-acc",
            aspsp_name="Monzo",
            currency="GBP",
            name="Updated",
        ),
    )
    all_accounts = get_all_accounts(db_conn)
    matching = [a for a in all_accounts if a.account_uid == "dup-acc"]
    assert len(matching) == 1
    assert matching[0].name == "Updated"


def test_update_account_sync_info(db_conn, saved_account):
    synced_at = datetime(2025, 6, 15, 12, 0, tzinfo=timezone.utc)
    update_account_sync_info(db_conn, saved_account.id, synced_at, date(2025, 6, 14))

    accounts = get_all_accounts(db_conn)
    account = next(a for a in accounts if a.id == saved_account.id)
    assert account.last_synced_booking_date == date(2025, 6, 14)


def test_get_accounts_for_session_only_returns_own(db_conn, saved_session):
    other_session = insert_session(
        db_conn,
        Session(
            session_id="other",
            aspsp_name="Starling",
            psu_type=PsuType.PERSONAL,
            valid_until=datetime(2026, 1, 1, tzinfo=timezone.utc),
            created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            is_active=True,
        ),
    )
    upsert_account(
        db_conn,
        Account(session_id=saved_session.id, account_uid="monzo-1", aspsp_name="Monzo", currency="GBP"),
    )
    upsert_account(
        db_conn,
        Account(session_id=other_session.id, account_uid="starling-1", aspsp_name="Starling", currency="GBP"),
    )
    monzo_accounts = get_accounts_for_session(db_conn, saved_session.id)
    assert all(a.aspsp_name == "Monzo" for a in monzo_accounts)
    assert len(monzo_accounts) == 1


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

def test_insert_transaction_assigns_id(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id))
    assert tx.id is not None
    assert tx.id > 0


def test_insert_transaction_round_trips_amount(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id, amount=Decimal("123.45")))
    retrieved = get_transactions_for_account(db_conn, saved_account.id)
    assert retrieved[0].amount == Decimal("123.45")


def test_entry_reference_unique_per_account(db_conn, saved_account):
    import sqlite3 as _sqlite3
    insert_transaction(db_conn, make_transaction(saved_account.id, entry_reference="ref-1"))
    with pytest.raises(_sqlite3.IntegrityError):
        insert_transaction(db_conn, make_transaction(saved_account.id, entry_reference="ref-1"))


def test_null_entry_references_do_not_conflict(db_conn, saved_account):
    # Multiple transactions without entry_reference must be allowed
    insert_transaction(db_conn, make_transaction(saved_account.id, entry_reference=None))
    insert_transaction(db_conn, make_transaction(saved_account.id, entry_reference=None))
    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert len(txns) == 2


def test_get_transactions_filtered_by_date_range(db_conn, saved_account):
    for d in [date(2025, 1, 1), date(2025, 6, 1), date(2025, 12, 1)]:
        insert_transaction(db_conn, make_transaction(saved_account.id, booking_date=d))

    result = get_transactions_for_account(
        db_conn, saved_account.id, date_from=date(2025, 3, 1), date_to=date(2025, 9, 1)
    )
    assert len(result) == 1
    assert result[0].booking_date == date(2025, 6, 1)


def test_get_transaction_by_entry_ref(db_conn, saved_account):
    insert_transaction(db_conn, make_transaction(saved_account.id, entry_reference="find-me"))
    result = get_transaction_by_entry_ref(db_conn, saved_account.id, "find-me")
    assert result is not None
    assert result.entry_reference == "find-me"


def test_get_transaction_by_entry_ref_wrong_account(db_conn, saved_session, saved_account):
    other = upsert_account(
        db_conn,
        Account(session_id=saved_session.id, account_uid="other-acc", aspsp_name="Monzo", currency="GBP"),
    )
    insert_transaction(db_conn, make_transaction(saved_account.id, entry_reference="ref-x"))
    result = get_transaction_by_entry_ref(db_conn, other.id, "ref-x")
    assert result is None


def test_update_transaction_status(db_conn, saved_account):
    tx = insert_transaction(
        db_conn, make_transaction(saved_account.id, status=TransactionStatus.PENDING)
    )
    update_transaction_status(db_conn, tx.id, TransactionStatus.BOOKED)
    result = get_transactions_for_account(db_conn, saved_account.id)
    assert result[0].status == TransactionStatus.BOOKED


@pytest.mark.parametrize("status", list(TransactionStatus))
def test_all_statuses_round_trip(db_conn, saved_account, status):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id, status=status))
    result = get_transactions_for_account(db_conn, saved_account.id)
    assert result[0].status == status


def test_transactions_with_null_booking_date_included_in_range_query(db_conn, saved_account):
    # Pending transactions may have no booking_date — they should still appear
    insert_transaction(
        db_conn,
        make_transaction(saved_account.id, booking_date=None, status=TransactionStatus.PENDING),
    )
    result = get_transactions_for_account(
        db_conn, saved_account.id, date_from=date(2025, 1, 1), date_to=date(2025, 12, 31)
    )
    assert len(result) == 1
