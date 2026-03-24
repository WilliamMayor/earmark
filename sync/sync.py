"""
Sync orchestration: fetches API transactions, applies deduplication, and
persists the results to the database.

Edge cases handled:
  - First sync (no previous data): insert opening_balance before earliest tx
  - Data gap (API history shorter than time since last sync): insert
    opening_balance gap-filler at the boundary
  - Duplicate transactions: handled by dedup.compute_sync_changes
  - Local modifications: unmatched booked/pending txs → flagged as 'unconfirmed'
  - Expired session/consent: EnableBankingException propagates to the caller
"""

import sqlite3
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from .client import fetch_transactions, map_api_transaction
from .db import (
    get_all_accounts,
    get_transactions_for_account,
    insert_transaction,
    update_account_sync_info,
    update_transaction_status,
)
from .dedup import compute_sync_changes
from .models import Account, Transaction, TransactionStatus

# Re-fetch this many days before the last known booking date to catch any
# pending transactions that have since settled.
SYNC_OVERLAP_DAYS = 2

# If the earliest transaction returned by the API is more than this many days
# later than date_from, we assume the API cannot provide history for that period.
# 30 days is chosen to avoid false positives on accounts with occasional inactivity
# while still catching cases where the API's history window has been exceeded.
GAP_THRESHOLD_DAYS = 30


def _earliest_booking_date(transactions: list[Transaction]) -> Optional[date]:
    dates = [tx.booking_date for tx in transactions if tx.booking_date]
    return min(dates) if dates else None


def _latest_booking_date(transactions: list[Transaction]) -> Optional[date]:
    dates = [tx.booking_date for tx in transactions if tx.booking_date]
    return max(dates) if dates else None


def _compute_opening_balance_amount(transactions: list[Transaction]) -> Optional[Decimal]:
    """
    Derive the account balance immediately before the first transaction using
    the balance_after_transaction field from raw API data, when available.

    Returns None if the data is not available — the opening_balance transaction
    will be created with amount=0 and a note to set it manually.
    """
    if not transactions:
        return None

    earliest = min(
        (tx for tx in transactions if tx.booking_date),
        key=lambda t: t.booking_date,
        default=None,
    )
    if earliest is None or earliest.raw_data is None:
        return None

    bat = earliest.raw_data.get("balance_after_transaction")
    if bat is None:
        return None

    amount_value = bat.get("amount")
    if amount_value is None:
        return None

    balance_after = Decimal(str(amount_value))
    signed = (
        earliest.amount if earliest.credit_debit_indicator == "CRDT" else -earliest.amount
    )
    return balance_after - signed


def _insert_opening_balance(
    conn: sqlite3.Connection,
    account: Account,
    at_date: date,
    amount: Optional[Decimal],
    note: str,
) -> Transaction:
    if amount is None:
        note = f"{note} Opening amount unknown — set manually."
        amount = Decimal("0")

    return insert_transaction(
        conn,
        Transaction(
            account_id=account.id,
            amount=amount,
            currency=account.currency,
            credit_debit_indicator="CRDT",
            status=TransactionStatus.OPENING_BALANCE,
            booking_date=at_date,
            note=note,
        ),
    )


def sync_account(
    conn: sqlite3.Connection,
    service,
    account: Account,
) -> dict:
    """
    Sync transactions for a single account. Returns a summary dict.

    Raises EnableBankingException on API errors (including expired
    session/consent) — the caller is responsible for handling these.
    """
    now = datetime.now(timezone.utc)
    is_first_sync = account.last_synced_booking_date is None

    date_to = now.date()
    date_from: Optional[date] = (
        None
        if is_first_sync
        else account.last_synced_booking_date - timedelta(days=SYNC_OVERLAP_DAYS)
    )

    # --- Fetch from API ---
    api_raw = fetch_transactions(service, account.account_uid, date_from, date_to)
    api_transactions = [map_api_transaction(tx, account.id) for tx in api_raw]

    # --- Opening balance / gap detection ---
    earliest_api_date = _earliest_booking_date(api_transactions)

    if is_first_sync:
        if earliest_api_date:
            opening_amount = _compute_opening_balance_amount(api_transactions)
            _insert_opening_balance(
                conn,
                account,
                earliest_api_date,
                opening_amount,
                "Opening balance at start of imported transaction history.",
            )
    else:
        # A gap exists if the API returned data starting significantly later
        # than we asked — meaning it cannot provide history for that period.
        if earliest_api_date and date_from:
            gap_days = (earliest_api_date - date_from).days
            if gap_days > GAP_THRESHOLD_DAYS:
                opening_amount = _compute_opening_balance_amount(api_transactions)
                _insert_opening_balance(
                    conn,
                    account,
                    earliest_api_date,
                    opening_amount,
                    f"Gap in transaction history: data unavailable between "
                    f"{date_from} and {earliest_api_date}.",
                )

    # --- Deduplication ---
    local_transactions = get_transactions_for_account(conn, account.id, date_from, date_to)
    changes = compute_sync_changes(local_transactions, api_transactions, date_from, date_to)

    for tx in changes.to_insert:
        insert_transaction(conn, tx)

    for local_tx, api_tx in changes.to_update:
        update_transaction_status(conn, local_tx.id, api_tx.status)

    for tx in changes.to_flag_unconfirmed:
        update_transaction_status(conn, tx.id, TransactionStatus.UNCONFIRMED)

    # --- Update sync metadata ---
    latest = _latest_booking_date(api_transactions) or account.last_synced_booking_date
    update_account_sync_info(conn, account.id, now, latest)

    return {
        "account_uid": account.account_uid,
        "aspsp_name": account.aspsp_name,
        "is_first_sync": is_first_sync,
        "inserted": len(changes.to_insert),
        "updated": len(changes.to_update),
        "flagged_unconfirmed": len(changes.to_flag_unconfirmed),
    }


def sync_all(conn: sqlite3.Connection, service) -> list[dict]:
    """Sync every registered account. Returns a list of per-account result dicts."""
    accounts = get_all_accounts(conn)
    if not accounts:
        print("No accounts registered. Run --setup <BANK> to add one.")
        return []

    results = []
    for account in accounts:
        label = f"{account.aspsp_name} / {account.name or account.account_uid}"
        print(f"Syncing {label}...")
        try:
            result = sync_account(conn, service, account)
            results.append(result)
            print(
                f"  {result['inserted']} new, "
                f"{result['updated']} updated, "
                f"{result['flagged_unconfirmed']} flagged unconfirmed"
            )
        except Exception as e:
            print(f"  Failed: {e}")
            results.append({"account_uid": account.account_uid, "aspsp_name": account.aspsp_name, "error": str(e)})

    return results
