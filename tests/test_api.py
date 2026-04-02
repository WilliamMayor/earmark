"""Tests for sync/api.py — do_sync() and HTTP endpoints."""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from sync.api import app, do_sync


def test_do_sync_aggregates_upserted_counts(mocker):
    config = MagicMock()
    config.db_path = ":memory:"
    mocker.patch("sync.api.load_config", return_value=config)
    mocker.patch("sync.api.get_connection", return_value=MagicMock())
    mocker.patch("sync.api.init_schema")
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.list_accounts.return_value = [MagicMock(), MagicMock()]
    mocker.patch("sync.api.LunchflowClient", return_value=mock_client)
    mocker.patch("sync.api.upsert_account")
    mocker.patch("sync.api.sync_all", return_value=[
        {"lunchflow_id": "1", "upserted": 5},
        {"lunchflow_id": "2", "upserted": 7},
    ])

    result = do_sync()

    assert result == {"total_upserted": 12, "accounts_synced": 2, "errors": []}


def test_do_sync_captures_account_errors(mocker):
    config = MagicMock()
    config.db_path = ":memory:"
    mocker.patch("sync.api.load_config", return_value=config)
    mocker.patch("sync.api.get_connection", return_value=MagicMock())
    mocker.patch("sync.api.init_schema")
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.list_accounts.return_value = [MagicMock()]
    mocker.patch("sync.api.LunchflowClient", return_value=mock_client)
    mocker.patch("sync.api.upsert_account")
    mocker.patch("sync.api.sync_all", return_value=[
        {"lunchflow_id": "1", "error": "API timeout"},
    ])

    result = do_sync()

    assert result == {"total_upserted": 0, "accounts_synced": 1, "errors": ["API timeout"]}


def test_health_endpoint():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_sync_endpoint_returns_result(mocker):
    mocker.patch("sync.api.do_sync", return_value={
        "total_upserted": 5,
        "accounts_synced": 2,
        "errors": [],
    })
    with TestClient(app) as client:
        response = client.post("/sync")
    assert response.status_code == 200
    assert response.json() == {"total_upserted": 5, "accounts_synced": 2, "errors": []}


def test_sync_endpoint_returns_500_on_exception(mocker):
    mocker.patch("sync.api.do_sync", side_effect=Exception("Authentication failed"))
    with TestClient(app) as client:
        response = client.post("/sync")
    assert response.status_code == 500
    assert "Authentication failed" in response.json()["detail"]
