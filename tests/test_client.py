"""Tests for sync/client.py — Lunchflow API mapping and HTTP calls."""

from datetime import date
from decimal import Decimal

import httpx
import pytest

from sync.client import LunchflowClient, _map_account, _map_transaction
from sync.models import Account, TransactionStatus


# ---------------------------------------------------------------------------
# _map_account
# ---------------------------------------------------------------------------

def test_map_account_basic():
    data = {"id": 42, "name": "Current", "institution_name": "Monzo", "currency": "GBP", "status": "ACTIVE"}
    account = _map_account(data)
    assert account.lunchflow_id == 42
    assert account.name == "Current"
    assert account.institution_name == "Monzo"
    assert account.currency == "GBP"


# ---------------------------------------------------------------------------
# _map_transaction
# ---------------------------------------------------------------------------

def test_map_transaction_debit():
    data = {
        "id": "tx-1", "accountId": 42, "amount": -25.50, "currency": "GBP",
        "date": "2025-06-01", "merchant": "Tesco", "description": "groceries", "isPending": False,
    }
    tx = _map_transaction(data)
    assert tx is not None
    assert tx.lunchflow_id == "tx-1"
    assert tx.credit_debit_indicator == "DBIT"
    assert tx.amount == Decimal("25.50")
    assert tx.status == TransactionStatus.BOOKED
    assert tx.merchant == "Tesco"
    assert tx.date == date(2025, 6, 1)


def test_map_transaction_credit():
    data = {
        "id": "tx-2", "accountId": 42, "amount": 1000.00, "currency": "GBP",
        "date": "2025-06-15", "merchant": "Employer", "description": "salary", "isPending": False,
    }
    tx = _map_transaction(data)
    assert tx is not None
    assert tx.credit_debit_indicator == "CRDT"
    assert tx.amount == Decimal("1000.00")


def test_map_transaction_pending():
    data = {
        "id": "tx-3", "accountId": 42, "amount": -5.00, "currency": "GBP",
        "date": "2025-06-10", "merchant": "Coffee", "description": None, "isPending": True,
    }
    tx = _map_transaction(data)
    assert tx is not None
    assert tx.status == TransactionStatus.PENDING


def test_map_transaction_null_id_returns_none():
    data = {
        "id": None, "accountId": 42, "amount": -5.00, "currency": "GBP",
        "date": "2025-06-10", "merchant": "Unknown", "description": None, "isPending": False,
    }
    result = _map_transaction(data)
    assert result is None


# ---------------------------------------------------------------------------
# LunchflowClient (mocked HTTP via httpx.MockTransport)
# ---------------------------------------------------------------------------

def _make_client(responses: dict) -> LunchflowClient:
    """Build a LunchflowClient whose HTTP calls return pre-canned responses."""
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        for pattern, response_data in responses.items():
            if pattern in path:
                return httpx.Response(200, json=response_data)
        return httpx.Response(404, json={"error": "not found"})

    transport = httpx.MockTransport(handler)
    client = LunchflowClient.__new__(LunchflowClient)
    client._client = httpx.Client(transport=transport, base_url="https://lunchflow.app/api/v1")
    return client


def test_list_accounts_returns_accounts():
    client = _make_client({
        "/accounts": {"accounts": [
            {"id": 1, "name": "Current", "institution_name": "Monzo", "currency": "GBP", "status": "ACTIVE"},
        ], "total": 1}
    })
    accounts = client.list_accounts()
    assert len(accounts) == 1
    assert isinstance(accounts[0], Account)
    assert accounts[0].lunchflow_id == 1


def test_get_transactions_maps_correctly():
    client = _make_client({
        "/transactions": {"transactions": [
            {"id": "t1", "accountId": 1, "amount": -10.0, "currency": "GBP",
             "date": "2025-06-01", "merchant": "Shop", "description": "stuff", "isPending": False},
        ], "total": 1}
    })
    txs = client.get_transactions(1)
    assert len(txs) == 1
    assert txs[0].credit_debit_indicator == "DBIT"
    assert txs[0].amount == Decimal("10.00")


def test_get_transactions_skips_null_id():
    client = _make_client({
        "/transactions": {"transactions": [
            {"id": None, "accountId": 1, "amount": -10.0, "currency": "GBP",
             "date": "2025-06-01", "merchant": "Shop", "description": None, "isPending": False},
        ], "total": 1}
    })
    txs = client.get_transactions(1)
    assert txs == []


def test_get_balance_returns_decimal():
    client = _make_client({
        "/balance": {"balance": {"amount": 1234.56, "currency": "GBP"}}
    })
    balance = client.get_balance(1)
    assert balance == Decimal("1234.56")
