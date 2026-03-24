"""
Transaction deduplication logic.

Matching strategy (in priority order):
  1. entry_reference — exact match when present on the API transaction
  2. Fuzzy — (booking_date, amount, credit_debit_indicator, payee) exact match
  3. Pending resolution — for a booked API transaction, try to match a local
     PENDING transaction by (amount, credit_debit_indicator, payee) ignoring
     booking_date, which may not have been set when the transaction was pending

Greedy consumption: each local transaction can only be matched once, so if the
API returns two identical transactions and only one exists locally, the second
API transaction will be inserted as new.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional

from .models import Transaction, TransactionStatus


@dataclass
class SyncChanges:
    to_insert: list[Transaction]
    # Pairs of (local_tx, api_tx) where local_tx.status needs updating
    to_update: list[tuple[Transaction, Transaction]]
    # Local booked/pending transactions within the sync window that the API did not return
    to_flag_unconfirmed: list[Transaction]


def _fuzzy_key(tx: Transaction) -> tuple:
    return (tx.booking_date, tx.amount, tx.credit_debit_indicator, tx.payee)


def _pending_key(tx: Transaction) -> tuple:
    """Looser key for matching pending→booked transitions (ignores booking_date)."""
    return (tx.amount, tx.credit_debit_indicator, tx.payee)


def _needs_status_update(local: Transaction, incoming_status: TransactionStatus) -> bool:
    if local.status in (TransactionStatus.OPENING_BALANCE, TransactionStatus.UNCONFIRMED):
        return False
    return local.status != incoming_status


def _find_and_consume(
    api_tx: Transaction,
    available: list[Transaction],
) -> tuple[Optional[Transaction], list[Transaction]]:
    """
    Find the best matching local transaction for an API transaction and remove it
    from the available pool. Returns (match, remaining_available).
    """
    # 1. Entry reference match (most reliable)
    if api_tx.entry_reference is not None:
        for i, local in enumerate(available):
            if local.entry_reference == api_tx.entry_reference:
                return local, available[:i] + available[i + 1:]
        # entry_reference present but nothing matched → genuinely new transaction
        return None, available

    # 2. Exact fuzzy match (booked transactions with booking_date)
    key = _fuzzy_key(api_tx)
    for i, local in enumerate(available):
        if _fuzzy_key(local) == key:
            return local, available[:i] + available[i + 1:]

    # 3. Pending resolution: booked API tx may correspond to a local pending tx
    #    where booking_date was not yet set
    if api_tx.status == TransactionStatus.BOOKED:
        pending_key = _pending_key(api_tx)
        for i, local in enumerate(available):
            if local.status == TransactionStatus.PENDING and _pending_key(local) == pending_key:
                return local, available[:i] + available[i + 1:]

    return None, available


def compute_sync_changes(
    local_transactions: list[Transaction],
    api_transactions: list[Transaction],
    sync_date_from: Optional[date],
    sync_date_to: Optional[date],
) -> SyncChanges:
    """
    Determine what needs to be inserted, updated, or flagged based on comparing
    local state against what the API returned for a given date window.

    Only local transactions within the synced date range are candidates for being
    flagged as unconfirmed — transactions outside the range are not touched.
    Transactions with status OPENING_BALANCE are never flagged.
    """
    # Partition local transactions into those within the sync window (matchable)
    # and those outside it (untouched).
    matchable = [
        t for t in local_transactions
        if t.status != TransactionStatus.OPENING_BALANCE
        and (sync_date_from is None or t.booking_date is None or t.booking_date >= sync_date_from)
        and (sync_date_to is None or t.booking_date is None or t.booking_date <= sync_date_to)
    ]

    to_insert: list[Transaction] = []
    to_update: list[tuple[Transaction, Transaction]] = []
    available = list(matchable)

    for api_tx in api_transactions:
        match, available = _find_and_consume(api_tx, available)
        if match is None:
            to_insert.append(api_tx)
        elif _needs_status_update(match, api_tx.status):
            to_update.append((match, api_tx))

    # Any matchable local transactions not consumed by the API are unconfirmed
    to_flag_unconfirmed = [
        t for t in available
        if t.status in (TransactionStatus.BOOKED, TransactionStatus.PENDING)
    ]

    return SyncChanges(
        to_insert=to_insert,
        to_update=to_update,
        to_flag_unconfirmed=to_flag_unconfirmed,
    )
