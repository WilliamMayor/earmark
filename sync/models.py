from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional


class TransactionStatus(str, Enum):
    BOOKED = "booked"
    PENDING = "pending"
    UNCONFIRMED = "unconfirmed"
    OPENING_BALANCE = "opening_balance"


class PsuType(str, Enum):
    PERSONAL = "personal"
    BUSINESS = "business"


@dataclass
class Session:
    session_id: str
    aspsp_name: str
    psu_type: PsuType
    valid_until: datetime
    created_at: datetime
    is_active: bool
    id: Optional[int] = None


@dataclass
class Account:
    session_id: int
    account_uid: str
    aspsp_name: str
    currency: str
    name: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    last_synced_booking_date: Optional[date] = None
    id: Optional[int] = None


@dataclass
class Transaction:
    account_id: int
    amount: Decimal
    currency: str
    credit_debit_indicator: str  # "CRDT" | "DBIT"
    status: TransactionStatus
    entry_reference: Optional[str] = None
    booking_date: Optional[date] = None
    value_date: Optional[date] = None
    payee: Optional[str] = None
    remittance_information: Optional[list[str]] = None
    note: Optional[str] = None
    raw_data: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    id: Optional[int] = None
