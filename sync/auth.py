"""
Session and consent management.

Flow for a new bank:
  1. Look up the ASPSP by name via the API
  2. Start an authorization session → get a redirect URL
  3. Print the URL; the user grants consent in their browser
  4. User pastes back the redirect URL containing ?code=...
  5. Exchange the code for a session_id + account list
  6. Persist session and accounts to the database

On subsequent runs, the stored session is reused until it expires, at which
point the user is prompted to re-authorise.
"""

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import parse_qs, urlparse

from .db import deactivate_session, get_accounts_for_session, get_active_session, insert_session, upsert_account
from .models import Account, PsuType, Session

# Banks supported out of the box; country code used when searching ASPSPs
SUPPORTED_BANKS: dict[str, str] = {
    "Nationwide": "GB",
    "Monzo": "GB",
    "Mettle": "GB",
    "Starling": "GB",
}


def is_session_valid(session: Session) -> bool:
    now = datetime.now(timezone.utc)
    valid_until = session.valid_until
    if valid_until.tzinfo is None:
        valid_until = valid_until.replace(tzinfo=timezone.utc)
    return session.is_active and valid_until > now


def get_or_create_session(
    conn: sqlite3.Connection,
    service,  # EnableBankingService
    aspsp_name: str,
    psu_type: PsuType,
    redirect_url: str,
) -> tuple[Session, list[Account]]:
    """
    Return a valid session and its associated accounts for the given bank.
    If no valid session exists, runs the full OAuth consent flow.
    """
    existing = get_active_session(conn, aspsp_name)

    if existing:
        if is_session_valid(existing):
            accounts = get_accounts_for_session(conn, existing.id)
            return existing, accounts
        else:
            print(f"Session for {aspsp_name} has expired — re-authorising...")
            deactivate_session(conn, existing.id)

    return _run_auth_flow(conn, service, aspsp_name, psu_type, redirect_url)


def _run_auth_flow(
    conn: sqlite3.Connection,
    service,
    aspsp_name: str,
    psu_type: PsuType,
    redirect_url: str,
) -> tuple[Session, list[Account]]:
    country = SUPPORTED_BANKS.get(aspsp_name, "GB")

    aspsps = service.get_aspsps(country=country)
    aspsp = next((a for a in aspsps if a.name == aspsp_name), None)
    if aspsp is None:
        available = sorted(a.name for a in aspsps)
        raise ValueError(f"'{aspsp_name}' not found via Enable Banking. Available: {available}")

    auth_response = service.start_user_session(
        aspsp=aspsp,
        state=uuid.uuid4().hex,
        redirect_url=redirect_url,
        language="en",
        psu_type=psu_type.value,
    )

    print(f"\n{'=' * 60}")
    print(f"Authorising {aspsp_name} ({psu_type.value})")
    print(f"{'=' * 60}")
    print("Open this URL in your browser to grant consent:\n")
    print(f"  {auth_response.url}\n")
    print("After completing authorisation you will be redirected to your")
    print("redirect URL. Paste the full redirect URL (including ?code=...) here:")
    raw = input("> ").strip()

    code = _extract_code(raw)
    session_response = service.authorize_user_session(code=code)

    now = datetime.now(timezone.utc)
    valid_until = datetime.fromisoformat(session_response.access.valid_until)
    if valid_until.tzinfo is None:
        valid_until = valid_until.replace(tzinfo=timezone.utc)

    session = insert_session(
        conn,
        Session(
            session_id=session_response.session_id,
            aspsp_name=aspsp_name,
            psu_type=psu_type,
            valid_until=valid_until,
            created_at=now,
            is_active=True,
        ),
    )

    accounts: list[Account] = []
    for api_account in session_response.accounts:
        account = upsert_account(
            conn,
            Account(
                session_id=session.id,
                account_uid=api_account.uid,
                aspsp_name=aspsp_name,
                name=api_account.name or api_account.details,
                currency=api_account.currency,
            ),
        )
        accounts.append(account)

    return session, accounts


def _extract_code(redirect_url: str) -> str:
    parsed = urlparse(redirect_url)
    params = parse_qs(parsed.query)
    codes = params.get("code")
    if not codes:
        raise ValueError(f"No 'code' parameter in redirect URL: {redirect_url!r}")
    return codes[0]
