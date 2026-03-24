"""Tests for sync/sync.py — sync orchestration and edge cases."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from sync.db import get_transactions_for_account, insert_transaction, update_account_sync_info
from sync.models import Account, TransactionStatus
from sync.sync import GAP_THRESHOLD_DAYS, SYNC_OVERLAP_DAYS, sync_account
from tests.conftest import make_transaction


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_api_tx(
    booking_date: date,
    amount: float = 10.0,
    credit_debit_indicator: str = "DBIT",
    payee: str = "Tesco",
    status: str = "BOOK",
    entry_reference: str | None = None,
):
    """Build a mock SDK Transaction object."""
    tx = MagicMock()
    tx.booking_date = booking_date.isoformat()
    tx.value_date = None
    tx.entry_reference = entry_reference
    tx.status = status
    tx.credit_debit_indicator = credit_debit_indicator
    tx.transaction_amount.amount = amount
    tx.transaction_amount.currency = "GBP"
    # SimpleNamespace used because MagicMock(name=...) sets the mock's display
    # name, not a .name attribute — SimpleNamespace gives a plain .name attribute.
    tx.creditor = SimpleNamespace(name=payee) if credit_debit_indicator == "DBIT" else None
    tx.debtor = SimpleNamespace(name=payee) if credit_debit_indicator == "CRDT" else None
    tx.remittance_information = None
    tx.note = None
    tx.model_dump.return_value = {"balance_after_transaction": None}
    return tx


def _make_service(*api_txs):
    """Build a mock service that returns the given API transactions."""
    service = MagicMock()
    service.get_account_transactions.return_value = list(api_txs)
    return service


def _mark_synced(db_conn, account: Account, last_date: date) -> Account:
    """Mark an account as having been previously synced."""
    update_account_sync_info(db_conn, account.id, datetime.now(timezone.utc), last_date)
    from sync.db import get_all_accounts
    return next(a for a in get_all_accounts(db_conn) if a.id == account.id)


# ---------------------------------------------------------------------------
# First sync
# ---------------------------------------------------------------------------

def test_first_sync_inserts_opening_balance(db_conn, saved_account):
    api_tx = _make_api_tx(date(2025, 6, 1))
    service = _make_service(api_tx)

    sync_account(db_conn, service, saved_account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    opening = [t for t in txns if t.status == TransactionStatus.OPENING_BALANCE]
    assert len(opening) == 1


def test_first_sync_inserts_transactions(db_conn, saved_account):
    txs = [_make_api_tx(date(2025, 6, d)) for d in range(1, 4)]
    service = _make_service(*txs)

    result = sync_account(db_conn, service, saved_account)

    assert result["inserted"] == 3
    assert result["is_first_sync"] is True


def test_first_sync_no_date_from_passed_to_api(db_conn, saved_account):
    service = _make_service()
    sync_account(db_conn, service, saved_account)
    call_kwargs = service.get_account_transactions.call_args.kwargs
    assert "date_from" not in call_kwargs


def test_first_sync_with_no_api_results_inserts_nothing(db_conn, saved_account):
    service = _make_service()
    result = sync_account(db_conn, service, saved_account)
    assert result["inserted"] == 0
    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert txns == []


# ---------------------------------------------------------------------------
# Incremental sync
# ---------------------------------------------------------------------------

def test_incremental_sync_fetches_from_overlap_window(db_conn, saved_account):
    last_date = date(2025, 6, 10)
    account = _mark_synced(db_conn, saved_account, last_date)
    service = _make_service()

    sync_account(db_conn, service, account)

    call_kwargs = service.get_account_transactions.call_args.kwargs
    expected_from = datetime.combine(
        last_date - timedelta(days=SYNC_OVERLAP_DAYS), datetime.min.time()
    )
    assert call_kwargs["date_from"] == expected_from


def test_incremental_sync_deduplicates_overlap(db_conn, saved_account):
    last_date = date(2025, 6, 10)
    account = _mark_synced(db_conn, saved_account, last_date)

    # Pre-populate a transaction that will be in the overlap window
    existing = insert_transaction(
        db_conn,
        make_transaction(saved_account.id, booking_date=date(2025, 6, 9), amount=Decimal("5.00")),
    )

    # API returns the same transaction again (overlap)
    api_tx = _make_api_tx(date(2025, 6, 9), amount=5.0)
    service = _make_service(api_tx)

    result = sync_account(db_conn, service, account)

    assert result["inserted"] == 0
    txns = get_transactions_for_account(db_conn, saved_account.id)
    regular = [t for t in txns if t.status != TransactionStatus.OPENING_BALANCE]
    assert len(regular) == 1


def test_incremental_sync_no_opening_balance_inserted(db_conn, saved_account):
    account = _mark_synced(db_conn, saved_account, date(2025, 6, 1))
    service = _make_service(_make_api_tx(date(2025, 6, 10)))

    sync_account(db_conn, service, account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert not any(t.status == TransactionStatus.OPENING_BALANCE for t in txns)


# ---------------------------------------------------------------------------
# Gap detection
# ---------------------------------------------------------------------------

def test_gap_inserts_opening_balance(db_conn, saved_account):
    """If API returns data starting far later than requested, a gap filler is inserted."""
    last_date = date(2025, 1, 1)
    account = _mark_synced(db_conn, saved_account, last_date)

    # API only has data from much later — simulating a 90-day history limit
    far_later = last_date + timedelta(days=GAP_THRESHOLD_DAYS + 30)
    service = _make_service(_make_api_tx(far_later))

    sync_account(db_conn, service, account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    gap_fillers = [t for t in txns if t.status == TransactionStatus.OPENING_BALANCE]
    assert len(gap_fillers) == 1
    assert "Gap" in gap_fillers[0].note


def test_no_gap_when_api_date_within_threshold(db_conn, saved_account):
    """If the API returns data close to date_from, no gap filler should be inserted."""
    last_date = date(2025, 6, 10)
    account = _mark_synced(db_conn, saved_account, last_date)

    # Earliest API tx is only 2 days after date_from (within GAP_THRESHOLD_DAYS)
    slightly_later = last_date - timedelta(days=SYNC_OVERLAP_DAYS) + timedelta(days=1)
    service = _make_service(_make_api_tx(slightly_later))

    sync_account(db_conn, service, account)

    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert not any(t.status == TransactionStatus.OPENING_BALANCE for t in txns)


# ---------------------------------------------------------------------------
# Local modifications (unconfirmed flagging)
# ---------------------------------------------------------------------------

def test_local_booked_tx_not_in_api_flagged_unconfirmed(db_conn, saved_account):
    last_date = date(2025, 6, 10)
    account = _mark_synced(db_conn, saved_account, last_date)

    # Local transaction in the sync window but not returned by API
    insert_transaction(
        db_conn,
        make_transaction(saved_account.id, booking_date=date(2025, 6, 12)),
    )

    service = _make_service()  # API returns nothing
    result = sync_account(db_conn, service, account)

    assert result["flagged_unconfirmed"] == 1
    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert any(t.status == TransactionStatus.UNCONFIRMED for t in txns)


def test_opening_balance_tx_not_flagged_unconfirmed(db_conn, saved_account):
    last_date = date(2025, 6, 1)
    account = _mark_synced(db_conn, saved_account, last_date)

    insert_transaction(
        db_conn,
        make_transaction(
            saved_account.id,
            booking_date=date(2025, 6, 5),
            status=TransactionStatus.OPENING_BALANCE,
        ),
    )

    service = _make_service()
    result = sync_account(db_conn, service, account)

    assert result["flagged_unconfirmed"] == 0
    txns = get_transactions_for_account(db_conn, saved_account.id)
    assert txns[0].status == TransactionStatus.OPENING_BALANCE


# ---------------------------------------------------------------------------
# Pending → booked resolution
# ---------------------------------------------------------------------------

def test_pending_tx_updated_to_booked_on_sync(db_conn, saved_account):
    last_date = date(2025, 6, 1)
    account = _mark_synced(db_conn, saved_account, last_date)

    pending = insert_transaction(
        db_conn,
        make_transaction(
            saved_account.id,
            booking_date=None,
            status=TransactionStatus.PENDING,
            entry_reference=None,
        ),
    )

    # API now returns it as booked
    api_tx = _make_api_tx(date(2025, 6, 5), status="BOOK")
    service = _make_service(api_tx)

    result = sync_account(db_conn, service, account)

    assert result["updated"] == 1
    txns = get_transactions_for_account(db_conn, saved_account.id)
    regular = [t for t in txns if t.id == pending.id]
    assert regular[0].status == TransactionStatus.BOOKED


# ---------------------------------------------------------------------------
# Sync metadata
# ---------------------------------------------------------------------------

def test_sync_updates_last_synced_booking_date(db_conn, saved_account):
    latest = date(2025, 6, 20)
    service = _make_service(
        _make_api_tx(date(2025, 6, 10)),
        _make_api_tx(latest),
    )

    sync_account(db_conn, service, saved_account)

    from sync.db import get_all_accounts
    account = next(a for a in get_all_accounts(db_conn) if a.id == saved_account.id)
    assert account.last_synced_booking_date == latest


def test_sync_result_summary_fields(db_conn, saved_account):
    service = _make_service(_make_api_tx(date(2025, 6, 1)))
    result = sync_account(db_conn, service, saved_account)

    assert "account_uid" in result
    assert "aspsp_name" in result
    assert "inserted" in result
    assert "updated" in result
    assert "flagged_unconfirmed" in result
    assert "is_first_sync" in result
