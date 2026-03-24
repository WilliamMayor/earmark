"""Tests for sync/dedup.py — transaction matching and sync change computation."""

from datetime import date
from decimal import Decimal

import pytest

from sync.dedup import SyncChanges, compute_sync_changes
from sync.models import Transaction, TransactionStatus
from tests.conftest import make_transaction

ACCOUNT_ID = 1


# ---------------------------------------------------------------------------
# Entry reference matching
# ---------------------------------------------------------------------------

def test_entry_ref_match_produces_no_insert(saved_account):
    local = [make_transaction(ACCOUNT_ID, entry_reference="ref-1", id=10)]
    api = [make_transaction(ACCOUNT_ID, entry_reference="ref-1")]
    changes = compute_sync_changes(local, api, None, None)
    assert changes.to_insert == []
    assert changes.to_flag_unconfirmed == []


def test_entry_ref_no_local_match_inserts(saved_account):
    local = []
    api = [make_transaction(ACCOUNT_ID, entry_reference="ref-new")]
    changes = compute_sync_changes(local, api, None, None)
    assert len(changes.to_insert) == 1


def test_entry_ref_present_on_api_but_different_ref_inserts(saved_account):
    local = [make_transaction(ACCOUNT_ID, entry_reference="ref-A", id=1)]
    api = [make_transaction(ACCOUNT_ID, entry_reference="ref-B")]
    changes = compute_sync_changes(local, api, None, None)
    assert len(changes.to_insert) == 1


# ---------------------------------------------------------------------------
# Fuzzy matching (no entry_reference)
# ---------------------------------------------------------------------------

def test_fuzzy_match_identical_transaction_no_insert():
    local = [make_transaction(ACCOUNT_ID, id=1)]
    api = [make_transaction(ACCOUNT_ID)]
    changes = compute_sync_changes(local, api, None, None)
    assert changes.to_insert == []
    assert changes.to_flag_unconfirmed == []


@pytest.mark.parametrize("field, local_val, api_val", [
    ("booking_date", date(2025, 6, 1), date(2025, 6, 2)),
    ("amount", Decimal("10.00"), Decimal("11.00")),
    ("credit_debit_indicator", "DBIT", "CRDT"),
    ("payee", "Tesco", "Sainsbury's"),
])
def test_fuzzy_mismatch_inserts_new(field, local_val, api_val):
    local = [make_transaction(ACCOUNT_ID, **{field: local_val}, id=1)]
    api = [make_transaction(ACCOUNT_ID, **{field: api_val})]
    changes = compute_sync_changes(local, api, None, None)
    assert len(changes.to_insert) == 1


# ---------------------------------------------------------------------------
# Duplicate transaction handling (API reports a genuine duplicate)
# ---------------------------------------------------------------------------

def test_api_duplicate_with_one_local_inserts_one():
    """API returns 2 identical txs; we have 1 locally → insert 1 more."""
    local = [make_transaction(ACCOUNT_ID, id=1)]
    api = [make_transaction(ACCOUNT_ID), make_transaction(ACCOUNT_ID)]
    changes = compute_sync_changes(local, api, None, None)
    assert len(changes.to_insert) == 1


def test_api_duplicate_matches_both_locals():
    """API returns 2 identical txs; we have 2 locally → insert 0."""
    local = [make_transaction(ACCOUNT_ID, id=1), make_transaction(ACCOUNT_ID, id=2)]
    api = [make_transaction(ACCOUNT_ID), make_transaction(ACCOUNT_ID)]
    changes = compute_sync_changes(local, api, None, None)
    assert changes.to_insert == []
    assert changes.to_flag_unconfirmed == []


def test_local_duplicate_not_in_api_flags_one_as_unconfirmed():
    """We have 2 identical txs locally; API returns 1 → 1 flagged unconfirmed."""
    local = [make_transaction(ACCOUNT_ID, id=1), make_transaction(ACCOUNT_ID, id=2)]
    api = [make_transaction(ACCOUNT_ID)]
    changes = compute_sync_changes(local, api, None, None)
    assert len(changes.to_flag_unconfirmed) == 1


# ---------------------------------------------------------------------------
# Unconfirmed flagging
# ---------------------------------------------------------------------------

def test_local_booked_not_in_api_flagged_unconfirmed():
    local = [make_transaction(ACCOUNT_ID, id=1, status=TransactionStatus.BOOKED)]
    api = []
    changes = compute_sync_changes(local, api, None, None)
    assert len(changes.to_flag_unconfirmed) == 1
    assert changes.to_flag_unconfirmed[0].id == 1


