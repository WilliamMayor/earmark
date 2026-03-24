"""
Thin wrappers around the Enable Banking SDK to isolate our code from the
third-party API surface and make it straightforward to mock in tests.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from .models import Transaction, TransactionStatus


def map_api_transaction(api_tx, account_id: int) -> Transaction:
    """Convert an SDK Transaction object to our internal Transaction model."""
    status_map = {
        "BOOK": TransactionStatus.BOOKED,
        "PDNG": TransactionStatus.PENDING,
    }
    status = status_map.get(api_tx.status, TransactionStatus.BOOKED)

    # Payee is the creditor for debits (money leaving) and debtor for credits
    payee: Optional[str] = None
    if api_tx.credit_debit_indicator == "DBIT" and api_tx.creditor:
        payee = api_tx.creditor.name
    elif api_tx.credit_debit_indicator == "CRDT" and api_tx.debtor:
        payee = api_tx.debtor.name

    booking_date = date.fromisoformat(api_tx.booking_date) if api_tx.booking_date else None
    value_date = date.fromisoformat(api_tx.value_date) if api_tx.value_date else None

    # Store the raw API response so no data is lost
    raw_data = api_tx.model_dump() if hasattr(api_tx, "model_dump") else None

    return Transaction(
        account_id=account_id,
        entry_reference=api_tx.entry_reference,
        booking_date=booking_date,
        value_date=value_date,
        amount=Decimal(str(api_tx.transaction_amount.amount)),
        currency=api_tx.transaction_amount.currency,
        credit_debit_indicator=api_tx.credit_debit_indicator,
        status=status,
        payee=payee,
        remittance_information=api_tx.remittance_information,
        note=getattr(api_tx, "note", None),
        raw_data=raw_data,
    )


def fetch_transactions(
    service,  # EnableBankingService
    account_uid: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list:
    """
    Fetch all transactions for an account. Pagination is handled automatically
    by the SDK's get_account_transactions method.
    """
    kwargs: dict = {}
    if date_from:
        kwargs["date_from"] = datetime.combine(date_from, datetime.min.time())
    if date_to:
        kwargs["date_to"] = datetime.combine(date_to, datetime.min.time())
    return service.get_account_transactions(account_uid=account_uid, **kwargs)
