#!/usr/bin/env python3
"""Print a summary of each account in the transactions database."""

import argparse
import sqlite3
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarise accounts in the transactions database")
    parser.add_argument("--db", default="data/transactions.db", help="Path to SQLite database")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    rows = conn.execute("""
        SELECT
            a.institution_name,
            a.name,
            a.currency,
            a.last_synced_at,
            COUNT(t.id)                                                      AS tx_count,
            COALESCE(SUM(CASE WHEN t.credit_debit_indicator = 'CRDT'
                              THEN CAST(t.amount AS REAL) ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN t.credit_debit_indicator = 'DBIT'
                              THEN CAST(t.amount AS REAL) ELSE 0 END), 0)   AS balance
        FROM accounts a
        LEFT JOIN transactions t ON t.account_id = a.id
        GROUP BY a.id
        ORDER BY a.institution_name, a.name
    """).fetchall()

    if not rows:
        print("No accounts found.")
        return

    for row in rows:
        label = " / ".join(filter(None, [row["institution_name"], row["name"]])) or "Unknown"
        balance = f"{row['balance']:,.2f} {row['currency']}"
        synced = row["last_synced_at"][:10] if row["last_synced_at"] else "never"
        print(f"{label}")
        print(f"  Transactions : {row['tx_count']}")
        print(f"  Balance      : {balance}")
        print(f"  Last synced  : {synced}")
        print()

    conn.close()


if __name__ == "__main__":
    main()