def test_local_pending_not_in_api_flagged_unconfirmed():
    local = [make_transaction(ACCOUNT_ID, id=1, status=TransactionStatus.PENDING)]
    api = []
    changes = compute_sync_changes(local, api, None, None)
    assert len(changes.to_flag_unconfirmed) == 1


def test_opening_balance_never_flagged_unconfirmed():
    local = [make_transaction(ACCOUNT_ID, id=1, status=TransactionStatus.OPENING_BALANCE)]
    api = []
    changes = compute_sync_changes(local, api, None, None)
    assert changes.to_flag_unconfirmed == []


def test_already_unconfirmed_not_re_flagged():
    """Locally-unconfirmed transactions are left alone (not duplicated in output)."""
    local = [make_transaction(ACCOUNT_ID, id=1, status=TransactionStatus.UNCONFIRMED)]
    api = []
    changes = compute_sync_changes(local, api, None, None)
    assert changes.to_flag_unconfirmed == []


# ---------------------------------------------------------------------------
# Status updates (pending → booked)
# ---------------------------------------------------------------------------

def test_pending_to_booked_via_entry_ref_produces_update():
    local = [
        make_transaction(ACCOUNT_ID, id=1, entry_reference="ref-1", status=TransactionStatus.PENDING)
    ]
    api = [
        make_transaction(ACCOUNT_ID, entry_reference="ref-1", status=TransactionStatus.BOOKED)
    ]
    changes = compute_sync_changes(local, api, None, None)
    assert len(changes.to_update) == 1
    local_tx, api_tx = changes.to_update[0]
    assert local_tx.id == 1
    assert api_tx.status == TransactionStatus.BOOKED


def test_pending_to_booked_via_pending_resolution():
    """Pending tx with no entry_ref matched to booked API tx by amount/indicator/payee."""
    local = [
        make_transaction(
            ACCOUNT_ID,
            id=1,
            status=TransactionStatus.PENDING,
            booking_date=None,  # pending may lack booking_date
            entry_reference=None,
        )
    ]
    api = [
        make_transaction(
            ACCOUNT_ID,
            status=TransactionStatus.BOOKED,
            booking_date=date(2025, 6, 1),
            entry_reference=None,
        )
    ]
    changes = compute_sync_changes(local, api, None, None)
    assert len(changes.to_update) == 1
    assert changes.to_insert == []


def test_no_update_when_status_unchanged():
    local = [make_transaction(ACCOUNT_ID, id=1, status=TransactionStatus.BOOKED)]
    api = [make_transaction(ACCOUNT_ID, status=TransactionStatus.BOOKED)]
    changes = compute_sync_changes(local, api, None, None)
    assert changes.to_update == []


def test_opening_balance_status_not_updated_by_api():
    """An opening_balance transaction should never be touched by an API match."""
    local = [make_transaction(ACCOUNT_ID, id=1, status=TransactionStatus.OPENING_BALANCE)]
    api = [make_transaction(ACCOUNT_ID, status=TransactionStatus.BOOKED)]
    changes = compute_sync_changes(local, api, None, None)
    assert changes.to_update == []
    # Opening balance was excluded from matchable set; API tx is treated as new
    assert len(changes.to_insert) == 1


# ---------------------------------------------------------------------------
# Date range scoping
# ---------------------------------------------------------------------------

def test_local_tx_outside_sync_range_not_flagged():
    """Transactions before date_from are outside scope and must not be flagged."""
    local = [
        make_transaction(ACCOUNT_ID, id=1, booking_date=date(2025, 1, 1)),  # outside range
        make_transaction(ACCOUNT_ID, id=2, booking_date=date(2025, 6, 1)),  # inside range
    ]
    api = []
    changes = compute_sync_changes(
        local, api, sync_date_from=date(2025, 4, 1), sync_date_to=date(2025, 12, 31)
    )
    flagged_ids = {t.id for t in changes.to_flag_unconfirmed}
    assert 1 not in flagged_ids
    assert 2 in flagged_ids


def test_no_date_range_matches_all_local():
    local = [
        make_transaction(ACCOUNT_ID, id=1, booking_date=date(2024, 1, 1)),
        make_transaction(ACCOUNT_ID, id=2, booking_date=date(2025, 6, 1)),
    ]
    api = []
    changes = compute_sync_changes(local, api, sync_date_from=None, sync_date_to=None)
    assert len(changes.to_flag_unconfirmed) == 2
