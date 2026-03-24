"""Tests for sync/sync.py — sync orchestration."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

from sync.db import get_all_accounts, get_transactions_for_account, insert_transaction
from sync.models import Transaction, TransactionStatus
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
    # One DBIT of £10; net signed = -10; balance = -10 → no gap
    tx = _make_api_tx(saved_account.id, date(2025, 6, 1), amount=Decimal("10.00"), cdi="DBIT")
    client = _make_client([tx], balance=Decimal("-10.00"))

    sync_account(db_conn, client, saved_account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    opening = [t for t in txns if t.status == TransactionStatus.OPENING_BALANCE]
    assert len(opening) == 0


def test_adjustor_inserted_when_balance_does_not_match(db_conn, saved_account):
    # One DBIT of £10; net = -10; but balance = £90 → adjustor = 90 - (-10) = 100 CRDT
    tx = _make_api_tx(saved_account.id, date(2025, 6, 1), amount=Decimal("10.00"), cdi="DBIT")
    client = _make_client([tx], balance=Decimal("90.00"))

    sync_account(db_conn, client, saved_account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    opening = [t for t in txns if t.status == TransactionStatus.OPENING_BALANCE]
    assert len(opening) == 1
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
