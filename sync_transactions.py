#!/usr/bin/env python3
"""
Sync bank account transactions to a local SQLite database via Lunchflow.

Usage:
  uv run sync_transactions.py           # sync all connected accounts
  uv run sync_transactions.py --db PATH # use a specific database file

Bank connections are managed at https://www.lunchflow.app
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

from sync.client import LunchflowClient
from sync.config import load_config
from sync.db import get_connection, init_schema, upsert_account
from sync.sync import sync_all


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync bank transactions via Lunchflow")
    parser.add_argument("--db", default="data/transactions.db", help="Path to SQLite database")
    args = parser.parse_args()

    config = load_config()
    conn = get_connection(Path(args.db))
    init_schema(conn)

    try:
        with LunchflowClient(config.api_key) as client:
            for api_account in client.list_accounts():
                upsert_account(conn, api_account)

            results = sync_all(conn, client)

        if not results:
            return

        total = sum(r.get("upserted", 0) for r in results)
        errors = [r for r in results if "error" in r]
        print(f"\nDone. {total} transaction(s) synced across {len(results)} account(s).")
        if errors:
            print(f"  {len(errors)} account(s) failed — see errors above.")

    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (401, 403):
            print("Authentication failed. Check your LUNCHFLOW_API_KEY.")
        else:
            print(f"Lunchflow API error: {exc}")
        sys.exit(1)

    except KeyboardInterrupt:
        print("\nCancelled.")
        sys.exit(0)


if __name__ == "__main__":
    main()
