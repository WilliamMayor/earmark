from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional


class TransactionStatus(str, Enum):
    BOOKED = "booked"
    PENDING = "pending"
    OPENING_BALANCE = "opening_balance"


@dataclass
class Account:
    lunchflow_id: int
    currency: str
    name: Optional[str] = None
    institution_name: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    id: Optional[int] = None


@dataclass
class Transaction:
    account_id: int
    amount: Decimal
    currency: str
    credit_debit_indicator: str  # "CRDT" | "DBIT"
    status: TransactionStatus
    lunchflow_id: Optional[str] = None
    date: Optional[date] = None
    merchant: Optional[str] = None
    description: Optional[str] = None
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    id: Optional[int] = None
