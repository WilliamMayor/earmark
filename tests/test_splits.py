"""Tests for split management functions in sync/db.py."""

from datetime import date
from decimal import Decimal
from sync.db import (
    ensure_default_split,
    ensure_round_up_split,
    get_or_create_round_up_envelope,
    insert_transaction,
    upsert_account,
)
from sync.models import Account
from tests.conftest import make_transaction

ROUND_UP_ENVELOPE_NAME = "Round Up"


def test_ensure_default_split_creates_split(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id, amount=Decimal("18.50")))
    ensure_default_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ?", (tx.id,)
    ).fetchone()
    assert row is not None
    assert row["amount"] == "18.50"
    assert row["is_default"] == 1


def test_ensure_default_split_is_idempotent(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id))
    ensure_default_split(db_conn, tx.id)
    ensure_default_split(db_conn, tx.id)
    ensure_default_split(db_conn, tx.id)

    rows = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ?", (tx.id,)
    ).fetchall()
    assert len(rows) == 1


def test_ensure_default_split_does_not_overwrite_existing(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(saved_account.id, amount=Decimal("20.00")))
    db_conn.execute(
        "INSERT INTO splits (transaction_id, amount, sort_order, is_default) VALUES (?, '10.00', 0, 1)",
        (tx.id,),
    )
    db_conn.execute(
        "INSERT INTO splits (transaction_id, amount, sort_order) VALUES (?, '10.00', 1)",
        (tx.id,),
    )
    db_conn.commit()

    ensure_default_split(db_conn, tx.id)

    rows = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ?", (tx.id,)
    ).fetchall()
    assert len(rows) == 2


def test_get_or_create_round_up_envelope_creates_envelope(db_conn, saved_account):
    envelope_id = get_or_create_round_up_envelope(db_conn, saved_account.id)
    row = db_conn.execute(
        "SELECT name FROM envelopes WHERE id = ?", (envelope_id,)
    ).fetchone()
    assert row["name"] == ROUND_UP_ENVELOPE_NAME


def test_get_or_create_round_up_envelope_is_idempotent(db_conn, saved_account):
    id1 = get_or_create_round_up_envelope(db_conn, saved_account.id)
    id2 = get_or_create_round_up_envelope(db_conn, saved_account.id)
    assert id1 == id2


def test_get_or_create_round_up_envelope_separate_per_account(db_conn, saved_account):
    second = upsert_account(db_conn, Account(lunchflow_id=9999, currency="GBP", name="Second"))
    id1 = get_or_create_round_up_envelope(db_conn, saved_account.id)
    id2 = get_or_create_round_up_envelope(db_conn, second.id)
    assert id1 != id2


def _enable_round_up(db_conn, account_id, since="2025-01-01"):
    db_conn.execute(
        "UPDATE accounts SET round_up_since = ? WHERE id = ?", (since, account_id)
    )
    db_conn.commit()


def test_ensure_round_up_split_creates_split_for_non_whole_dbit(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id, "2025-01-01")
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT amount FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is not None
    assert row["amount"] == "0.25"


def test_ensure_round_up_split_auto_allocates_to_envelope(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id)
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    split = db_conn.execute(
        "SELECT id FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    alloc = db_conn.execute(
        "SELECT * FROM allocations WHERE split_id = ?", (split["id"],)
    ).fetchone()
    assert alloc is not None


def test_ensure_round_up_split_skips_whole_amount(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id)
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("5.00"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is None


def test_ensure_round_up_split_skips_crdt(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id)
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="CRDT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is None


def test_ensure_round_up_split_respects_date_gate(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id, since="2025-07-01")
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is None


def test_ensure_round_up_split_skips_when_disabled(db_conn, saved_account):
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)

    row = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchone()
    assert row is None


def test_ensure_round_up_split_is_idempotent(db_conn, saved_account):
    _enable_round_up(db_conn, saved_account.id)
    tx = insert_transaction(db_conn, make_transaction(
        saved_account.id, amount=Decimal("4.75"),
        credit_debit_indicator="DBIT", date=date(2025, 6, 1)
    ))
    ensure_round_up_split(db_conn, tx.id)
    ensure_round_up_split(db_conn, tx.id)
    ensure_round_up_split(db_conn, tx.id)

    rows = db_conn.execute(
        "SELECT * FROM splits WHERE transaction_id = ? AND is_round_up = 1", (tx.id,)
    ).fetchall()
    assert len(rows) == 1
