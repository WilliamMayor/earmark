"""Tests for split management functions in sync/db.py."""

from decimal import Decimal
from sync.db import (
    ensure_default_split,
    insert_transaction,
)
from tests.conftest import make_transaction


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
