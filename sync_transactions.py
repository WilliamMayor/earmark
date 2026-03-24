#!/usr/bin/env python3
"""
Sync bank account transactions to a local SQLite database.

First-time setup for a bank:
  uv run sync_transactions.py --setup Monzo

Regular sync (all registered accounts):
  uv run sync_transactions.py

Options:
  --setup BANK   Authorise a bank and register its accounts.
                 Supported: Nationwide, Monzo, Mettle, Starling
  --db PATH      Path to SQLite database (default: transactions.db)
"""

import argparse
import sys
from pathlib import Path

from enablebanking_sdk.exceptions import EnableBankingException
from enablebanking_sdk.service import EnableBankingIntegration, EnableBankingService

from sync.auth import SUPPORTED_BANKS, get_or_create_session
from sync.config import load_config
from sync.db import get_connection, init_schema
from sync.models import PsuType
from sync.sync import sync_all

_AUTH_ERRORS = {"EXPIRED_SESSION", "CONSENT_EXPIRED", "UNAUTHORIZED"}


def _build_service(config) -> EnableBankingService:
    integration = EnableBankingIntegration(
        base_url=config.base_url,
        app_id=config.app_id,
        certificate=config.private_key,
    )
    return EnableBankingService(integration=integration)


def _prompt_psu_type(bank: str) -> PsuType:
    print(f"\nIs this a personal or business account with {bank}?")
    print("  1. Personal")
    print("  2. Business")
    while True:
        choice = input("Enter 1 or 2: ").strip()
        if choice == "1":
            return PsuType.PERSONAL
        if choice == "2":
            return PsuType.BUSINESS
        print("Please enter 1 or 2.")


def cmd_setup(conn, service, bank: str, config) -> None:
    bank = bank.strip()
    if bank not in SUPPORTED_BANKS:
        supported = ", ".join(sorted(SUPPORTED_BANKS))
        print(f"Unknown bank '{bank}'. Supported banks: {supported}")
        sys.exit(1)

    psu_type = _prompt_psu_type(bank)
    session, accounts = get_or_create_session(conn, service, bank, psu_type, config.redirect_url)

    print(f"\nSession created (expires {session.valid_until.date()}).")
    print(f"Registered {len(accounts)} account(s):")
    for a in accounts:
        print(f"  - {a.name or a.account_uid} ({a.currency})")


def cmd_sync(conn, service) -> None:
    results = sync_all(conn, service)
    if not results:
        return

    total_new = sum(r.get("inserted", 0) for r in results)
    total_flagged = sum(r.get("flagged_unconfirmed", 0) for r in results)
    errors = [r for r in results if "error" in r]

    print(f"\nDone. {total_new} new transaction(s) across {len(results)} account(s).")
    if total_flagged:
        print(
            f"  {total_flagged} transaction(s) flagged 'unconfirmed' — "
            "present locally but not returned by the API."
        )
    if errors:
        print(f"  {len(errors)} account(s) failed — see errors above.")


def _api_error_type(exc: EnableBankingException) -> str:
    try:
        return exc.response.json().get("error", "UNKNOWN")
    except Exception:
        return "UNKNOWN"


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync bank transactions")
    parser.add_argument("--setup", metavar="BANK", help="Authorise a bank")
    parser.add_argument("--db", default="transactions.db", help="Path to SQLite database")
    args = parser.parse_args()

    config = load_config()
    conn = get_connection(Path(args.db))
    init_schema(conn)

    try:
        service = _build_service(config)
        if args.setup:
            cmd_setup(conn, service, args.setup, config)
        else:
            cmd_sync(conn, service)

    except EnableBankingException as exc:
        error_type = _api_error_type(exc)
        if error_type in _AUTH_ERRORS:
            bank_hint = args.setup or "<BANK>"
            print(
                f"Authentication error ({error_type}). "
                f"Re-run with --setup {bank_hint} to re-authorise."
            )
        else:
            print(f"Enable Banking API error: {exc}")
        sys.exit(1)

    except KeyboardInterrupt:
        print("\nCancelled.")
        sys.exit(0)


if __name__ == "__main__":
    main()
