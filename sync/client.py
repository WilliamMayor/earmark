"""
Lunchflow API client.

All bank connections are managed in the Lunchflow dashboard.
This module handles HTTP communication and maps API responses to internal models.
"""

from __future__ import annotations

import warnings
from datetime import date
from decimal import Decimal
from typing import Optional

import httpx

from .models import Account, Transaction, TransactionStatus

_BASE_URL = "https://lunchflow.app/api/v1"


class LunchflowClient:
    def __init__(self, api_key: str):
        self._client = httpx.Client(
            base_url=_BASE_URL,
            headers={"x-api-key": api_key},
        )

    def list_accounts(self) -> list[Account]:
        response = self._client.get("/accounts")
        response.raise_for_status()
        return [_map_account(a) for a in response.json()["accounts"]]

    def get_transactions(self, account_id: int) -> list[Transaction]:
        response = self._client.get(
            f"/accounts/{account_id}/transactions",
            params={"include_pending": "true"},
        )
        response.raise_for_status()
        result = []
        for tx_data in response.json()["transactions"]:
            tx = _map_transaction(tx_data)
            if tx is not None:
                result.append(tx)
        return result

    def get_balance(self, account_id: int) -> Decimal:
        response = self._client.get(f"/accounts/{account_id}/balance")
        response.raise_for_status()
        return Decimal(str(response.json()["balance"]["amount"]))

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> LunchflowClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def _map_account(data: dict) -> Account:
    return Account(
        lunchflow_id=data["id"],
        name=data.get("name"),
        institution_name=data.get("institution_name"),
        currency=data["currency"],
    )


def _map_transaction(data: dict) -> Optional[Transaction]:
    lunchflow_id = data.get("id")
    if lunchflow_id is None:
        warnings.warn(f"Skipping transaction with null id: {data}")
        return None

    raw_amount = Decimal(str(data["amount"]))
    if raw_amount < 0:
        credit_debit_indicator = "DBIT"
        amount = -raw_amount
    else:
        credit_debit_indicator = "CRDT"
        amount = raw_amount

    tx_date = date.fromisoformat(data["date"]) if data.get("date") else None

    return Transaction(
        account_id=data["accountId"],
        lunchflow_id=lunchflow_id,
        amount=amount,
        currency=data["currency"],
        credit_debit_indicator=credit_debit_indicator,
        status=TransactionStatus.PENDING if data.get("isPending") else TransactionStatus.BOOKED,
        date=tx_date,
        merchant=data.get("merchant"),
        description=data.get("description"),
    )
