"""
Sync orchestration: fetches transactions and balance from Lunchflow,
upserts transactions by lunchflow_id, and inserts an opening balance
adjustor if the fetched history doesn't account for the full balance.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx

from .db import (
    get_all_accounts,
    has_opening_balance,
    insert_transaction,
    update_account_sync_info,
    upsert_transaction,
    ensure_default_split,
    ensure_round_up_split,
)
from .models import Account, Transaction, TransactionStatus


def sync_account(conn: sqlite3.Connection, client: object, account: Account) -> dict:
    """
    Sync transactions for a single account. Returns a summary dict.
    Raises httpx.HTTPError on API errors — the caller is responsible for handling these.
    """
    api_transactions: list[Transaction] = client.get_transactions(account.lunchflow_id)  # type: ignore[attr-defined]
    current_balance: Decimal = client.get_balance(account.lunchflow_id)  # type: ignore[attr-defined]

    # Detect missing history: compare signed sum of fetched transactions against current balance.
    if api_transactions:
        expected_balance = sum(
            (tx.amount if tx.credit_debit_indicator == "CRDT" else -tx.amount)
            for tx in api_transactions
        )
        if expected_balance != current_balance and not has_opening_balance(conn, account.id):  # type: ignore[arg-type]
            earliest_date = min(
                (tx.date for tx in api_transactions if tx.date),
                default=None,
            )
            if earliest_date is not None:
                adjustor_signed = current_balance - expected_balance
                if adjustor_signed < 0:
                    cdi = "DBIT"
                    adj_amount = -adjustor_signed
                else:
                    cdi = "CRDT"
                    adj_amount = adjustor_signed

                saved_adjustor = insert_transaction(
                    conn,
                    Transaction(
                        account_id=account.id,  # type: ignore[arg-type]
                        amount=adj_amount,
                        currency=account.currency,
                        credit_debit_indicator=cdi,
                        status=TransactionStatus.OPENING_BALANCE,
                        date=earliest_date - timedelta(days=1),
                        merchant="Balance correction",
                        description="Your transaction history only goes back so far. This entry makes the opening balance match your actual account balance — allocate it to cover any spending that happened before your history begins.",
                    ),
                )
                assert saved_adjustor.id is not None
                ensure_default_split(conn, saved_adjustor.id)

    # Upsert all transactions, binding to our internal account id.
    for tx in api_transactions:
        tx.account_id = account.id  # type: ignore[assignment]
        saved = upsert_transaction(conn, tx)
        assert saved.id is not None
        ensure_default_split(conn, saved.id)  # type: ignore[arg-type]
        ensure_round_up_split(conn, saved.id)  # type: ignore[arg-type]

    now = datetime.now(timezone.utc)
    update_account_sync_info(conn, account.id, now)  # type: ignore[arg-type]

    return {
        "lunchflow_id": account.lunchflow_id,
        "institution_name": account.institution_name,
        "upserted": len(api_transactions),
    }


def sync_all(conn: sqlite3.Connection, client: object) -> list[dict]:
    """Sync every registered account. Returns a list of per-account result dicts."""
    accounts = get_all_accounts(conn)
    if not accounts:
        print("No accounts found. Connect banks in the Lunchflow dashboard.")
        return []

    results = []
    for account in accounts:
        label = f"{account.institution_name or 'Unknown'} / {account.name or account.lunchflow_id}"
        print(f"Syncing {label}...")
        try:
            result = sync_account(conn, client, account)
            results.append(result)
            print(f"  {result['upserted']} transaction(s) synced")
        except httpx.HTTPError as e:
            print(f"  Failed: {e}")
            results.append({
                "lunchflow_id": account.lunchflow_id,
                "institution_name": account.institution_name,
                "error": str(e),
            })

    return results
