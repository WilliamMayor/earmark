"""Tests for sync/auth.py — session validation, OAuth flow, code extraction."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from sync.auth import _extract_code, get_or_create_session, is_session_valid
from sync.db import get_active_session, insert_session
from sync.models import PsuType, Session
from tests.conftest import make_transaction


# ---------------------------------------------------------------------------
# is_session_valid
# ---------------------------------------------------------------------------

def test_session_valid_when_active_and_not_expired():
    session = Session(
        id=1,
        session_id="s1",
        aspsp_name="Monzo",
        psu_type=PsuType.PERSONAL,
        valid_until=datetime(2099, 1, 1, tzinfo=timezone.utc),
        created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    assert is_session_valid(session) is True


def test_session_invalid_when_expired():
    session = Session(
        id=1,
        session_id="s1",
        aspsp_name="Monzo",
        psu_type=PsuType.PERSONAL,
        valid_until=datetime(2000, 1, 1, tzinfo=timezone.utc),
        created_at=datetime(1999, 1, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    assert is_session_valid(session) is False


def test_session_invalid_when_inactive():
    session = Session(
        id=1,
        session_id="s1",
        aspsp_name="Monzo",
        psu_type=PsuType.PERSONAL,
        valid_until=datetime(2099, 1, 1, tzinfo=timezone.utc),
        created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        is_active=False,
    )
    assert is_session_valid(session) is False


def test_session_valid_with_naive_valid_until():
    """A valid_until without timezone info should be treated as UTC."""
    session = Session(
        id=1,
        session_id="s1",
        aspsp_name="Monzo",
        psu_type=PsuType.PERSONAL,
        valid_until=datetime(2099, 1, 1),  # naive
        created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        is_active=True,
    )
    assert is_session_valid(session) is True


# ---------------------------------------------------------------------------
# _extract_code
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("redirect_url, expected_code", [
    ("https://example.com/callback?code=abc123", "abc123"),
    ("https://example.com/callback?state=xyz&code=mycode", "mycode"),
    ("https://example.com/callback?code=abc%20def", "abc def"),
])
def test_extract_code_from_valid_redirect(redirect_url, expected_code):
    assert _extract_code(redirect_url) == expected_code


@pytest.mark.parametrize("bad_url", [
    "https://example.com/callback?state=only",
    "https://example.com/callback",
    "not-a-url",
])
def test_extract_code_raises_on_missing_code(bad_url):
    with pytest.raises(ValueError, match="No 'code' parameter"):
        _extract_code(bad_url)


# ---------------------------------------------------------------------------
# get_or_create_session — reuses valid session
# ---------------------------------------------------------------------------

def test_get_or_create_session_reuses_valid_session(db_conn, saved_session):
    """When a valid session exists, no API calls should be made."""
    mock_service = MagicMock()
    session, accounts = get_or_create_session(
        db_conn, mock_service, "Monzo", PsuType.PERSONAL, "https://example.com/callback"
    )
    mock_service.get_aspsps.assert_not_called()
    assert session.session_id == saved_session.session_id


def test_get_or_create_session_deactivates_expired_and_reauths(db_conn):
    """When the stored session is expired, it should be deactivated and re-auth triggered."""
    expired = insert_session(
        db_conn,
        Session(
            session_id="expired-sess",
            aspsp_name="Starling",
            psu_type=PsuType.PERSONAL,
            valid_until=datetime(2000, 1, 1, tzinfo=timezone.utc),
            created_at=datetime(1999, 1, 1, tzinfo=timezone.utc),
            is_active=True,
        ),
    )

    mock_service = _make_mock_service("Starling")

    with patch("builtins.input", side_effect=["https://example.com/callback?code=newcode"]):
        session, accounts = get_or_create_session(
            db_conn, mock_service, "Starling", PsuType.PERSONAL, "https://example.com/callback"
        )

    # Old session should now be inactive
    still_active = get_active_session(db_conn, "Starling")
    assert still_active is None or still_active.session_id != "expired-sess"
    # New session persisted
    assert session.session_id == "new-session-id"


def test_get_or_create_session_runs_auth_when_no_session(db_conn):
    mock_service = _make_mock_service("Nationwide")

    with patch("builtins.input", side_effect=["https://example.com/callback?code=testcode"]):
        session, accounts = get_or_create_session(
            db_conn, mock_service, "Nationwide", PsuType.PERSONAL, "https://example.com/callback"
        )

    assert session.session_id == "new-session-id"
    assert len(accounts) == 1
    assert accounts[0].account_uid == "api-account-uid-1"


def test_get_or_create_session_unknown_aspsp_raises(db_conn):
    mock_service = MagicMock()
    mock_service.get_aspsps.return_value = []  # empty — bank not found

    with pytest.raises(ValueError, match="not found"):
        get_or_create_session(
            db_conn, mock_service, "Nationwide", PsuType.PERSONAL, "https://example.com/callback"
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_service(aspsp_name: str):
    """Build a mock EnableBankingService that simulates a successful auth flow."""
    mock_service = MagicMock()

    mock_aspsp = MagicMock()
    mock_aspsp.name = aspsp_name
    mock_service.get_aspsps.return_value = [mock_aspsp]

    mock_auth_response = MagicMock()
    mock_auth_response.url = "https://bank.example.com/auth"
    mock_service.start_user_session.return_value = mock_auth_response

    mock_account = MagicMock()
    mock_account.uid = "api-account-uid-1"
    mock_account.name = "Current Account"
    mock_account.details = None
    mock_account.currency = "GBP"

    mock_session_response = MagicMock()
    mock_session_response.session_id = "new-session-id"
    mock_session_response.accounts = [mock_account]
    mock_session_response.access.valid_until = "2026-12-31T00:00:00+00:00"
    mock_service.authorize_user_session.return_value = mock_session_response

    return mock_service
